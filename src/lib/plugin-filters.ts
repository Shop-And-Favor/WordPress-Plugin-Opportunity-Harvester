type CategoryLike = {
  category: string;
  subcategory: string;
};

export function uniqueSorted(values: Iterable<string>) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function collectFacetOptions<T extends CategoryLike>(rows: T[]) {
  return {
    categories: uniqueSorted(rows.map((row) => row.category)),
    subcategories: uniqueSorted(rows.map((row) => row.subcategory)),
  };
}

export function matchesCategorySelection(input: {
  category: string;
  subcategory: string;
  selectedCategories: string[];
  selectedSubcategories: string[];
}) {
  const { category, subcategory, selectedCategories, selectedSubcategories } = input;

  if (selectedCategories.length === 0 && selectedSubcategories.length === 0) {
    return true;
  }

  return selectedCategories.includes(category) || selectedSubcategories.includes(subcategory);
}

export function matchesTextSearch(values: Array<string | null | undefined>, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(query));
}