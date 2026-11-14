import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { getCurrentUser } from "@/lib/current-user";

export const instant = false; // blocks on the session read; see app/page.tsx

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  // Onboarding is first-time only.
  if (user.favoriteMovie) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Welcome to Movie Memory</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          What&apos;s your favorite movie?
        </p>
      </div>
      <OnboardingForm />
    </main>
  );
}
