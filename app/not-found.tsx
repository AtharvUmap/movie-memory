import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-zinc-500">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        This page doesn&apos;t exist. Let&apos;s get you back to your movie.
      </p>
      <Link
        href="/"
        className="rounded-full bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Go home
      </Link>
    </main>
  );
}
