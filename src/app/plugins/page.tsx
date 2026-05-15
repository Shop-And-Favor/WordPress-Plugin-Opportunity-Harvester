"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TaxonomyMultiSelect } from "@/components/taxonomy-multi-select";
import {
  collectFacetOptions,
  matchesCategorySelection,
  matchesTextSearch,
  uniqueSorted,
} from "@/lib/plugin-filters";

type PluginOpportunityRow = {
  id: number;
  pluginId: number;
  name: string;
  slug: string;
  pluginUrl: string;
  shortDescription: string | null;
  author: string | null;
  rating: number | null;
  ratingCount: number | null;
  activeInstalls: number | null;
  downloadedCount: number | null;
  demandScore: number | null;
  competitionScore: number | null;
  satisfactionScore: number | null;
  freshnessScore: number | null;
  opportunityScore: number | null;
  opportunityTier: string | null;
  categoryId: number;
  category: string;
  subcategory: string;
};

type Filters = {
  search: string;
  tier: "all" | "high" | "medium" | "low";
  minScore: number;
  maxScore: number;
};

const DEFAULT_FILTERS: Filters = {
  search: "",
  tier: "all",
  minScore: 0,
  maxScore: 1,
};

function TierBadge({ tier }: { tier: string | null }) {
  const map: Record<string, string> = {
    high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    low: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  };
  const cls = (tier && map[tier]) ?? "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {tier ?? "-"}
    </span>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  const pct = value != null ? Math.round(value * 100) : 0;
  const color = pct >= 55 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-700 dark:text-slate-300">
        {value != null ? value.toFixed(3) : "-"}
      </span>
    </div>
  );
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginOpportunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;

  useEffect(() => {
    const stored = localStorage.getItem("darkMode");
    document.documentElement.classList.toggle("dark", stored === "true");
  }, []);

  useEffect(() => {
    fetch("/api/plugins")
      .then((response) => response.json())
      .then((data: { ok: boolean; plugins?: PluginOpportunityRow[]; error?: string }) => {
        if (!data.ok) {
          throw new Error(data.error ?? "Failed to load plugins");
        }
        setPlugins(data.plugins ?? []);
      })
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load plugins");
      })
      .finally(() => setLoading(false));
  }, []);

  const facets = useMemo(() => collectFacetOptions(plugins), [plugins]);

  const availableSubcategories = useMemo(() => {
    const scoped =
      selectedCategories.length === 0
        ? plugins
        : plugins.filter((plugin) => selectedCategories.includes(plugin.category));

    return uniqueSorted([
      ...scoped.map((plugin) => plugin.subcategory),
      ...selectedSubcategories,
    ]);
  }, [plugins, selectedCategories, selectedSubcategories]);

  const filtered = useMemo(() => {
    return plugins.filter((plugin) => {
      if (filters.tier !== "all" && plugin.opportunityTier !== filters.tier) return false;

      const score = plugin.opportunityScore ?? 0;
      if (score < filters.minScore) return false;
      if (score > filters.maxScore) return false;

      if (
        !matchesCategorySelection({
          category: plugin.category,
          subcategory: plugin.subcategory,
          selectedCategories,
          selectedSubcategories,
        })
      ) {
        return false;
      }

      if (!matchesTextSearch([plugin.name, plugin.shortDescription], filters.search)) {
        return false;
      }

      return true;
    });
  }, [plugins, filters, selectedCategories, selectedSubcategories]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function updateFilters(updater: (current: Filters) => Filters) {
    setPage(1);
    setFilters(updater);
  }

  function toggleCategory(value: string) {
    setPage(1);
    setSelectedCategories((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function toggleSubcategory(value: string) {
    setPage(1);
    setSelectedSubcategories((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function resetFilters() {
    setPage(1);
    setFilters(DEFAULT_FILTERS);
    setSelectedCategories([]);
    setSelectedSubcategories([]);
  }

  const hasActiveFilters =
    filters.search !== "" ||
    filters.tier !== "all" ||
    filters.minScore !== 0 ||
    filters.maxScore !== 1 ||
    selectedCategories.length > 0 ||
    selectedSubcategories.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <nav className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back to Dashboard
        </Link>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          All Plugin Opportunities
          {!loading ? (
            <span className="ml-2 font-normal text-slate-400 dark:text-slate-500">
              {filtered.length} of {plugins.length}
            </span>
          ) : null}
        </h1>
      </nav>

      <div className="mx-auto max-w-screen-2xl px-4 py-6 md:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="h-8 w-8 animate-spin text-cyan-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <aside className="w-full shrink-0 lg:w-80">
              <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 lg:sticky lg:top-20">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filters</h2>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-xs text-cyan-600 hover:underline dark:text-cyan-400"
                    >
                      Reset all
                    </button>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Search
                  </label>
                  <div className="relative">
                    <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                    </svg>
                    <input
                      type="text"
                      value={filters.search}
                      onChange={(event) => updateFilters((current) => ({ ...current, search: event.target.value }))}
                      placeholder="title or description..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Tier</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(["all", "high", "medium", "low"] as const).map((tier) => {
                      const active = filters.tier === tier;
                      const colorMap: Record<string, string> = {
                        all: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
                        high: "bg-emerald-500 text-white",
                        medium: "bg-amber-500 text-white",
                        low: "bg-red-400 text-white",
                      };
                      const inactiveMap: Record<string, string> = {
                        all: "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700",
                        high: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40",
                        medium: "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-900/40",
                        low: "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/40",
                      };

                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => updateFilters((current) => ({ ...current, tier }))}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                            active ? colorMap[tier] : inactiveMap[tier]
                          }`}
                        >
                          {tier === "all" ? "All tiers" : tier}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Score range
                    <span className="ml-1 font-normal text-slate-400">
                      {filters.minScore.toFixed(2)} - {filters.maxScore.toFixed(2)}
                    </span>
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs text-slate-400">Min</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={filters.minScore}
                        onChange={(event) => {
                          const value = parseFloat(event.target.value);
                          updateFilters((current) => ({
                            ...current,
                            minScore: Math.min(value, current.maxScore - 0.05),
                          }));
                        }}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs text-slate-400">Max</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={filters.maxScore}
                        onChange={(event) => {
                          const value = parseFloat(event.target.value);
                          updateFilters((current) => ({
                            ...current,
                            maxScore: Math.max(value, current.minScore + 0.05),
                          }));
                        }}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                  </div>
                </div>

                <TaxonomyMultiSelect
                  categories={facets.categories}
                  subcategories={availableSubcategories}
                  selectedCategories={selectedCategories}
                  selectedSubcategories={selectedSubcategories}
                  onToggleCategory={toggleCategory}
                  onToggleSubcategory={toggleSubcategory}
                  helperText="Matches any selected category or subcategory. Search checks plugin title and description."
                />

                <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Showing</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{filtered.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>High tier</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {filtered.filter((plugin) => plugin.opportunityTier === "high").length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Medium tier</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {filtered.filter((plugin) => plugin.opportunityTier === "medium").length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Low tier</span>
                    <span className="font-semibold text-red-500 dark:text-red-400">
                      {filtered.filter((plugin) => plugin.opportunityTier === "low").length}
                    </span>
                  </div>
                </div>
              </div>
            </aside>

            <div className="min-w-0 flex-1 space-y-3">
              {paginated.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  No plugins match the current filters.
                </div>
              ) : null}

              {paginated.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1280px] divide-y divide-slate-100 text-sm dark:divide-slate-700">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Plugin</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Subcategory</th>
                          <th className="px-3 py-2 text-right">Installs</th>
                          <th className="px-3 py-2 text-right">Rating</th>
                          <th className="px-3 py-2 text-right">Demand</th>
                          <th className="px-3 py-2 text-right">Competition</th>
                          <th className="px-3 py-2 text-right">Score</th>
                          <th className="px-3 py-2">Tier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-900">
                        {paginated.map((plugin) => (
                          <tr key={plugin.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                            <td className="px-3 py-3 align-top">
                              <a
                                href={plugin.pluginUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-cyan-700 hover:underline dark:text-cyan-400"
                              >
                                {plugin.name}
                              </a>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{plugin.slug}</div>
                            </td>
                            <td className="max-w-lg px-3 py-3 align-top text-xs leading-5 text-slate-600 dark:text-slate-300">
                              {plugin.shortDescription ?? "No description available."}
                            </td>
                            <td className="px-3 py-3 align-top text-slate-700 dark:text-slate-300">{plugin.category}</td>
                            <td className="px-3 py-3 align-top text-slate-700 dark:text-slate-300">{plugin.subcategory}</td>
                            <td className="px-3 py-3 text-right align-top tabular-nums text-slate-600 dark:text-slate-400">
                              {plugin.activeInstalls != null ? plugin.activeInstalls.toLocaleString() : "-"}
                            </td>
                            <td className="px-3 py-3 text-right align-top tabular-nums text-slate-600 dark:text-slate-400">
                              {plugin.rating != null ? plugin.rating.toFixed(2) : "-"}
                            </td>
                            <td className="px-3 py-3 text-right align-top tabular-nums text-slate-600 dark:text-slate-400">
                              {plugin.demandScore != null ? plugin.demandScore.toFixed(3) : "-"}
                            </td>
                            <td className="px-3 py-3 text-right align-top tabular-nums text-slate-600 dark:text-slate-400">
                              {plugin.competitionScore != null ? plugin.competitionScore.toFixed(3) : "-"}
                            </td>
                            <td className="px-3 py-3 align-top">
                              <ScoreBar value={plugin.opportunityScore} />
                            </td>
                            <td className="px-3 py-3 align-top">
                              <TierBadge tier={plugin.opportunityTier} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {totalPages > 1 ? (
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Page {page} of {totalPages} - {filtered.length} plugins
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage(1)}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      «
                    </button>
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage((current) => current - 1)}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      ‹ Prev
                    </button>
                    {Array.from({ length: Math.min(7, totalPages) }, (_, index) => {
                      const start = Math.max(1, Math.min(page - 3, totalPages - 6));
                      const nextPage = start + index;

                      return (
                        <button
                          key={nextPage}
                          type="button"
                          onClick={() => setPage(nextPage)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                            nextPage === page
                              ? "bg-cyan-600 text-white"
                              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          }`}
                        >
                          {nextPage}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={page === totalPages}
                      onClick={() => setPage((current) => current + 1)}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      Next ›
                    </button>
                    <button
                      type="button"
                      disabled={page === totalPages}
                      onClick={() => setPage(totalPages)}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      »
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}