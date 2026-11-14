import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";

export const instant = false; // blocks on the session read; see app/page.tsx

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  // The dashboard is built around the movie, so finish onboarding first.
  if (!user.favoriteMovie) redirect("/onboarding");

  // Placeholder: the real dashboard is built in T6.
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Favorite movie: {user.favoriteMovie}
      </p>
    </main>
  );
}
