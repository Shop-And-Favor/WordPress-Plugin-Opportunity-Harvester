import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock, getPrismaMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  getPrismaMock: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  getPrisma: getPrismaMock,
}));

import { GET } from "@/app/api/plugins/route";

describe("GET /api/plugins", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    getPrismaMock.mockReset();
    getPrismaMock.mockResolvedValue({
      pluginCategoryMap: {
        findMany: findManyMock,
      },
    });
  });

  it("returns flat plugin opportunity rows with category context", async () => {
    findManyMock.mockResolvedValue([
      {
        id: 11,
        plugin: {
          id: 3,
          name: "Salon Scheduler",
          slug: "salon-scheduler",
          pluginUrl: "https://wordpress.org/plugins/salon-scheduler/",
          shortDescription: "Booking and intake forms for salons",
          author: "ACME",
          rating: 4.7,
          ratingCount: 120,
          activeInstalls: 2400,
          downloadedCount: 9000,
          demandScore: 0.72,
          competitionScore: 0.35,
          satisfactionScore: 0.81,
          freshnessScore: 0.64,
          opportunityScore: 0.78,
          opportunityTier: "high",
        },
        category: {
          id: 5,
          category: "Booking",
          subcategory: "Appointments",
        },
      },
    ]);

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      plugins: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.plugins).toEqual([
      {
        id: 11,
        pluginId: 3,
        name: "Salon Scheduler",
        slug: "salon-scheduler",
        pluginUrl: "https://wordpress.org/plugins/salon-scheduler/",
        shortDescription: "Booking and intake forms for salons",
        author: "ACME",
        rating: 4.7,
        ratingCount: 120,
        activeInstalls: 2400,
        downloadedCount: 9000,
        demandScore: 0.72,
        competitionScore: 0.35,
        satisfactionScore: 0.81,
        freshnessScore: 0.64,
        opportunityScore: 0.78,
        opportunityTier: "high",
        categoryId: 5,
        category: "Booking",
        subcategory: "Appointments",
      },
    ]);
    expect(findManyMock).toHaveBeenCalledOnce();
  });

  it("returns a 500 payload when the query fails", async () => {
    getPrismaMock.mockRejectedValue(new Error("Database offline"));

    const response = await GET();
    const payload = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(500);
    expect(payload).toEqual({ ok: false, error: "Database offline" });
  });
});