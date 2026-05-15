import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateDistinctQueryIdeas } from "@/lib/server/openrouter";
import { normalizeQuery } from "@/lib/server/normalize";

vi.mock("@/lib/server/config", () => ({
  getEnv: () => ({
    OPENROUTER_API_KEY: "test-key-12345",
  }),
}));

 
global.fetch = vi.fn();

describe("generateDistinctQueryIdeas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate queries from seed", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              queries: [
                { query: "popup sales", type: "short" },
                { query: "abandoned cart recovery", type: "long" },
              ],
            }),
          },
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const ideas = await generateDistinctQueryIdeas({
      count: 2,
      seed: ["popup", "sales"],
    });

    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas[0]).toHaveProperty("query");
    expect(ideas[0]).toHaveProperty("type");
  });

  it("should deduplicate similar queries", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              queries: [
                { query: "popup sales", type: "short" },
                { query: "POPUP SALES", type: "short" },
                { query: "pop up sales", type: "short" },
                { query: "sales popup widget", type: "long" },
              ],
            }),
          },
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const ideas = await generateDistinctQueryIdeas({
      count: 4,
      seed: ["popup"],
    });

    const normalized = ideas.map((idea) => normalizeQuery(idea.query));
    const unique = new Set(normalized);

    expect(unique.size).toBe(normalized.length);
  });

  it("should fallback to secondary model on error", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("Primary model timeout"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  queries: [{ query: "fallback query", type: "short" }],
                }),
              },
            },
          ],
        }),
      });

    const ideas = await generateDistinctQueryIdeas({
      count: 1,
      seed: ["test"],
    });

    expect(ideas.length).toBeGreaterThan(0);
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("should return empty array for invalid JSON response", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Not valid JSON",
            },
          },
        ],
      }),
    });

    const ideas = await generateDistinctQueryIdeas({
      count: 5,
      seed: ["popup"],
    });

    expect(Array.isArray(ideas)).toBe(true);
  });

  it("should respect count limits", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              queries: Array.from({ length: 300 }, (_, i) => ({
                query: `query ${i}`,
                type: i % 2 === 0 ? "short" : "long",
              })),
            }),
          },
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const ideas = await generateDistinctQueryIdeas({
      count: 50,
      seed: ["test"],
    });

    expect(ideas.length).toBeLessThanOrEqual(250);
  });
});
