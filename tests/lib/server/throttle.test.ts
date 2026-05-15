import { describe, it, expect, vi } from "vitest";
import { sleep, safeDelay, withRetry } from "@/lib/server/throttle";

describe("sleep", () => {
  it("should wait for specified milliseconds", async () => {
    const start = Date.now();
    await sleep(100);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(95);
    expect(elapsed).toBeLessThan(200);
  });
});

describe("safeDelay", () => {
  it("should apply jitter around base delay", async () => {
    const start = Date.now();
    await safeDelay(1000);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(700);
    expect(elapsed).toBeLessThan(1600);
  });

  it("should use default base if not provided", async () => {
    const start = Date.now();
    await safeDelay();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThan(0);
  });
});

describe("withRetry", () => {
  it("should return result on first attempt success", async () => {
    const operation = vi.fn().mockResolvedValueOnce("success");

    const result = await withRetry(operation);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and eventually succeed", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("First attempt failed"))
      .mockRejectedValueOnce(new Error("Second attempt failed"))
      .mockResolvedValueOnce("success");

    const result = await withRetry(operation, 3);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should throw after max retries exceeded", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("Always fails"));

    await expect(withRetry(operation, 2)).rejects.toThrow("Always fails");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should apply exponential backoff between retries", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Fail 1"))
      .mockResolvedValueOnce("success");

    const start = Date.now();
    await withRetry(operation, 2);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThan(1000);
  });

  it("should handle async operations correctly", async () => {
    const operation = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve("async success"), 50);
        }),
    );

    const result = await withRetry(operation);

    expect(result).toBe("async success");
  });
});
