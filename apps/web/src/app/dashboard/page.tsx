import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Navbar } from "@/components/Navbar";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="py-12">
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome, {session.user.name ?? "cricket fan"}
          </h1>
          <p className="mt-2 text-muted">Your favorite players and teams will live here.</p>
        </section>
        <div className="card grid place-items-center gap-2 p-12 text-center text-sm text-muted">
          Favorites &amp; a personalized feed are coming next.
        </div>
      </main>
    </>
  );
}
