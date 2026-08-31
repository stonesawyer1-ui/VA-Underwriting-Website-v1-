/**
 * A genuine, absolute wall-clock deadline for a research call.
 *
 * The Anthropic SDK's own `timeout` client option turned out NOT to be
 * enough on its own (2026-08-31 incident, finnx27@gmail.com): a
 * multi-round web-search call can keep the underlying connection looking
 * "alive" (periodic low-level traffic) well past that timeout without ever
 * throwing, because that option behaves like an idle timeout rather than a
 * hard total-duration cutoff. A real submission ran past 110s without the
 * SDK ever raising a timeout error, and the whole request was eventually
 * killed by Vercel's own 300s ceiling instead — the worst outcome, since
 * nothing in our own code got a chance to log or respond first.
 *
 * This wraps a call with our own setTimeout + AbortController, which force-
 * aborts the underlying request at exactly `ms`, regardless of what the
 * connection looks like at the HTTP level.
 */
export async function withHardDeadline<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error(`Hard deadline of ${ms}ms exceeded`)), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}
