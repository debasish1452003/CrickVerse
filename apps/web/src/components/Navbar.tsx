import type { Session } from "next-auth";
import Link from "next/link";
import { auth, signOut } from "@/auth";

const NAV = [
  { href: "/matches", label: "Matches" },
  { href: "/series", label: "Series" },
  { href: "/teams", label: "Teams" },
  { href: "/players", label: "Players" },
  { href: "/rankings", label: "Rankings" },
];

export async function Navbar() {
  // Browsing must never depend on auth being fully configured — if the auth
  // layer isn't set up (e.g. no AUTH_SECRET), treat the visitor as signed out.
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  return (
    <header className="sticky top-0 z-30 bg-brand text-white shadow-[0_1px_0_rgba(0,0,0,0.14)]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span aria-hidden>🏏</span>
          <span>
            Crick<span className="text-[#9ff0c4]">Verse</span>
          </span>
        </Link>

        <div className="flex items-center gap-0.5 text-sm font-medium">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-1.5 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            >
              {n.label}
            </Link>
          ))}
          {session?.user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-1.5 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                Dashboard
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="ml-1 rounded-md border border-white/30 px-3 py-1.5 text-white transition-colors hover:bg-white/10">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="ml-1 rounded-md bg-white px-3.5 py-1.5 font-semibold text-brand transition-colors hover:bg-white/90"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
