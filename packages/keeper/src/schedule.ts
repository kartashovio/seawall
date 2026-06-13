// Drift-free scheduler. A naive setInterval accumulates drift over a long demo;
// we recompute the next deadline from a fixed epoch each iteration, so ticks
// stay aligned to the grid no matter how long fn() takes.

/// The next grid point strictly after `now` (deadlines = epochMs + k·periodMs).
export function nextDeadlineMs(now: number, periodMs: number, epochMs = 0): number {
  const k = Math.floor((now - epochMs) / periodMs) + 1;
  return epochMs + k * periodMs;
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });

/// Runs fn() on a drift-free grid until aborted. Does NOT fire on entry (the
/// caller fires the boot tick); subsequent ticks land on the aligned grid.
export async function everyMs(
  periodMs: number,
  fn: () => Promise<void>,
  opts: { epochMs?: number; signal: AbortSignal },
): Promise<void> {
  const epochMs = opts.epochMs ?? 0;
  while (!opts.signal.aborted) {
    const next = nextDeadlineMs(Date.now(), periodMs, epochMs);
    await sleep(next - Date.now(), opts.signal);
    if (opts.signal.aborted) break;
    await fn();
  }
}
