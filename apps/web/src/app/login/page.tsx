import { signIn } from "@/auth";
import { Navbar } from "@/components/Navbar";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5">
        <div className="card w-full p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-muted">Sign in to follow players and teams.</p>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
            className="mt-6"
          >
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-medium text-black transition-transform hover:-translate-y-0.5"
            >
              Continue with Google
            </button>
          </form>
          <p className="mt-4 text-xs text-muted">We only use your Google profile to identify you.</p>
        </div>
      </main>
    </>
  );
}
