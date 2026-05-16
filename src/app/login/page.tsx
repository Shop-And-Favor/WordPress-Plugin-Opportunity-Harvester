"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function SignInButton() {
  const params = useSearchParams();
  const returnTo = params.get("returnTo") ?? "/";
  const href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <a
      href={href}
      className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-600/20 transition-all hover:from-cyan-500 hover:to-blue-500 hover:shadow-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
    >
      <span>Sign in</span>
      <svg
        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
          clipRule="evenodd"
        />
      </svg>
    </a>
  );
}

export default function LoginPage() {
  useEffect(() => {
    const stored = localStorage.getItem("darkMode");
    document.documentElement.classList.toggle("dark", stored === "true");
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 dark:bg-slate-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-cyan-300/30 blur-3xl dark:bg-cyan-500/10" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-blue-300/30 blur-3xl dark:bg-blue-500/10" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80 sm:p-10">
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/30">
              <svg
                className="h-6 w-6 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3v18h18" />
                <path d="M7 14l4-4 4 4 5-7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Opportunity Harvester
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Sign in to continue to your dashboard
            </p>
          </div>

          <Suspense fallback={null}>
            <SignInButton />
          </Suspense>

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Protected by single sign-on.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
          © {new Date().getFullYear()} WP Opportunity Harvester
        </p>
      </div>
    </div>
  );
}
