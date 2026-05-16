"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginButton() {
  const params = useSearchParams();
  const returnTo = params.get("returnTo") ?? "/";
  const href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
    >
      Sign in with Cognito
    </a>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          WP Opportunity Harvester
        </h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Sign in to view plugin opportunities, run categorization, and manage data.
        </p>
        <Suspense fallback={null}>
          <LoginButton />
        </Suspense>
      </div>
    </div>
  );
}
