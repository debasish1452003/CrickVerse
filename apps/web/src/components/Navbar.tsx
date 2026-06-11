import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function Navbar() {
  // Browsing must never depend on auth being fully configured — if the auth
  // layer isn't set up (e.g. no AUTH_SECRET), treat the visitor as signed out.
  let session: Awaited<ReturnType<typeof auth>> = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  return (
    <header className="sticky top-0 z-30 px-5 pt-4">
      <nav className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-5 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span aria-hidden>🏏</span>
          <span>
            Crick<span className="text-accent">Verse</span>
          </span>
        </Link>
        <div className="flex items-center gap-5 text-sm text-muted">
          <Link href="/" className="transition-colors hover:text-fg">
            Matches
          </Link>
          {session?.user ? (
            <>
              <Link href="/dashboard" className="transition-colors hover:text-fg">
                Dashboard
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="rounded-lg border border-line px-3 py-1.5 text-fg transition-colors hover:border-accent/50">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-black transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
