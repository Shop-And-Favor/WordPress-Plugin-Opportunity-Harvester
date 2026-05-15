type TaxonomyMultiSelectProps = {
  categories: string[];
  subcategories: string[];
  selectedCategories: string[];
  selectedSubcategories: string[];
  onToggleCategory: (value: string) => void;
  onToggleSubcategory: (value: string) => void;
  helperText?: string;
};

export function TaxonomyMultiSelect({
  categories,
  subcategories,
  selectedCategories,
  selectedSubcategories,
  onToggleCategory,
  onToggleSubcategory,
  helperText,
}: TaxonomyMultiSelectProps) {
  return (
    <div className="space-y-4">
      {helperText ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
      ) : null}

      {categories.length > 0 ? (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Category
          </label>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {categories.map((category) => {
              const active = selectedCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => onToggleCategory(category)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {subcategories.length > 0 ? (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Subcategory
          </label>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {subcategories.map((subcategory) => {
              const active = selectedSubcategories.includes(subcategory);
              return (
                <button
                  key={subcategory}
                  type="button"
                  onClick={() => onToggleSubcategory(subcategory)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-cyan-50 hover:text-cyan-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-300"
                  }`}
                >
                  {subcategory}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}