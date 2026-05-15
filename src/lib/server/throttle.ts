function jitter(ms: number) {
  const drift = Math.floor(Math.random() * 600) - 300;
  return Math.max(0, ms + drift);
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function safeDelay(baseMs = 1200) {
  await sleep(jitter(baseMs));
}

export async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }

      const waitMs = 1200 * 2 ** attempt;
      await safeDelay(waitMs);
    }
  }

  throw lastError;
}
