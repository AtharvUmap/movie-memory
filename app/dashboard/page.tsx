import { redirect } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { signOut } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { getDisplayName } from "@/lib/display";

export const instant = false; // blocks on the session read; see app/page.tsx

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  // The dashboard is built around the movie, so finish onboarding first.
  if (!user.favoriteMovie) redirect("/onboarding");

  const displayName = getDisplayName(user);

  async function logout() {
    "use server";
    // Deletes the Session row and clears the cookie.
    await signOut({ redirectTo: "/" });
  }

  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-4">
          <UserAvatar name={displayName} image={user.image} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{displayName}</h1>
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
              {user.email}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Favorite movie
          </p>
          <p className="mt-1 text-lg font-medium break-words">
            {user.favoriteMovie}
          </p>
        </div>

        <form action={logout} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-full border border-zinc-300 px-6 py-2.5 font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Log out
          </button>
        </form>
      </div>
    </main>
  );
}
