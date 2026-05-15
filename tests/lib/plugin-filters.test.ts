import { describe, expect, it } from "vitest";
import {
  collectFacetOptions,
  matchesCategorySelection,
  matchesTextSearch,
  uniqueSorted,
} from "@/lib/plugin-filters";

describe("uniqueSorted", () => {
  it("deduplicates and sorts string values", () => {
    expect(uniqueSorted(["Forms", "SEO", "Forms", "Booking"]))
      .toEqual(["Booking", "Forms", "SEO"]);
  });
});

describe("collectFacetOptions", () => {
  it("returns sorted unique category and subcategory options", () => {
    expect(
      collectFacetOptions([
        { category: "SEO", subcategory: "Schema" },
        { category: "SEO", subcategory: "Local SEO" },
        { category: "Forms", subcategory: "Intake" },
        { category: "SEO", subcategory: "Schema" },
      ]),
    ).toEqual({
      categories: ["Forms", "SEO"],
      subcategories: ["Intake", "Local SEO", "Schema"],
    });
  });
});

describe("matchesCategorySelection", () => {
  it("matches everything when no category filters are selected", () => {
    expect(
      matchesCategorySelection({
        category: "Booking",
        subcategory: "Appointments",
        selectedCategories: [],
        selectedSubcategories: [],
      }),
    ).toBe(true);
  });

  it("matches when the category is selected", () => {
    expect(
      matchesCategorySelection({
        category: "Booking",
        subcategory: "Appointments",
        selectedCategories: ["Booking"],
        selectedSubcategories: [],
      }),
    ).toBe(true);
  });

  it("matches when the subcategory is selected", () => {
    expect(
      matchesCategorySelection({
        category: "Booking",
        subcategory: "Appointments",
        selectedCategories: [],
        selectedSubcategories: ["Appointments"],
      }),
    ).toBe(true);
  });

  it("uses broad OR when both groups have selections", () => {
    expect(
      matchesCategorySelection({
        category: "SEO",
        subcategory: "Schema",
        selectedCategories: ["Forms"],
        selectedSubcategories: ["Schema"],
      }),
    ).toBe(true);
  });

  it("rejects rows that match neither selected group", () => {
    expect(
      matchesCategorySelection({
        category: "SEO",
        subcategory: "Schema",
        selectedCategories: ["Forms"],
        selectedSubcategories: ["Intake"],
      }),
    ).toBe(false);
  });
});

describe("matchesTextSearch", () => {
  it("matches plugin names case-insensitively", () => {
    expect(matchesTextSearch(["Appointment Scheduler", "Booking widgets"], "scheduler")).toBe(true);
  });

  it("matches plugin descriptions", () => {
    expect(matchesTextSearch(["Salon forms", "Collect consultations and intake details"], "intake")).toBe(true);
  });

  it("returns false when neither title nor description match", () => {
    expect(matchesTextSearch(["Salon forms", "Collect consultations and intake details"], "mortgage")).toBe(false);
  });
});