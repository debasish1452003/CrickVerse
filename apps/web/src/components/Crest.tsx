// Generated visual identity — deterministic colored monograms for teams and
// players. Cricsheet ships no logos or photos, so instead of leaving every team
// and all 13k players faceless we derive a stable color + initials from the name.
// Pure and deterministic: the same name always renders the same color, no assets,
// no network, no external dependency.

/** Stable string hash → hue (0–359). Same name ⇒ same hue, every render. */
export function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

function words(name: string): string[] {
  return name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
}

/** Team crest initials: word-initials, up to 3 letters ("Mumbai Indians" → "MI"). */
function teamInitials(name: string): string {
  const w = words(name);
  if (w.length === 0) return "?";
  if (w.length === 1) return w[0]!.slice(0, 3).toUpperCase();
  return w.slice(0, 3).map((s) => s[0]).join("").toUpperCase();
}

/** Player avatar initials: first + last initial ("Virat Kohli" → "VK"). */
function playerInitials(name: string): string {
  const w = words(name);
  if (w.length === 0) return "?";
  if (w.length === 1) return w[0]!.slice(0, 2).toUpperCase();
  return (w[0]![0]! + w[w.length - 1]![0]!).toUpperCase();
}

// A dark, slightly saturated diagonal gradient keyed off the name's hue — sits
// well on the app's near-black surfaces while still giving each entity a colour.
function gradient(hue: number): string {
  return `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 50% 20%))`;
}

export function TeamBadge({
  name,
  size = 36,
  className = "",
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const label = name?.trim() || "?";
  const hue = hueFromName(label);
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-lg font-bold text-white ring-1 ring-white/10 ${className}`}
      style={{
        width: size,
        height: size,
        background: gradient(hue),
        fontSize: Math.max(9, Math.round(size * 0.32)),
      }}
      title={label}
      aria-label={label}
    >
      {teamInitials(label)}
    </div>
  );
}

export function PlayerAvatar({
  name,
  size = 40,
  className = "",
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const label = name?.trim() || "?";
  const hue = hueFromName(label);
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ring-1 ring-white/10 ${className}`}
      style={{
        width: size,
        height: size,
        background: gradient(hue),
        fontSize: Math.max(10, Math.round(size * 0.36)),
      }}
      title={label}
      aria-label={label}
    >
      {playerInitials(label)}
    </div>
  );
}
