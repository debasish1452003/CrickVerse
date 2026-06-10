import { signIn } from "@/auth";
import { Navbar } from "@/components/Navbar";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main className="container">
        <h1 className="page-title">Sign in</h1>
        <p className="muted">Sign in to follow players and teams.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            style={{
              marginTop: "1rem",
              padding: "0.65rem 1.1rem",
              borderRadius: 8,
              background: "#fff",
              color: "#111",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Continue with Google
          </button>
        </form>
      </main>
    </>
  );
}
