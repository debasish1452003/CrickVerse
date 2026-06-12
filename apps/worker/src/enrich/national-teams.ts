// Map of international side name (as Cricsheet writes it) → ISO code for the flag
// CDN + a representative colour. flagcdn.com serves free flag images and supports
// GB home-nation subdivisions (gb-eng, gb-sct, gb-wls). West Indies / ICC XI etc.
// have no national flag, so they fall back to the generated crest.

export interface NationalTeam {
  iso: string | null; // flagcdn code; null ⇒ no flag (crest fallback)
  country: string;
  color: string;
}

export const NATIONAL_TEAMS: Record<string, NationalTeam> = {
  india: { iso: "in", country: "India", color: "#1565c0" },
  australia: { iso: "au", country: "Australia", color: "#0b5d1e" },
  england: { iso: "gb-eng", country: "England", color: "#1f3a93" },
  pakistan: { iso: "pk", country: "Pakistan", color: "#01411c" },
  "south africa": { iso: "za", country: "South Africa", color: "#007749" },
  "new zealand": { iso: "nz", country: "New Zealand", color: "#000000" },
  "sri lanka": { iso: "lk", country: "Sri Lanka", color: "#1b5e9b" },
  bangladesh: { iso: "bd", country: "Bangladesh", color: "#006a4e" },
  "west indies": { iso: null, country: "West Indies", color: "#7b0000" },
  afghanistan: { iso: "af", country: "Afghanistan", color: "#d32011" },
  zimbabwe: { iso: "zw", country: "Zimbabwe", color: "#d40000" },
  ireland: { iso: "ie", country: "Ireland", color: "#169b62" },
  netherlands: { iso: "nl", country: "Netherlands", color: "#ff6f00" },
  scotland: { iso: "gb-sct", country: "Scotland", color: "#0065bf" },
  nepal: { iso: "np", country: "Nepal", color: "#dc143c" },
  "united arab emirates": { iso: "ae", country: "United Arab Emirates", color: "#00732f" },
  oman: { iso: "om", country: "Oman", color: "#c8102e" },
  "united states of america": { iso: "us", country: "United States", color: "#3c3b6e" },
  "papua new guinea": { iso: "pg", country: "Papua New Guinea", color: "#c8102e" },
  namibia: { iso: "na", country: "Namibia", color: "#003580" },
  "hong kong": { iso: "hk", country: "Hong Kong", color: "#de2910" },
  canada: { iso: "ca", country: "Canada", color: "#d52b1e" },
  kenya: { iso: "ke", country: "Kenya", color: "#006600" },
  bermuda: { iso: "bm", country: "Bermuda", color: "#00247d" },
  jersey: { iso: "je", country: "Jersey", color: "#cc0000" },
  guernsey: { iso: "gg", country: "Guernsey", color: "#cc0000" },
  italy: { iso: "it", country: "Italy", color: "#008c45" },
  germany: { iso: "de", country: "Germany", color: "#000000" },
  denmark: { iso: "dk", country: "Denmark", color: "#c8102e" },
  malaysia: { iso: "my", country: "Malaysia", color: "#010066" },
  singapore: { iso: "sg", country: "Singapore", color: "#ef3340" },
  uganda: { iso: "ug", country: "Uganda", color: "#000000" },
  qatar: { iso: "qa", country: "Qatar", color: "#8a1538" },
  kuwait: { iso: "kw", country: "Kuwait", color: "#007a3d" },
  bhutan: { iso: "bt", country: "Bhutan", color: "#ff4e12" },
  bahrain: { iso: "bh", country: "Bahrain", color: "#ce1126" },
  "saudi arabia": { iso: "sa", country: "Saudi Arabia", color: "#006c35" },
  tanzania: { iso: "tz", country: "Tanzania", color: "#1eb53a" },
  nigeria: { iso: "ng", country: "Nigeria", color: "#008751" },
  botswana: { iso: "bw", country: "Botswana", color: "#75aadb" },
  mozambique: { iso: "mz", country: "Mozambique", color: "#007168" },
  rwanda: { iso: "rw", country: "Rwanda", color: "#00a1de" },
  mali: { iso: "ml", country: "Mali", color: "#14b53a" },
  france: { iso: "fr", country: "France", color: "#0055a4" },
  spain: { iso: "es", country: "Spain", color: "#aa151b" },
  portugal: { iso: "pt", country: "Portugal", color: "#006600" },
  austria: { iso: "at", country: "Austria", color: "#ed2939" },
  belgium: { iso: "be", country: "Belgium", color: "#000000" },
  norway: { iso: "no", country: "Norway", color: "#ba0c2f" },
  finland: { iso: "fi", country: "Finland", color: "#003580" },
  sweden: { iso: "se", country: "Sweden", color: "#006aa7" },
  czechia: { iso: "cz", country: "Czechia", color: "#11457e" },
  romania: { iso: "ro", country: "Romania", color: "#002b7f" },
  "czech republic": { iso: "cz", country: "Czechia", color: "#11457e" },
  thailand: { iso: "th", country: "Thailand", color: "#a51931" },
  japan: { iso: "jp", country: "Japan", color: "#bc002d" },
  philippines: { iso: "ph", country: "Philippines", color: "#0038a8" },
  indonesia: { iso: "id", country: "Indonesia", color: "#ce1126" },
  fiji: { iso: "fj", country: "Fiji", color: "#62b5e5" },
  vanuatu: { iso: "vu", country: "Vanuatu", color: "#d21034" },
  samoa: { iso: "ws", country: "Samoa", color: "#002b7f" },
  cyprus: { iso: "cy", country: "Cyprus", color: "#d57800" },
  malta: { iso: "mt", country: "Malta", color: "#cf142b" },
  gibraltar: { iso: "gi", country: "Gibraltar", color: "#da000c" },
  ghana: { iso: "gh", country: "Ghana", color: "#006b3f" },
  greece: { iso: "gr", country: "Greece", color: "#0d5eaf" },
  hungary: { iso: "hu", country: "Hungary", color: "#436f4d" },
  israel: { iso: "il", country: "Israel", color: "#0038b8" },
  luxembourg: { iso: "lu", country: "Luxembourg", color: "#00a1de" },
  switzerland: { iso: "ch", country: "Switzerland", color: "#d52b1e" },
  turkey: { iso: "tr", country: "Turkey", color: "#e30a17" },
  "isle of man": { iso: "im", country: "Isle of Man", color: "#cf142b" },
  cameroon: { iso: "cm", country: "Cameroon", color: "#007a5e" },
  eswatini: { iso: "sz", country: "Eswatini", color: "#3e5eb9" },
  seychelles: { iso: "sc", country: "Seychelles", color: "#d62828" },
  "st helena": { iso: "sh", country: "St Helena", color: "#00247d" },
  mexico: { iso: "mx", country: "Mexico", color: "#006847" },
  argentina: { iso: "ar", country: "Argentina", color: "#74acdf" },
  brazil: { iso: "br", country: "Brazil", color: "#009c3b" },
  chile: { iso: "cl", country: "Chile", color: "#0039a6" },
  peru: { iso: "pe", country: "Peru", color: "#d91023" },
  panama: { iso: "pa", country: "Panama", color: "#005293" },
  "costa rica": { iso: "cr", country: "Costa Rica", color: "#002b7f" },
  belize: { iso: "bz", country: "Belize", color: "#003f87" },
  cayman: { iso: "ky", country: "Cayman Islands", color: "#00247d" },
  "cayman islands": { iso: "ky", country: "Cayman Islands", color: "#00247d" },
};

/** Normalize a team name to a lookup/PK key. */
export function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** flagcdn URL for an ISO code (w320 raster). */
export function flagUrl(iso: string): string {
  return `https://flagcdn.com/w320/${iso}.png`;
}
