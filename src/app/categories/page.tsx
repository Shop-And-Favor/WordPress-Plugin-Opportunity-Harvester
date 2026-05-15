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

// ─── Types ────────────────────────────────────────────────────────────────────

type PluginRow = {
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

type CategoryRow = {
  id: number;
  category: string;
  subcategory: string;
  pluginCount: number;
  opportunityScore: number | null;
  opportunityTier: string | null;
  plugins: Array<{ plugin: PluginRow }>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string | null }) {
  const map: Record<string, string> = {
    high: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
    medium: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
    low: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
  };
  const cls = (tier && map[tier]) ?? "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400";
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {tier ?? "—"}
    </span>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  const pct = value != null ? Math.round(value * 100) : 0;
  const color =
    pct >= 55 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs text-slate-700 dark:text-slate-300">
        {value != null ? value.toFixed(3) : "—"}
      </span>
    </div>
  );
}

// ─── Filter state ─────────────────────────────────────────────────────────────

type Filters = {
  search: string;
  tier: "all" | "high" | "medium" | "low";
  minScore: number;
  maxScore: number;
  minPlugins: number;
};

const DEFAULT_FILTERS: Filters = {
  search: "",
  tier: "all",
  minScore: 0,
  maxScore: 1,
  minPlugins: 0,
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedPluginSlug, setExpandedPluginSlug] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  // Dark mode — read from localStorage (same as main page)
  useEffect(() => {
    const stored = localStorage.getItem("darkMode");
    document.documentElement.classList.toggle("dark", stored === "true");
  }, []);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data: { ok: boolean; categories?: CategoryRow[]; error?: string }) => {
        if (!data.ok) throw new Error(data.error ?? "Failed to load");
        setCategories(data.categories ?? []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load categories"))
      .finally(() => setLoading(false));
  }, []);

  const facets = useMemo(() => collectFacetOptions(categories), [categories]);

  const availableSubcategories = useMemo(() => {
    const scoped =
      selectedCategories.length === 0
        ? categories
        : categories.filter((category) => selectedCategories.includes(category.category));

    return uniqueSorted([
      ...scoped.map((category) => category.subcategory),
      ...selectedSubcategories,
    ]);
  }, [categories, selectedCategories, selectedSubcategories]);

  const filtered = useMemo(() => {
    return categories.filter((c) => {
      if (filters.tier !== "all" && c.opportunityTier !== filters.tier) return false;
      if ((c.opportunityScore ?? 0) < filters.minScore) return false;
      if ((c.opportunityScore ?? 0) > filters.maxScore) return false;
      if (c.pluginCount < filters.minPlugins) return false;
      if (
        !matchesCategorySelection({
          category: c.category,
          subcategory: c.subcategory,
          selectedCategories,
          selectedSubcategories,
        })
      ) {
        return false;
      }

      if (!matchesTextSearch([c.category, c.subcategory], filters.search)) return false;

      return true;
    });
  }, [categories, filters, selectedCategories, selectedSubcategories]);

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
    filters.minPlugins !== 0 ||
    selectedCategories.length > 0 ||
    selectedSubcategories.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Top nav bar ── */}
      <nav className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-4 py-3 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back to Dashboard
        </Link>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          All Category Opportunities
          {!loading && (
            <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">
              {filtered.length} of {categories.length}
            </span>
          )}
        </h1>
      </nav>

      <div className="mx-auto max-w-screen-2xl px-4 py-6 md:px-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <svg className="h-8 w-8 animate-spin text-cyan-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-5 py-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* ── Filter sidebar ── */}
            <aside className="w-full shrink-0 lg:w-72">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-5 lg:sticky lg:top-20">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filters</h2>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                    >
                      Reset all
                    </button>
                  )}
                </div>

                {/* Search */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Search</label>
                  <div className="relative">
                    <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                    </svg>
                    <input
                      type="text"
                      value={filters.search}
                      onChange={(e) => updateFilters((f) => ({ ...f, search: e.target.value }))}
                      placeholder="category or subcategory…"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-8 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                {/* Tier */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Tier</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {(["all", "high", "medium", "low"] as const).map((t) => {
                      const active = filters.tier === t;
                      const colorMap: Record<string, string> = {
                        all: "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200",
                        high: "bg-emerald-500 text-white",
                        medium: "bg-amber-500 text-white",
                        low: "bg-red-400 text-white",
                      };
                      const inactiveMap: Record<string, string> = {
                        all: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700",
                        high: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
                        medium: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40",
                        low: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40",
                      };
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updateFilters((f) => ({ ...f, tier: t }))}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${active ? colorMap[t] : inactiveMap[t]}`}
                        >
                          {t === "all" ? "All tiers" : t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Score range */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Score range
                    <span className="ml-1 font-normal text-slate-400">
                      {filters.minScore.toFixed(2)} – {filters.maxScore.toFixed(2)}
                    </span>
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs text-slate-400">Min</span>
                      <input
                        type="range"
                        min={0} max={1} step={0.05}
                        value={filters.minScore}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          updateFilters((f) => ({ ...f, minScore: Math.min(v, f.maxScore - 0.05) }));
                        }}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs text-slate-400">Max</span>
                      <input
                        type="range"
                        min={0} max={1} step={0.05}
                        value={filters.maxScore}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          updateFilters((f) => ({ ...f, maxScore: Math.max(v, f.minScore + 0.05) }));
                        }}
                        className="w-full accent-cyan-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Min plugins */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Min plugins in category
                    <span className="ml-1 font-normal text-slate-400">≥ {filters.minPlugins}</span>
                  </label>
                  <input
                    type="range"
                    min={0} max={50} step={1}
                    value={filters.minPlugins}
                    onChange={(e) => updateFilters((f) => ({ ...f, minPlugins: parseInt(e.target.value) }))}
                    className="w-full accent-cyan-500"
                  />
                </div>

                <TaxonomyMultiSelect
                  categories={facets.categories}
                  subcategories={availableSubcategories}
                  selectedCategories={selectedCategories}
                  selectedSubcategories={selectedSubcategories}
                  onToggleCategory={toggleCategory}
                  onToggleSubcategory={toggleSubcategory}
                  helperText="Matches any selected category or subcategory."
                />

                {/* Stats summary */}
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-4 py-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Showing</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{filtered.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>High tier</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {filtered.filter((c) => c.opportunityTier === "high").length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Medium tier</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {filtered.filter((c) => c.opportunityTier === "medium").length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Low tier</span>
                    <span className="font-semibold text-red-500 dark:text-red-400">
                      {filtered.filter((c) => c.opportunityTier === "low").length}
                    </span>
                  </div>
                </div>
              </div>
            </aside>

            {/* ── Category list ── */}
            <div className="flex-1 min-w-0 space-y-3">
              {paginated.length === 0 && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                  No categories match the current filters.
                </div>
              )}

              {paginated.map((cat) => {
                const isExpanded = expandedId === cat.id;
                return (
                  <div
                    key={cat.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    {/* Category header */}
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{cat.category}</span>
                          <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                          </svg>
                          <span className="text-slate-600 dark:text-slate-300">{cat.subcategory}</span>
                          <TierBadge tier={cat.opportunityTier} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-4">
                          <ScoreBar value={cat.opportunityScore} />
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {cat.pluginCount} plugin{cat.pluginCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      {cat.plugins.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedId(isExpanded ? null : cat.id);
                            setExpandedPluginSlug(null);
                          }}
                          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          {isExpanded ? (
                            <>
                              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" /></svg>
                              Hide plugins
                            </>
                          ) : (
                            <>
                              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
                              {cat.plugins.length} plugins
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Plugin list */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-700 px-4 pb-4">
                        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                          <table className="min-w-[860px] divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              <tr>
                                <th className="px-3 py-2 text-left">#</th>
                                <th className="px-3 py-2 text-left">Plugin</th>
                                <th className="px-3 py-2 text-right">Installs</th>
                                <th className="px-3 py-2 text-right">Rating</th>
                                <th className="px-3 py-2 text-right">Demand</th>
                                <th className="px-3 py-2 text-right">Competition</th>
                                <th className="px-3 py-2 text-right">Satisfaction</th>
                                <th className="px-3 py-2 text-right">Score</th>
                                <th className="px-3 py-2 text-left">Tier</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-900">
                              {cat.plugins.map(({ plugin }, idx) => {
                                const isPExpanded = expandedPluginSlug === plugin.slug;
                                return (
                                  <>
                                    <tr
                                      key={plugin.slug}
                                      onClick={() => setExpandedPluginSlug(isPExpanded ? null : plugin.slug)}
                                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                                    >
                                      <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">{idx + 1}</td>
                                      <td className="px-3 py-2">
                                        <a
                                          href={plugin.pluginUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="font-medium text-cyan-700 dark:text-cyan-400 hover:underline"
                                        >
                                          {plugin.name}
                                        </a>
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                                        {plugin.activeInstalls != null ? plugin.activeInstalls.toLocaleString() : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                                        {plugin.rating != null ? plugin.rating.toFixed(2) : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                                        {plugin.demandScore != null ? plugin.demandScore.toFixed(3) : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                                        {plugin.competitionScore != null ? plugin.competitionScore.toFixed(3) : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                                        {plugin.satisfactionScore != null ? plugin.satisfactionScore.toFixed(3) : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                          {plugin.opportunityScore != null ? plugin.opportunityScore.toFixed(3) : "—"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <TierBadge tier={plugin.opportunityTier} />
                                      </td>
                                    </tr>
                                    {isPExpanded && (
                                      <tr key={`${plugin.slug}-detail`} className="bg-slate-50 dark:bg-slate-800/60">
                                        <td colSpan={9} className="px-4 py-3">
                                          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
                                            <div className="flex justify-between gap-2">
                                              <span className="text-slate-500 dark:text-slate-400">Active Installs</span>
                                              <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{plugin.activeInstalls?.toLocaleString() ?? "n/a"}</span>
                                            </div>
                                            <div className="flex justify-between gap-2">
                                              <span className="text-slate-500 dark:text-slate-400">Rating Count</span>
                                              <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{plugin.ratingCount?.toLocaleString() ?? "n/a"}</span>
                                            </div>
                                            <div className="flex justify-between gap-2">
                                              <span className="text-slate-500 dark:text-slate-400">Rating</span>
                                              <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{plugin.rating?.toFixed(2) ?? "n/a"}</span>
                                            </div>
                                            <div className="flex justify-between gap-2">
                                              <span className="text-slate-500 dark:text-slate-400">Demand</span>
                                              <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{plugin.demandScore?.toFixed(3) ?? "n/a"}</span>
                                            </div>
                                            <div className="flex justify-between gap-2">
                                              <span className="text-slate-500 dark:text-slate-400">Competition</span>
                                              <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{plugin.competitionScore?.toFixed(3) ?? "n/a"}</span>
                                            </div>
                                            <div className="flex justify-between gap-2">
                                              <span className="text-slate-500 dark:text-slate-400">Satisfaction</span>
                                              <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{plugin.satisfactionScore?.toFixed(3) ?? "n/a"}</span>
                                            </div>
                                            <div className="flex justify-between gap-2">
                                              <span className="text-slate-500 dark:text-slate-400">Freshness</span>
                                              <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">{plugin.freshnessScore?.toFixed(3) ?? "n/a"}</span>
                                            </div>
                                            <div className="flex justify-between gap-2">
                                              <span className="text-slate-500 dark:text-slate-400">Final Score</span>
                                              <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{plugin.opportunityScore?.toFixed(3) ?? "n/a"}</span>
                                            </div>
                                          </div>
                                          <div className="mt-2">
                                            <a
                                              href={plugin.pluginUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                                            >
                                              View on WordPress.org ↗
                                            </a>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ── Pagination ── */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Page {page} of {totalPages} &mdash; {filtered.length} categories
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage(1)}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      «
                    </button>
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ‹ Prev
                    </button>
                    {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(page - 3, totalPages - 6));
                      const p = start + i;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPage(p)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                            p === page
                              ? "bg-cyan-600 text-white"
                              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next ›
                    </button>
                    <button
                      type="button"
                      disabled={page === totalPages}
                      onClick={() => setPage(totalPages)}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      »
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
