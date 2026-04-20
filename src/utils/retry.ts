/**
 * Generic retry utility.
 *
 * Retries an async function up to `maxAttempts` times before re-throwing.
 * On each failure (except the last), waits `delayMs` milliseconds before retrying.
 * On final failure, logs the error with a timestamp and re-throws.
 *
 * @param fn          - Async function to retry
 * @param maxAttempts - Maximum number of attempts (must be >= 1)
 * @param delayMs     - Milliseconds to wait between attempts
 * @param label       - Optional label for log messages (e.g. "Jira fetch")
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayMs: number,
  label = 'operation'
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const ts = new Date().toISOString();

      if (attempt < maxAttempts) {
        console.warn(
          `[RETRY] ${ts} — ${label} failed (attempt ${attempt}/${maxAttempts}). ` +
          `Retrying in ${delayMs}ms. Error: ${err}`
        );
        await sleep(delayMs);
      } else {
        console.error(
          `[RETRY] ${ts} — ${label} failed after ${maxAttempts} attempt(s). ` +
          `Final error: ${err}`
        );
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
