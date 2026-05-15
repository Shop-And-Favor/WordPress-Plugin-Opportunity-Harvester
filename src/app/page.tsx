"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type RunPayload = {
  run: {
    id: number;
    status: string;
    queryTarget: number;
    topN: number;
    generatedCount: number;
    insertedCount: number;
    processedCount: number;
  } | null;
  stats?: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  topCategories?: Array<{
    id: number;
    category: string;
    subcategory: string;
    pluginCount: number;
    opportunityScore: number | null;
    opportunityTier: string | null;
    plugins: Array<{
      plugin: {
        id: number;
        name: string;
        slug: string;
        pluginUrl: string;
        activeInstalls: number | null;
        ratingCount: number | null;
        rating: number | null;
        demandScore: number | null;
        competitionScore: number | null;
        satisfactionScore: number | null;
        freshnessScore: number | null;
        opportunityScore: number | null;
        opportunityTier: string | null;
      };
    }>;
  }>;
  topPlugins?: Array<{
    id: number;
    name: string;
    slug: string;
    pluginUrl: string;
    activeInstalls: number | null;
    ratingCount: number | null;
    rating: number | null;
    downloadedCount: number | null;
    demandScore: number | null;
    competitionScore: number | null;
    satisfactionScore: number | null;
    freshnessScore: number | null;
    opportunityScore: number | null;
    opportunityTier: string | null;
  }>;
  queries?: Array<{
    id: number;
    queryText: string;
    queryType: string;
    status: string;
    opportunityScore: number | null;
    opportunityTier: string | null;
    lowDemandSignal: boolean;
    lastError: string | null;
  }>;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string; details?: string };

  if (!response.ok) {
    // Provide helpful error message
    if (data.error) {
      throw new Error(data.error);
    }
    throw new Error("Request failed");
  }

  return data;
}

export default function Home() {
  const [queryTarget, setQueryTarget] = useState(100);
  const [topN, setTopN] = useState(10);
  const [batchSize, setBatchSize] = useState(5);
  const [seedText, setSeedText] = useState("");
  const [starting, setStarting] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [truncating, setTruncating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<RunPayload>({ run: null });
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);
  const [expandedPluginSlug, setExpandedPluginSlug] = useState<string | null>(null);
  const anyLoading = starting || continuing || stopping || categorizing || truncating || recalculating;
  const [darkMode, setDarkMode] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("darkMode") === "true",
  );
  const [retryFailed, setRetryFailed] = useState(false);
  const [autoContinue, setAutoContinue] = useState(false);
  const stopAutoContinueRef = useRef(false);
  const continueAbortRef = useRef<AbortController | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Acquire Screen Wake Lock while a run is active so the OS doesn't sleep
  // mid-batch. Re-acquire if the tab becomes visible again (browser releases
  // the lock automatically when the page is hidden).
  useEffect(() => {
    const isRunning = starting || continuing;
    if (!isRunning || !("wakeLock" in navigator)) return;

    let released = false;

    async function acquire() {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Permission denied or unsupported — not critical
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !released) {
        void acquire();
      }
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [starting, continuing]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("darkMode", String(next));
    document.documentElement.classList.toggle("dark", next);
  }

  function clampInt(value: number, min: number, max: number, fallback: number) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.trunc(value)));
  }

  const progress = useMemo(() => {
    const stats = payload.stats;
    if (!stats) {
      return 0;
    }

    const total = stats.pending + stats.processing + stats.completed + stats.failed;
    if (total === 0) {
      return 0;
    }

    return Math.round(((stats.completed + stats.failed) / total) * 100);
  }, [payload.stats]);

  const activityMessage = useMemo((): { main: string; detail: string | null } | null => {
    const { run, stats, queries } = payload;
    const processingQuery = queries?.find((q) => q.status === "processing");
    const lastFailed = queries?.filter((q) => q.status === "failed" && q.lastError).at(-1);
    const detail = lastFailed ? `Last failure: "${lastFailed.queryText}" — ${lastFailed.lastError}` : null;

    if (loadingMessage) {
      const queryLabel = processingQuery ? ` · "${processingQuery.queryText}"` : "";
      return { main: `${loadingMessage}${queryLabel}`, detail };
    }
    if (!run) return null;

    if (run.status === "running") {
      const pending = stats?.pending ?? 0;
      const processing = stats?.processing ?? 0;
      const completed = stats?.completed ?? 0;
      const queryLabel = processingQuery ? ` · "${processingQuery.queryText}"` : "";
      const main =
        pending + processing > 0
          ? `Run #${run.id} — ${completed} done, ${processing} processing, ${pending} pending${queryLabel}`
          : `Run #${run.id} — finalising…`;
      return { main, detail };
    }
    if (run.status === "completed") {
      return {
        main: `Run #${run.id} complete — ${stats?.completed ?? 0} crawled, ${stats?.failed ?? 0} failed`,
        detail: null,
      };
    }
    return null;
  }, [loadingMessage, payload]);

  async function refresh() {
    try {
      const latest = await requestJson<RunPayload & { ok: boolean }>("/api/runs/latest");
      setPayload(latest);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run data");
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);

    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  async function startRun() {
    setStarting(true);
    setLoadingMessage("Generating query ideas with LLM…");
    setError(null);
    try {
      const safeQueryTarget = clampInt(queryTarget, 10, 250, 100);
      const safeTopN = clampInt(topN, 3, 10, 10);

      setQueryTarget(safeQueryTarget);
      setTopN(safeTopN);

      const seed = seedText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      await requestJson("/api/runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryTarget: safeQueryTarget,
          topN: safeTopN,
          ...(seed.length > 0 ? { seed } : {}),
        }),
      });

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run.");
    } finally {
      setStarting(false);
      setLoadingMessage(null);
    }
  }

  async function truncateAllData() {
    const first = window.confirm(
      "TRUNCATE ALL DATA?\n\nThis will permanently delete every run, query, plugin, and category from the database. This cannot be undone.",
    );
    if (!first) return;

    const second = window.confirm(
      "FINAL WARNING\n\nYou are about to delete ALL data. Are you absolutely sure?",
    );
    if (!second) return;

    setTruncating(true);
    setLoadingMessage("Truncating all data\u2026");
    setError(null);
    try {
      await requestJson("/api/truncate", { method: "POST" });
      // Reset UI to initial state
      setPayload({ run: null });
      setExpandedCategoryId(null);
      setExpandedPluginSlug(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Truncate failed.");
    } finally {
      setTruncating(false);
      setLoadingMessage(null);
    }
  }

  async function recalculateScores() {
    setRecalculating(true);
    setLoadingMessage("Recalculating scores with current formula…");
    setError(null);
    try {
      await requestJson("/api/recalculate-scores", { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recalculate failed.");
    } finally {
      setRecalculating(false);
      setLoadingMessage(null);
    }
  }

  async function runCategorization() {    setCategorizing(true);
    setLoadingMessage("Running categorization (this may take a few minutes)…");
    setError(null);
    try {
      await requestJson("/api/categorize", { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Categorization failed.");
    } finally {
      setCategorizing(false);
      setLoadingMessage(null);
    }
  }

  async function stopRun() {
    if (!payload.run) return;
    // Abort any in-flight batch fetch and break the auto-continue loop
    continueAbortRef.current?.abort();
    continueAbortRef.current = null;
    stopAutoContinueRef.current = true;
    setStopping(true);
    setLoadingMessage("Stopping run…");
    setError(null);
    try {
      await requestJson(`/api/runs/${payload.run.id}/stop`, { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop run.");
    } finally {
      setStopping(false);
      setLoadingMessage(null);
    }
  }

  async function continueRun() {
    if (!payload.run) return;

    const safeBatchSize = clampInt(batchSize, 1, 50, 5);
    const safeTopN = clampInt(topN, 3, 10, 10);
    setBatchSize(safeBatchSize);
    setTopN(safeTopN);

    stopAutoContinueRef.current = false;
    setContinuing(true);
    setError(null);

    let isFirstBatch = true;
    try {
      while (true) {
        const runId = payload.run?.id;
        if (!runId) break;

        setLoadingMessage(`Crawling WordPress plugins… (batch size ${safeBatchSize})`);

        const abortController = new AbortController();
        continueAbortRef.current = abortController;

        const result = await requestJson<{ ok: boolean; processed: number; done: boolean }>(
          `/api/runs/${runId}/continue`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortController.signal,
            body: JSON.stringify({
              batchSize: safeBatchSize,
              topN: safeTopN,
              retryFailed: isFirstBatch ? retryFailed : false,
            }),
          },
        );

        continueAbortRef.current = null;

        isFirstBatch = false;
        await refresh();

        if (result.done || !autoContinue || stopAutoContinueRef.current) break;

        // Pause 2 s between batches to avoid hammering the DB/API
        await new Promise((resolve) => window.setTimeout(resolve, 2000));

        if (stopAutoContinueRef.current) break;
      }
    } catch (err) {
      // AbortError means Stop was clicked — not a real error, suppress it
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Failed to continue run.");
      }
    } finally {
      continueAbortRef.current = null;
      stopAutoContinueRef.current = false;
      setContinuing(false);
      setLoadingMessage(null);
    }
  }

  function stopAutoContinue() {
    stopAutoContinueRef.current = true;
  }

  return (
    <div className="w-full px-4 py-8 md:px-8">
      <header className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-cyan-50 to-emerald-50 dark:from-cyan-950/40 dark:to-emerald-950/40 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">
              WordPress Plugin Opportunity Harvester
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-700 dark:text-slate-300 md:text-base">
              Generate distinct query ideas, scan top WordPress plugins, and rank opportunities by demand vs market saturation.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGlossary(true)}
            title="Metric glossary"
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            ? Glossary
          </button>
          <button
            type="button"
            onClick={toggleDarkMode}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {darkMode ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14A7 7 0 0012 5z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          </div>
        </div>
      </header>
      {showGlossary ? (
        <GlossaryModal
          onClose={() => setShowGlossary(false)}
          onRecalculate={recalculateScores}
          recalculating={recalculating}
          disabled={anyLoading}
        />
      ) : null}

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={startRun}
          disabled={anyLoading}
          className="flex items-center gap-2 rounded-xl bg-cyan-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {starting ? <Spinner /> : null}
          {starting ? "Starting…" : "Start"}
        </button>
        <button
          type="button"
          onClick={continueRun}
          disabled={(anyLoading && !continuing) || !payload.run}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {continuing ? <Spinner /> : null}
          {continuing ? "Working…" : "Continue"}
        </button>
        {continuing && autoContinue ? (
          <button
            type="button"
            onClick={stopAutoContinue}
            className="flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-700"
          >
            Stop Auto
          </button>
        ) : null}
        <button
          type="button"
          onClick={stopRun}
          disabled={stopping || !payload.run || payload.run.status !== "running"}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stopping ? <Spinner /> : null}
          {stopping ? "Stopping…" : "Stop"}
        </button>
        <button
          type="button"
          onClick={runCategorization}
          disabled={anyLoading}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {categorizing ? <Spinner /> : null}
          {categorizing ? "Categorizing…" : "Categorize Plugins"}
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={truncateAllData}
            disabled={anyLoading}
            className="flex items-center gap-2 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-6 py-3 text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {truncating ? <Spinner /> : null}
            {truncating ? "Truncating…" : "Truncate All Data"}
          </button>
        </div>
      </div>

      {/* ── Settings panel ──────────────────────────────────────────────── */}
      <section className="mt-4 grid gap-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 md:grid-cols-4">
        <label className="text-sm text-slate-700 dark:text-slate-300">
          Query Target
          <input
            type="number"
            min={10}
            max={250}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
            value={queryTarget}
            onChange={(event) => setQueryTarget(Number(event.target.value))}
          />
        </label>
        <label className="text-sm text-slate-700 dark:text-slate-300">
          Top N Plugins
          <input
            type="number"
            min={3}
            max={10}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
            value={topN}
            onChange={(event) => setTopN(Number(event.target.value))}
          />
        </label>
        <label className="text-sm text-slate-700 dark:text-slate-300">
          Continue Batch Size
          <input
            type="number"
            min={1}
            max={50}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
            value={batchSize}
            onChange={(event) => setBatchSize(Number(event.target.value))}
          />
        </label>
        <label className="text-sm text-slate-700 dark:text-slate-300 md:col-span-4">
          Seed themes (optional — leave blank for auto-discovery)
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
            value={seedText}
            onChange={(event) => setSeedText(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 md:col-span-4 cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-amber-500"
            checked={retryFailed}
            onChange={(event) => setRetryFailed(event.target.checked)}
          />
          <span>
            Retry failed queries
            <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">
              (when Continue is clicked, reset all failed queries back to pending first)
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 md:col-span-4 cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-emerald-500"
            checked={autoContinue}
            onChange={(event) => setAutoContinue(event.target.checked)}
          />
          <span>
            Auto Continue
            <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">
              (keep running batch after batch automatically with a 2 s pause until all queries are done)
            </span>
          </span>
        </label>
      </section>

      {activityMessage ? (
        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-3">
            {anyLoading ? (
              <Spinner />
            ) : (
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
            )}
            {activityMessage.main}
          </div>
          {activityMessage.detail ? (
            <p className="mt-1 pl-5 text-xs text-orange-600 dark:text-orange-400">{activityMessage.detail}</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-5">
        <StatCard label="Run" value={payload.run ? `#${payload.run.id} (${payload.run.status})` : "No run"} />
        <StatCard label="Progress" value={`${progress}%`} />
        <StatCard label="Completed Queries" value={`${payload.stats?.completed ?? 0}`} />
        <StatCard label="Failed Queries" value={`${payload.stats?.failed ?? 0}`} />
        <StatCard label="Pending Queries" value={`${payload.stats?.pending ?? 0}`} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[2fr_3fr]">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Top Category Opportunities</h2>
            <Link
              href="/categories"
              className="flex items-center gap-1 text-xs font-medium text-cyan-700 dark:text-cyan-400 hover:text-cyan-900 dark:hover:text-cyan-300"
            >
              View All
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {(payload.topCategories ?? []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No categories yet — click <span className="font-medium text-indigo-600 dark:text-indigo-400">Categorize Plugins</span> after a run completes.
              </p>
            ) : null}
            {(payload.topCategories ?? []).map((cat) => {
              const isExpanded = expandedCategoryId === cat.id;
              return (
                <div key={cat.id} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {cat.category}
                        <span className="mx-1 text-slate-400 dark:text-slate-500">›</span>
                        <span className="text-slate-700 dark:text-slate-300">{cat.subcategory}</span>
                      </p>
                      <TierBadge tier={cat.opportunityTier} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Score: {cat.opportunityScore != null ? cat.opportunityScore.toFixed(3) : "0"}
                        {" · "}{cat.pluginCount} plugins
                      </p>
                      {(cat.plugins ?? []).length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedCategoryId(isExpanded ? null : cat.id);
                            setExpandedPluginSlug(null);
                          }}
                          className="flex-shrink-0 text-xs text-cyan-700 dark:text-cyan-400 hover:text-cyan-900 dark:hover:text-cyan-300"
                        >
                          {isExpanded ? "▲ hide" : `▼ ${cat.plugins.length} plugins`}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="border-t border-slate-100 dark:border-slate-700 px-3 pb-3">
                      <div className="mt-2 space-y-1">
                        {(cat.plugins ?? []).map(({ plugin }, idx) => {
                          const isPluginExpanded = expandedPluginSlug === plugin.slug;
                          return (
                            <div key={plugin.slug} className="overflow-hidden rounded-md border border-slate-100 dark:border-slate-700">
                              <button
                                type="button"
                                onClick={() => setExpandedPluginSlug(isPluginExpanded ? null : plugin.slug)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="flex-shrink-0 tabular-nums text-xs text-slate-400 dark:text-slate-500">#{idx + 1}</span>
                                  <a
                                    href={plugin.pluginUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="truncate text-sm font-medium text-cyan-700 dark:text-cyan-400 hover:underline"
                                  >
                                    {plugin.name}
                                  </a>
                                </span>
                                <span className="flex flex-shrink-0 items-center gap-2">
                                  <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
                                    {plugin.opportunityScore != null ? plugin.opportunityScore.toFixed(3) : "—"}
                                  </span>
                                  <TierBadge tier={plugin.opportunityTier} />
                                  <span className="text-xs text-slate-400 dark:text-slate-500">{isPluginExpanded ? "▲" : "▼"}</span>
                                </span>
                              </button>
                              {isPluginExpanded ? <PluginDetailCard plugin={plugin} /> : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Top Plugin Opportunities</h2>
            <Link
              href="/plugins"
              className="flex items-center gap-1 text-xs font-medium text-cyan-700 dark:text-cyan-400 hover:text-cyan-900 dark:hover:text-cyan-300"
            >
              View All
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-[1100px] divide-y divide-slate-200 dark:divide-slate-700 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Plugin</th>
                  <th className="px-3 py-2">Active Installs</th>
                  <th className="px-3 py-2">Rating Count</th>
                  <th className="px-3 py-2">Rating</th>
                  <th className="px-3 py-2">Demand</th>
                  <th className="px-3 py-2">Competition</th>
                  <th className="px-3 py-2">Satisfaction</th>
                  <th className="px-3 py-2">Freshness</th>
                  <th className="px-3 py-2">Final Score</th>
                  <th className="px-3 py-2">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                {(payload.topPlugins ?? []).map((plugin) => (
                  <tr key={plugin.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-3 py-2">
                      <a
                        href={plugin.pluginUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-cyan-700 dark:text-cyan-400 hover:text-cyan-900 dark:hover:text-cyan-300 hover:underline"
                      >
                        {plugin.name}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {plugin.activeInstalls != null ? plugin.activeInstalls.toLocaleString() : "n/a"}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {plugin.ratingCount != null ? plugin.ratingCount.toLocaleString() : "n/a"}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {plugin.rating != null ? plugin.rating.toFixed(2) : "n/a"}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{plugin.demandScore != null ? plugin.demandScore.toFixed(3) : "n/a"}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{plugin.competitionScore != null ? plugin.competitionScore.toFixed(3) : "n/a"}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{plugin.satisfactionScore != null ? plugin.satisfactionScore.toFixed(3) : "n/a"}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{plugin.freshnessScore != null ? plugin.freshnessScore.toFixed(3) : "n/a"}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">{plugin.opportunityScore != null ? plugin.opportunityScore.toFixed(3) : "n/a"}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium uppercase text-slate-700 dark:text-slate-300">
                        {plugin.opportunityTier ?? "n/a"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {(payload.queries ?? []).length > 0 ? (
        <section className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            All Queries — Run #{payload.run?.id}{" "}({(payload.queries ?? []).length})
          </h2>
          <div className="mt-3 max-h-[480px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Query</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
                {(payload.queries ?? []).map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{q.queryText}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium uppercase text-slate-600 dark:text-slate-300">
                        {q.queryType}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <QueryStatusBadge
                        status={q.status}
                        errorTitle={q.status === "failed" && q.lastError ? q.lastError : undefined}
                      />
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                      {q.opportunityScore != null ? q.opportunityScore.toFixed(3) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {q.opportunityTier ? (
                        <span className="rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium uppercase text-slate-600 dark:text-slate-300">
                          {q.opportunityTier}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QueryStatusBadge({ status, errorTitle }: { status: string; errorTitle?: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
    processing: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
    completed: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
    failed: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
    skipped: "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500",
  };
  return (
    <span
      title={errorTitle}
      className={`inline-flex cursor-default items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium uppercase ${
        styles[status] ?? "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
      }`}
    >
      {status === "processing" ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {status}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
function TierBadge({ tier }: { tier: string | null }) {
  const styles: Record<string, string> = {
    high: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
    medium: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
    low: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400",
  };
  return (
    <span
      className={`flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-medium uppercase ${
        styles[tier ?? "low"] ?? "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
      }`}
    >
      {tier ?? "n/a"}
    </span>
  );
}

type PluginCardFields = {
  name: string;
  pluginUrl: string;
  activeInstalls: number | null;
  ratingCount: number | null;
  rating: number | null;
  demandScore: number | null;
  competitionScore: number | null;
  satisfactionScore: number | null;
  freshnessScore: number | null;
  opportunityScore: number | null;
  opportunityTier: string | null;
};

function PluginDetailCard({ plugin }: { plugin: PluginCardFields }) {
  const rows: Array<[string, string]> = [
    ["Active Installs", plugin.activeInstalls != null ? plugin.activeInstalls.toLocaleString() : "n/a"],
    ["Rating Count", plugin.ratingCount != null ? plugin.ratingCount.toLocaleString() : "n/a"],
    ["Rating", plugin.rating != null ? plugin.rating.toFixed(2) : "n/a"],
    ["Demand", plugin.demandScore != null ? plugin.demandScore.toFixed(3) : "n/a"],
    ["Competition", plugin.competitionScore != null ? plugin.competitionScore.toFixed(3) : "n/a"],
    ["Satisfaction", plugin.satisfactionScore != null ? plugin.satisfactionScore.toFixed(3) : "n/a"],
    ["Freshness", plugin.freshnessScore != null ? plugin.freshnessScore.toFixed(3) : "n/a"],
    ["Final Score", plugin.opportunityScore != null ? plugin.opportunityScore.toFixed(3) : "n/a"],
    ["Tier", plugin.opportunityTier ?? "n/a"],
  ];
  return (
    <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-1">
            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

// ─── Glossary ──────────────────────────────────────────────────────────────────

type GlossaryEntry = {
  term: string;
  color: string; // Tailwind bg class for the icon pill
  icon: string;  // single emoji
  tagline: string;
  what: string;
  high: string;
  low: string;
  formula: string;
  example: string;
};

const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Active Installs",
    color: "bg-blue-100 dark:bg-blue-900/40",
    icon: "📦",
    tagline: "Raw market size — how many sites use this plugin right now",
    what: "WordPress.org reports active installs in rounded buckets (e.g. 900,000 means roughly 900k\u20131M). It is the best proxy for real-world demand.",
    high: "Millions of active installs → large addressable market, proven problem worth solving.",
    low: "Fewer than 10,000 → niche or untested demand. A low-demand signal is flagged when the top‑3 plugins all fall below 10 k installs.",
    formula: "Raw integer from the WordPress.org API — no transformation applied here.",
    example: "900,000 active installs: large user base. A competing plugin would need strong differentiation to win a slice.",
  },
  {
    term: "Rating Count",
    color: "bg-violet-100 dark:bg-violet-900/40",
    icon: "⭐",
    tagline: "Review volume — the crowd has spoken (or hasn't)",
    what: "Total number of star-ratings submitted on WordPress.org. Used as a proxy for how entrenched the incumbent is. More reviews = harder to displace.",
    high: "Thousands of ratings → well-established plugin, review moat is wide, competition is fierce.",
    low: "Fewer than 100 ratings → plugin is lightly reviewed; users haven't bothered to engage, suggesting the market is still up for grabs.",
    formula: "Raw integer from the WordPress.org API — feeds into the Competition score.",
    example: "149 ratings is relatively thin, pointing to a market that is not yet locked in.",
  },
  {
    term: "Rating",
    color: "bg-amber-100 dark:bg-amber-900/40",
    icon: "🌟",
    tagline: "Quality signal — are users happy with what exists?",
    what: "Average star rating (0–5) from WordPress.org. Low ratings reveal user pain — dissatisfied users are actively looking for better solutions.",
    high: "4.5 – 5.0 → users are satisfied; existing solution is polished and hard to beat on quality.",
    low: "Below 3.5 → notable unhappiness. Users are leaving poor reviews, signalling a gap your plugin could fill.",
    formula: "Raw float from the API — feeds into the Satisfaction score.",
    example: "A rating of 3.20 out of 5 indicates clear user frustration — strong opportunity to build something better.",
  },
  {
    term: "Demand",
    color: "bg-emerald-100 dark:bg-emerald-900/40",
    icon: "📈",
    tagline: "Normalised market size — how big is the audience? (0 – 1)",
    what: "Transforms Active Installs onto a 0–1 scale using a logarithmic curve so the score grows meaningfully across orders of magnitude.",
    high: "Close to 1.0 → millions of installs; massive addressable market.",
    low: "0.0 → fewer than ~100 installs; no meaningful audience detected.",
    formula: "clamp( (log₁₀(installs + 1) − 2) / 2.5,  0, 1 )\nThreshold starts at ~100 installs (log₁₀(100)=2); saturates at ~100 k installs.",
    example: "900,000 installs → log₁₀(900 001) ≈ 5.95 → (5.95−2)/2.5 = 1.58 → clamped to 1.000",
  },
  {
    term: "Competition",
    color: "bg-rose-100 dark:bg-rose-900/40",
    icon: "⚔️",
    tagline: "Incumbent strength — how hard is it to dislodge the leader? (0 – 1)",
    what: "Normalises Rating Count onto 0–1 via a log scale. More reviews = stronger review moat = higher competition score. In the final score, competition is inverted (1 − C) so low competition improves your opportunity.",
    high: "Close to 1.0 → ~1,000+ reviews; very entrenched plugin, review moat is wide, hard to unseat.",
    low: "0.0 → fewer than 10 reviews; effectively no established player.",
    formula: "clamp( (log₁₀(ratingCount + 1) − 1) / 2,  0, 1 )\nThreshold starts at ~10 ratings; saturates at ~1 000 ratings.",
    example: "149 ratings → log₁₀(150) ≈ 2.18 → (2.18−1)/2 = 0.590 (was 0.392 with the old ÷3 formula)",
  },
  {
    term: "Satisfaction",
    color: "bg-pink-100 dark:bg-pink-900/40",
    icon: "😐",
    tagline: "How happy are existing users? (0 – 1, lower = more pain)",
    what: "Normalises the star rating onto 0–1. Because user pain is an opportunity, the final score inverts this (1 − S). A low satisfaction score means users are unhappy — good for you.",
    high: "Close to 1.0 → rating near 5 stars; users are very satisfied, existing solution is excellent.",
    low: "0.0 → rating ≤ 3.0; users are unhappy or the plugin has no meaningful reviews.",
    formula: "clamp( max(rating − 3, 0) / 1.8,  0, 1 )\nStarts scoring above 3 stars; saturates at 4.8 stars.",
    example: "Rating 3.20 → max(3.20−3, 0)/1.8 = 0.20/1.8 ≈ 0.111 ✓",
  },
  {
    term: "Freshness",
    color: "bg-cyan-100 dark:bg-cyan-900/40",
    icon: "🕰️",
    tagline: "How stale is the competition? (0 – 1, higher = more neglected)",
    what: "Measures how long ago the plugin was last updated. A stale plugin signals neglect — users are more likely to switch to a well-maintained alternative.",
    high: "1.0 → last updated over a year ago; plugin is effectively abandoned.",
    low: "0.3 → updated within the last 4 months; actively maintained, hard to compete against on freshness.",
    formula: "≤ 120 days → 0.3 (fresh competitor)\n121–240 days → 0.5 (neutral)\n241–365 days → 0.75 (getting stale)\n> 365 days → 1.0 (abandoned)\nUnknown date → 0.5 (neutral)",
    example: "Plugin last updated 200 days ago → 0.5 (neutral). Same plugin untouched for 400 days → 1.0.",
  },
  {
    term: "Final Score",
    color: "bg-indigo-100 dark:bg-indigo-900/40",
    icon: "🏆",
    tagline: "Overall opportunity rating (0 – 1)",
    what: "Weighted combination of all four normalised metrics. Higher is better. Each weight reflects how much that factor matters for a plugin opportunity.",
    high: "≥ 0.55 → High tier. Strong demand, low competition, unhappy users, stale plugin.",
    low: "< 0.40 → Low tier. Small audience, fierce competition, or satisfied users.",
    formula: "Score = 0.30 × Demand\n      + 0.25 × (1 − Competition)\n      + 0.40 × (1 − Satisfaction)\n      + 0.05 × Freshness",
    example: "Demand=1.0, Competition=0.392, Satisfaction=0.111, Freshness=0.5\n= 0.30×1.0 + 0.25×0.608 + 0.40×0.889 + 0.05×0.5\n= 0.300 + 0.152 + 0.356 + 0.025\n= 0.833 ✓",
  },
  {
    term: "Tier",
    color: "bg-orange-100 dark:bg-orange-900/40",
    icon: "🎯",
    tagline: "Quick-glance verdict: High / Medium / Low",
    what: "Bucketed label derived directly from the Final Score. Used for colour-coding and filtering in the UI.",
    high: "High (score ≥ 0.55) — Strong opportunity: worth prioritising.",
    low: "Low (score < 0.40) — Weak opportunity: market is either too small, too competitive, or well-served.",
    formula: "score ≥ 0.55 → High\nscore ≥ 0.40 → Medium\nscore < 0.40 → Low",
    example: "Score 0.833 → High ✓",
  },
];

function GlossaryModal({
  onClose,
  onRecalculate,
  recalculating,
  disabled,
}: {
  onClose: () => void;
  onRecalculate: () => void;
  recalculating: boolean;
  disabled: boolean;
}) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-indigo-50 to-cyan-50 dark:from-indigo-950/60 dark:to-cyan-950/60 px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Metric Glossary</h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">What every number means, how it is calculated, and how to read it.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close glossary"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Formula summary banner */}
        <div className="mx-6 mt-5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-2">Final Score Formula</p>
          <code className="block text-sm font-mono text-indigo-900 dark:text-indigo-200 leading-relaxed whitespace-pre">
{`Score = 0.30 × Demand
      + 0.25 × (1 − Competition)
      + 0.40 × (1 − Satisfaction)
      + 0.05 × Freshness`}
          </code>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-center">
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/40 py-1.5 font-semibold text-emerald-700 dark:text-emerald-300">≥ 0.55 → 🟢 High</div>
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 py-1.5 font-semibold text-amber-700 dark:text-amber-300">≥ 0.40 → 🟡 Medium</div>
            <div className="rounded-lg bg-red-100 dark:bg-red-900/40 py-1.5 font-semibold text-red-700 dark:text-red-300">&lt; 0.40 → 🔴 Low</div>
          </div>
        </div>

        {/* Recalculate action */}
        <div className="mx-6 mt-4 flex items-center justify-between rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Scores out of date?</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">Re-run the formula on all stored data after changing weights.</p>
          </div>
          <button
            type="button"
            onClick={onRecalculate}
            disabled={disabled}
            className="ml-4 flex shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {recalculating ? <Spinner /> : null}
            {recalculating ? "Recalculating…" : "Recalculate Scores"}
          </button>
        </div>

        {/* Entries */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800 px-6 pb-6">
          {GLOSSARY.map((entry) => (
            <GlossaryEntry key={entry.term} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GlossaryEntry({ entry }: { entry: GlossaryEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-4">
      {/* Term header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-lg ${entry.color}`}>
          {entry.icon}
        </span>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-slate-900 dark:text-slate-100">{entry.term}</span>
          <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">{entry.tagline}</span>
        </div>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="mt-3 ml-12 grid gap-3">
          <p className="text-sm text-slate-700 dark:text-slate-300">{entry.what}</p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-1">🟢 When High</p>
              <p className="text-sm text-emerald-900 dark:text-emerald-200">{entry.high}</p>
            </div>
            <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1">🔴 When Low</p>
              <p className="text-sm text-red-900 dark:text-red-200">{entry.low}</p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Formula</p>
            <code className="whitespace-pre text-sm font-mono text-slate-800 dark:text-slate-200">{entry.formula}</code>
          </div>

          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400 mb-1">Example</p>
            <code className="whitespace-pre-wrap text-sm font-mono text-indigo-900 dark:text-indigo-200">{entry.example}</code>
          </div>
        </div>
      )}
    </div>
  );
}
