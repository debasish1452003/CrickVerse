"use client";

// Visual identity for a competition/tournament. When a real logo is available
// (CompetitionProfile.logoUrl, resolved from Wikipedia) we render it; otherwise
// (or on a broken image) we fall back to a deterministic coloured crest with the
// competition's acronym, so nothing is ever blank.

import { useState } from "react";
import { competitionInitials, gradient, hueFromName } from "./crest-utils";

export function CompetitionBadge({
  name,
  src,
  size = 44,
  className = "",
  rounded = "rounded-xl",
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const label = name?.trim() || "Other";
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
        className={`shrink-0 ${rounded} bg-white object-contain p-1 ring-1 ring-black/10 ${className}`}
        style={{ width: size, height: size }}
        title={label}
      />
    );
  }
  const hue = hueFromName(label);
  return (
    <div
      className={`grid shrink-0 place-items-center ${rounded} font-extrabold tracking-tight text-white shadow-sm ring-1 ring-black/10 ${className}`}
      style={{
        width: size,
        height: size,
        background: gradient(hue),
        fontSize: Math.max(10, Math.round(size * 0.3)),
      }}
      title={label}
      aria-label={label}
    >
      {competitionInitials(label)}
    </div>
  );
}
