import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function Navbar() {
  const session = await auth();

  return (
    <nav className="navbar">
      <Link href="/" className="navbar__brand">
        🏏 <span>CrickVerse</span>
      </Link>
      <div className="navbar__links">
        <Link href="/">Live &amp; Fixtures</Link>
        {session?.user ? (
          <>
            <Link href="/dashboard">Dashboard</Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                style={{
                  background: "transparent",
                  color: "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0.3rem 0.6rem",
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </div>
    </nav>
  );
}
