// Frozen guardian event shapes the ActionLog binds to. u64/u128 arrive as decimal
// STRINGS over JSON-RPC — never compare them as numbers without BigInt/Number first.
import { CFG } from "./config";

export type GuardianEventKind =
  | "RiskEvaluated"
  | "RequestClamped"
  | "RequestRejected"
  | "Frozen"
  | "Unfrozen"
  | "CorridorChanged"
  | "AgentRotated"
  | "PolicyCreated";

export interface GuardianEventRow {
  kind: GuardianEventKind;
  digest: string;
  tsMs: number;
  // flattened, kind-specific (strings already coerced to numbers where small)
  json: Record<string, unknown>;
}

const PARAM = (p: unknown): string => (Number(p) === 0 ? "max_ltv" : "borrow_cap");

/// One-line human summary for a row (the demo's readable action feed).
export function summarize(r: GuardianEventRow): string {
  const j = r.json as any;
  switch (r.kind) {
    case "RiskEvaluated":
      return j.had_request
        ? `agent submit · score ${j.advisory_score} · applied LTV ${j.max_ltv_current_bps}/cap ${j.borrow_cap_current_bps}`
        : `keeper poke · div ${(Number(j.div_own) / 1e7).toFixed(2)}% · applied LTV ${j.max_ltv_current_bps}`;
    case "RequestClamped":
      return `⚠ clamped ${PARAM(j.param)}: asked ${j.requested_bps} → applied ${j.applied_bps}`;
    case "RequestRejected":
      return `⛔ rejected (looser) ${PARAM(j.param)}: asked ${j.requested_bps} → held ${j.applied_bps}`;
    case "Frozen":
      return `🧊 FROZEN — contract-only · ${Number(j.cause) === 1 ? "book-not-ok" : `div ${(Number(j.div) / 1e7).toFixed(2)}%`}`;
    case "Unfrozen":
      return `🔓 unfrozen by DAO`;
    case "CorridorChanged":
      return `DAO set corridor`;
    case "AgentRotated":
      return `DAO rotated agent`;
    case "PolicyCreated":
      return `policy created`;
    default:
      return r.kind;
  }
}

export const txUrl = (digest: string): string => `${CFG.explorerTx}/${digest}`;

/// The KEEPER-liveness source (trust-minimized): the ts of the newest permissionless
/// poke = the newest RiskEvaluated with had_request===false. An agent `submit` is
/// had_request===true and so can NEVER masquerade as the keeper here (the fix for the
/// old last_check_ms pill, which the agent's 5-min heartbeat kept falsely green).
/// NB: a demo-vault borrow/withdraw also pokes (had_request=false); the keeper is the
/// only REGULAR 5-min poker, so this is a keeper-style-poke freshness signal.
export function lastKeeperPokeMs(events: GuardianEventRow[]): number | undefined {
  return events.find(
    (e) => e.kind === "RiskEvaluated" && (e.json as { had_request?: boolean }).had_request === false,
  )?.tsMs;
}
