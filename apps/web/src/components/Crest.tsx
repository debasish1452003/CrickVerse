"use client";

// Visual identity for teams and players. When a real image (Wikimedia Commons
// photo, franchise logo, or national flag from TeamProfile/PlayerProfile) is
// available we render it; on missing/broken image we fall back to a deterministic
// coloured monogram so nothing is ever faceless. The fallback is identical to the
// pre-enrichment behaviour, so every existing call-site keeps working with no src.

import { useState } from "react";
import {
  gradient,
  hueFromName,
  playerInitials,
  teamBackground,
  teamInitials,
} from "./crest-utils";

export { hueFromName } from "./crest-utils";

export function TeamBadge({
  name,
  src,
  primaryColor,
  size = 36,
  className = "",
  rounded = "rounded-lg",
}: {
  name: string | null | undefined;
  src?: string | null;
  primaryColor?: string | null;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const label = name?.trim() || "?";
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`shrink-0 ${rounded} bg-white/5 object-contain p-0.5 ring-1 ring-white/10 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`grid shrink-0 place-items-center ${rounded} font-bold text-white ring-1 ring-white/10 ${className}`}
      style={{
        width: size,
        height: size,
        background: teamBackground(label, primaryColor),
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
  src,
  size = 40,
  className = "",
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const label = name?.trim() || "?";
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full bg-white/5 object-cover ring-1 ring-white/10 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
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
