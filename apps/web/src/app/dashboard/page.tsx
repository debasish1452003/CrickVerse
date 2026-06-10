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
      <main className="container">
        <h1 className="page-title">Your dashboard</h1>
        <p className="muted">Signed in as {session.user.name ?? session.user.email}.</p>
        <p className="muted">Favorite players/teams and a personalized feed land in Phase 8.</p>
      </main>
    </>
  );
}
