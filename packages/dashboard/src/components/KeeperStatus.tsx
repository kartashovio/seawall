// Two distinct on-chain liveness signals, both read from the chain (never a
// process self-report), so a dead or lying process can't fake them:
//
//   • KeeperStatus  — is the KEEPER specifically alive? Driven by the freshness of
//     the latest `RiskEvaluated` with `had_request === false` — i.e. a permissionless
//     `poke` (the keeper's 5-min job), NOT an agent `submit` (had_request === true).
//     This is the fix for the earlier loose "keeper alive": the agent's own 5-min
//     heartbeat also stamps last_check_ms, so last_check_ms alone could show green
//     with a dead keeper. The had_request=false event can only come from a poke.
//
//   • GuardianHealth — is the policy being kept fresh on-chain AT ALL (by the keeper
//     OR the agent)? Driven by `last_check_ms`. This is the "healthy" heartbeat the
//     last_check_ms check moved into.
const FRESH_MS = 6 * 60_000; // within one 5-min cadence (+1 min grace)
const STALE_MS = 12 * 60_000; // 2+ missed → down

function agoText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function state(age: number): "ok" | "warn" | "down" {
  return age <= FRESH_MS ? "ok" : age <= STALE_MS ? "warn" : "down";
}
const dotFor = (s: "ok" | "warn" | "down"): string => (s === "ok" ? "dot-ok" : s === "warn" ? "dot-warn" : "dot-bad");

// KEEPER — freshness of the last permissionless poke (had_request=false event).
export function KeeperStatus({ keeperPokeMs }: { keeperPokeMs?: number }) {
  if (!keeperPokeMs) {
    return (
      <span className="muted stat-item" title="keeper liveness: freshness of the last on-chain poke (RiskEvaluated with had_request=false)">
        <span className="dot dot-idle" /> keeper —
      </span>
    );
  }
  const age = Date.now() - keeperPokeMs;
  const s = state(age);
  const label = s === "down" ? "keeper down" : "keeper";
  return (
    <span className="muted stat-item" title="last permissionless poke on-chain (the keeper's 5-min job — not an agent submit)">
      <span className={`dot ${dotFor(s)}`} /> {label} · {agoText(age)}
    </span>
  );
}

// GUARDIAN HEALTH — last_check_ms (kept fresh by the keeper OR the agent heartbeat).
export function GuardianHealth({ lastCheckMs }: { lastCheckMs?: number }) {
  if (!lastCheckMs) {
    return (
      <span className="muted stat-item" title="guardian heartbeat: on-chain last_check_ms (stamped by any keeper poke or agent submit)">
        <span className="dot dot-idle" /> guardian —
      </span>
    );
  }
  const age = Date.now() - lastCheckMs;
  const s = state(age);
  const label = s === "down" ? "guardian stale" : "guardian healthy";
  return (
    <span className="muted stat-item" title="on-chain last_check_ms — the policy was evaluated on-chain (by the keeper or the agent) this recently">
      <span className={`dot ${dotFor(s)}`} /> {label} · {agoText(age)}
    </span>
  );
}
