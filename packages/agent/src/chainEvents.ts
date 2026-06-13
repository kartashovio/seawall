// Reads guardian events for the action log + post-submit confirmation. The
// dashboard polls these too (Step 6). u64/u128 arrive as decimal strings.
import type { SuiClient } from "@mysten/sui/client";

export interface RiskEvaluatedEvent {
  hadRequest: boolean;
  advisoryScore: number;
  divOwn: bigint;
  signal: number;
  paused: boolean;
  maxLtvCurrentBps: number;
  borrowCapCurrentBps: number;
  maxLtvRequestedBps: number;
  borrowCapRequestedBps: number;
  epoch: number;
  tsMs: number;
}

export function parseRiskEvaluated(parsed: any): RiskEvaluatedEvent {
  return {
    hadRequest: !!parsed.had_request,
    advisoryScore: Number(parsed.advisory_score),
    divOwn: BigInt(parsed.div_own),
    signal: Number(parsed.signal),
    paused: !!parsed.paused,
    maxLtvCurrentBps: Number(parsed.max_ltv_current_bps),
    borrowCapCurrentBps: Number(parsed.borrow_cap_current_bps),
    maxLtvRequestedBps: Number(parsed.max_ltv_requested_bps),
    borrowCapRequestedBps: Number(parsed.borrow_cap_requested_bps),
    epoch: Number(parsed.epoch),
    tsMs: Number(parsed.ts_ms),
  };
}

/// Recent guardian-module events (newest first), already JSON-parsed.
export async function recentEvents(
  client: SuiClient,
  packageId: string,
  limit = 50,
): Promise<{ type: string; parsedJson: any; ts: string | null | undefined }[]> {
  const res = await client.queryEvents({
    query: { MoveModule: { package: packageId, module: "guardian" } },
    limit,
    order: "descending",
  });
  return res.data.map((e) => ({ type: e.type, parsedJson: e.parsedJson, ts: e.timestampMs }));
}

/// The applied corridor from the most recent RiskEvaluated (the event-sourced
/// ratchet baseline). Returns null if none seen yet.
export async function lastAppliedFromEvents(
  client: SuiClient,
  packageId: string,
): Promise<{ maxLtv: number; borrowCap: number } | null> {
  const evs = await recentEvents(client, packageId, 20);
  const re = evs.find((e) => e.type.endsWith("::guardian::RiskEvaluated"));
  if (!re) return null;
  const p = parseRiskEvaluated(re.parsedJson);
  return { maxLtv: p.maxLtvCurrentBps, borrowCap: p.borrowCapCurrentBps };
}
