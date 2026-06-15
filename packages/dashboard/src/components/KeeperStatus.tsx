// Keeper liveness — read straight off the on-chain heartbeat, never a process
// self-report. The keeper pokes the GuardianPolicy every ~5 min; every poke (and
// every agent submit) stamps `last_check_ms` on-chain. So "how long since the
// guardian was last checked on-chain" IS the keeper-alive signal — and it's
// trust-minimized: it comes from the chain, so a dead or lying keeper can't fake
// a fresh heartbeat. Pure display (App reads last_check_ms via usePolicy).
const FRESH_MS = 6 * 60_000; // within one 5-min cadence (+1 min grace) → alive
const STALE_MS = 12 * 60_000; // 2+ missed pokes → treat as down

function agoText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export function KeeperStatus({ lastCheckMs }: { lastCheckMs?: number }) {
  if (!lastCheckMs) {
    return (
      <span className="muted stat-item" title="keeper heartbeat: the keeper pokes the guardian every ~5 min (on-chain last_check)">
        <span className="dot dot-idle" /> keeper —
      </span>
    );
  }
  const age = Date.now() - lastCheckMs;
  const state = age <= FRESH_MS ? "ok" : age <= STALE_MS ? "warn" : "down";
  const dot = state === "ok" ? "dot-ok" : state === "warn" ? "dot-warn" : "dot-bad";
  const label = state === "down" ? "keeper down" : "keeper alive";
  return (
    <span className="muted stat-item" title="on-chain heartbeat — the keeper pokes the guardian every ~5 min (last_check_ms)">
      <span className={`dot ${dot}`} /> {label} · {agoText(age)}
    </span>
  );
}
