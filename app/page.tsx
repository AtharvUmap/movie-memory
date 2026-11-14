import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";

// This page always depends on the session, so let it block on the server
// instead of streaming the session read behind a <Suspense> boundary.
// Note: with Cache Components, redirect() here still arrives as a client-side
// redirect (the 200 shell is already sent); proxy.ts handles real 307s.
export const instant = false;

export default async function Home() {
  const user = await getCurrentUser();

  // Signed-in users never see the landing page: first-timers go to
  // onboarding, returning users go to the dashboard.
  if (user) {
    redirect(user.favoriteMovie ? "/dashboard" : "/onboarding");
  }

  async function signInWithGoogle() {
    "use server";
    // Come back to "/" so the logic above decides onboarding vs dashboard.
    await signIn("google", { redirectTo: "/" });
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Movie Memory
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Tell us your favorite movie and get a fun fact about it every visit.
        </p>
      </div>
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
