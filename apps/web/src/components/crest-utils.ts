// Pure, server-safe helpers for generated visual identity (no "use client").
// Used both by the client Crest components and directly by server components.

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
export function teamInitials(name: string): string {
  const w = words(name);
  if (w.length === 0) return "?";
  if (w.length === 1) return w[0]!.slice(0, 3).toUpperCase();
  return w.slice(0, 3).map((s) => s[0]).join("").toUpperCase();
}

/**
 * Competition acronym for a generated tournament crest: word-initials of the
 * significant words, up to 4 ("Indian Premier League" → "IPL", "Pakistan Super
 * League" → "PSL"). One-letter tokens (e.g. the "s" from "Men's") are dropped
 * unless they carry a digit (so "T20" survives).
 */
export function competitionInitials(name: string): string {
  const w = words(name).filter((t) => t.length > 1 || /\d/.test(t));
  if (w.length === 0) return "?";
  if (w.length === 1) return w[0]!.slice(0, 3).toUpperCase();
  return w.slice(0, 4).map((s) => s[0]).join("").toUpperCase();
}

/** Player avatar initials: first + last initial ("Virat Kohli" → "VK"). */
export function playerInitials(name: string): string {
  const w = words(name);
  if (w.length === 0) return "?";
  if (w.length === 1) return w[0]!.slice(0, 2).toUpperCase();
  return (w[0]![0]! + w[w.length - 1]![0]!).toUpperCase();
}

// A dark, slightly saturated diagonal gradient keyed off the name's hue — sits
// well on the app's near-black surfaces while still giving each entity a colour.
export function gradient(hue: number): string {
  return `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 50% 20%))`;
}

/** A solid/gradient background for a team, preferring its brand colour. */
export function teamBackground(name: string, primaryColor?: string | null): string {
  if (primaryColor) return primaryColor;
  return gradient(hueFromName(name));
}
