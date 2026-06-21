import type { ReactNode } from "react";

export function DataScopeNote({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`rounded-lg border border-line bg-black/[0.02] px-4 py-2.5 text-xs text-muted ${className}`}>
      {children}
    </p>
  );
}
