// Resolve a real league / franchise logo from English Wikipedia. MediaWiki's
// `pageimages` deliberately skips non-free files, and most cricket logos are
// trademarked (so absent from Wikimedia Commons under a free licence). So we
// instead list the files used on the article (`prop=images`), score them to pick
// the logo, and link it via Special:FilePath (which serves en.wikipedia-local
// non-free files too). These logos are trademarked — used here for a personal /
// educational project, not a free-licence claim.

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const UA = "CrickVerse/1.0 (educational project)";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function words(name: string): string[] {
  return name
    .replace(/\(.*?\)/g, " ")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.toLowerCase());
}

function acronym(name: string): string {
  return words(name)
    .filter((w) => !["the", "of", "and"].includes(w))
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Files that are page furniture, not the subject's logo.
const NEGATIVE = /commons-logo|wiki|ambox|edit-|question_book|folder|symbol|red_x|yes_check|disambig|pictogram|flag_of|crystal|nuvola|magnify|portal|padlock|loudspeaker|increase|decrease|steady|sound-icon|kit[ _]|kit_body|stadium|\.jpg$|\.jpeg$/i;

function scoreFile(file: string, ws: string[], acro: string): number {
  const fl = file.toLowerCase();
  if (NEGATIVE.test(fl)) return -100;
  if (!/\.(svg|png|jpg|jpeg)$/.test(fl)) return -100;
  let s = 0;
  if (fl.includes("logo")) s += 3;
  if (fl.endsWith(".svg")) s += 2;
  else if (fl.endsWith(".png")) s += 1;
  s += ws.filter((w) => fl.includes(w)).length;
  // Acronym-named logo files (CPL.svg, PSL.svg, SA20Logo.png).
  const base = file.replace(/^File:/i, "").replace(/\.[a-z]+$/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (acro.length >= 2 && base.startsWith(acro)) s += 3;
  return s;
}

/** fetch with a hard timeout so a stalled connection can't hang the run. */
async function fetchT(url: string, ms = 12000): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function listImages(title: string): Promise<string[]> {
  const url =
    `${WIKI_API}?action=query&format=json&redirects=1&prop=images&imlimit=200&titles=` +
    encodeURIComponent(title);
  // One retry with backoff — a burst of requests can draw a 429 (or a stall).
  let res = await fetchT(url);
  if (!res || !res.ok) {
    await sleep(2500);
    res = await fetchT(url);
  }
  if (!res || !res.ok) return [];
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { images?: { title: string }[] }> };
  };
  const pages = data.query?.pages ?? {};
  const files: string[] = [];
  for (const p of Object.values(pages)) for (const im of p.images ?? []) files.push(im.title);
  return files;
}

function filePathUrl(file: string): string {
  const name = file.replace(/^File:/i, "").replace(/ /g, "_");
  return `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=256`;
}

/**
 * Best logo URL for an entity, or null. Tries the name, then "<name> (cricket)"
 * for disambiguation. Returns the resolved URL + the Wikipedia title used.
 */
export async function resolveWikiLogo(
  name: string,
): Promise<{ logoUrl: string; wikiTitle: string } | null> {
  const ws = words(name);
  const acro = acronym(name);
  const candidates = [name, `${name} (cricket)`];
  for (const title of candidates) {
    const files = await listImages(title);
    if (files.length === 0) continue;
    let best: { file: string; score: number } | null = null;
    for (const f of files) {
      const sc = scoreFile(f, ws, acro);
      if (!best || sc > best.score) best = { file: f, score: sc };
    }
    if (best && best.score >= 3) {
      return { logoUrl: filePathUrl(best.file), wikiTitle: title };
    }
  }
  return null;
}
