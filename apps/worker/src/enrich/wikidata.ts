// Minimal Wikidata + Wikimedia Commons client for the enrichment pipeline.
// Players are joined to Wikidata by ESPNcricinfo id (property P2697); from the
// resolved Q-item we read image (P18), date of birth (P569), birthplace (P19)
// and speciality/role (P413). Commons image license/author is fetched
// separately for CC-BY-SA attribution. Plain global fetch + polite batching —
// the SPARQL endpoint is fine with a handful of large VALUES queries.

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const UA = "CrickVerse/1.0 (educational cricket data project; debasishrana@evawinoptimize.com)";

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, attempt = 0): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt < 3) {
      await sleep(1000 * (attempt + 1));
      return fetchJson(url, attempt + 1);
    }
    throw err;
  }
}

interface SparqlBinding {
  [key: string]: { type: string; value: string; datatype?: string } | undefined;
}
interface SparqlResponse {
  results: { bindings: SparqlBinding[] };
}

export interface WikidataPlayer {
  wikidataId: string;
  imageFile?: string; // raw Commons filename (no "File:" prefix)
  photoUrl?: string;
  photoFilePage?: string;
  dateOfBirth?: string; // yyyy-mm-dd
  birthPlace?: string;
  role?: string;
}

/** Q-item id from a full entity URI ("http://www.wikidata.org/entity/Q213854" → "Q213854"). */
function qid(uri: string): string {
  const i = uri.lastIndexOf("/");
  return i >= 0 ? uri.slice(i + 1) : uri;
}

/** Commons "Special:FilePath/..." URI → { file, thumbUrl, filePage }. */
function commonsImage(uri: string): Pick<WikidataPlayer, "imageFile" | "photoUrl" | "photoFilePage"> {
  const marker = "Special:FilePath/";
  const idx = uri.indexOf(marker);
  const encoded = idx >= 0 ? uri.slice(idx + marker.length) : uri;
  const file = decodeURIComponent(encoded);
  const enc = encodeURIComponent(file);
  return {
    imageFile: file,
    // Special:FilePath redirects to the actual file; ?width= yields a thumbnail.
    photoUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${enc}?width=400`,
    photoFilePage: `https://commons.wikimedia.org/wiki/File:${enc}`,
  };
}

/**
 * Resolve a batch of ESPNcricinfo ids to Wikidata player data in one SPARQL
 * query. Returns Map<cricinfoId, WikidataPlayer>. First binding per id wins
 * (a player can have several images / birthplaces; we take one deterministically).
 */
export async function queryPlayersByCricinfoIds(ids: string[]): Promise<Map<string, WikidataPlayer>> {
  if (ids.length === 0) return new Map();
  const values = ids.map((id) => `"${id.replace(/"/g, "")}"`).join(" ");
  const query = `SELECT ?cid ?item ?image ?dob ?birthPlaceLabel ?roleLabel WHERE {
  VALUES ?cid { ${values} }
  ?item wdt:P2697 ?cid.
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?item wdt:P569 ?dob. }
  OPTIONAL { ?item wdt:P19 ?birthPlace. }
  OPTIONAL { ?item wdt:P413 ?role. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const data = (await fetchJson(url)) as SparqlResponse;

  const out = new Map<string, WikidataPlayer>();
  for (const b of data.results.bindings) {
    const cid = b.cid?.value;
    if (!cid || out.has(cid)) continue;
    const rec: WikidataPlayer = { wikidataId: qid(b.item?.value ?? "") };
    if (b.image?.value) Object.assign(rec, commonsImage(b.image.value));
    if (b.dob?.value) rec.dateOfBirth = b.dob.value.slice(0, 10);
    if (b.birthPlaceLabel?.value && !/^Q\d+$/.test(b.birthPlaceLabel.value)) {
      rec.birthPlace = b.birthPlaceLabel.value;
    }
    if (b.roleLabel?.value && !/^Q\d+$/.test(b.roleLabel.value)) rec.role = b.roleLabel.value;
    out.set(cid, rec);
  }
  return out;
}

export interface CommonsLicense {
  credit?: string;
  license?: string;
}

const stripHtml = (s: string): string =>
  s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/**
 * Fetch author + license for a batch of Commons files (≤50 per API call), for
 * CC-BY-SA attribution. Returns Map<filename, {credit, license}>.
 */
export async function fetchCommonsLicenses(files: string[]): Promise<Map<string, CommonsLicense>> {
  const out = new Map<string, CommonsLicense>();
  const unique = [...new Set(files)];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const titles = chunk.map((f) => `File:${f}`).join("|");
    const url =
      `${COMMONS_API}?action=query&format=json&prop=imageinfo&iiprop=extmetadata` +
      `&titles=${encodeURIComponent(titles)}`;
    let data: {
      query?: { pages?: Record<string, { title?: string; imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }> };
    };
    try {
      data = (await fetchJson(url)) as typeof data;
    } catch {
      continue; // license is best-effort; skip the chunk on failure
    }
    const pages = data.query?.pages ?? {};
    for (const page of Object.values(pages)) {
      const title = page.title?.replace(/^File:/, "");
      const meta = page.imageinfo?.[0]?.extmetadata;
      if (!title || !meta) continue;
      const credit = meta.Artist?.value ? stripHtml(meta.Artist.value) : undefined;
      const license = meta.LicenseShortName?.value ? stripHtml(meta.LicenseShortName.value) : undefined;
      out.set(title, { credit, license });
    }
    await sleep(300);
  }
  return out;
}

export interface WikidataTeamLogo {
  wikidataId: string;
  logoFile?: string;
  logoUrl?: string;
}

/**
 * Best-effort franchise-logo lookup: match teams by exact English label and read
 * the logo image (P154). Many cricket franchise crests are trademarked and thus
 * NOT on Commons, so coverage is partial — callers fall back to flags / monograms.
 */
export async function queryTeamLogosByLabel(names: string[]): Promise<Map<string, WikidataTeamLogo>> {
  if (names.length === 0) return new Map();
  const values = names
    .map((n) => `"${n.replace(/["\\]/g, "")}"@en`)
    .join(" ");
  const query = `SELECT ?label ?item ?logo WHERE {
  VALUES ?label { ${values} }
  ?item rdfs:label ?label.
  ?item wdt:P154 ?logo.
}`;
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  let data: SparqlResponse;
  try {
    data = (await fetchJson(url)) as SparqlResponse;
  } catch {
    return new Map();
  }
  const out = new Map<string, WikidataTeamLogo>();
  for (const b of data.results.bindings) {
    const label = b.label?.value;
    if (!label || out.has(label) || !b.logo?.value) continue;
    const img = commonsImage(b.logo.value);
    out.set(label, { wikidataId: qid(b.item?.value ?? ""), logoFile: img.imageFile, logoUrl: img.photoUrl });
  }
  return out;
}
