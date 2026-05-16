"use client";

import { useEffect, useState } from "react";

type Me = { authenticated: boolean; user?: { email: string; name: string | null } };

export function UserChip() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : { authenticated: false }))
      .then((data: Me) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe({ authenticated: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!me || !me.authenticated || !me.user) return null;

  return (
    <div className="fixed right-4 top-3 z-30 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <span className="text-slate-600 dark:text-slate-300">{me.user.email}</span>
      <span className="text-slate-300 dark:text-slate-600">|</span>
      <a
        href="/api/auth/logout"
        className="font-medium text-cyan-700 hover:underline dark:text-cyan-400"
      >
        Sign out
      </a>
    </div>
  );
}
