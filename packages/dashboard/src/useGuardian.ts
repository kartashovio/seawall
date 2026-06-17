// On-chain reads via dapp-kit classic hooks (useSuiClientQuery). The polled
// guardian event log IS must-have #3's evidence (autonomous on-chain actions),
// and the policy object gives paused + the live corridor.
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { CFG } from "./config";
import type { GuardianEventRow, GuardianEventKind } from "./abi";

export function useGuardianEvents(refetchMs = 2500): GuardianEventRow[] {
  const { data } = useSuiClientQuery(
    "queryEvents",
    { query: { MoveModule: { package: CFG.packageId, module: "guardian" } }, limit: 50, order: "descending" },
    { refetchInterval: refetchMs },
  );
  if (!data) return [];
  return data.data.map((e) => ({
    kind: (e.type.split("::").pop() ?? "") as GuardianEventKind,
    digest: e.id.txDigest,
    tsMs: Number(e.timestampMs ?? 0),
    json: (e.parsedJson ?? {}) as Record<string, unknown>,
  }));
}

export interface PolicyView {
  paused: boolean;
  maxLtvCurrentBps: number;
  borrowCapCurrentBps: number;
  // DAO-set corridor bounds (the agent can never touch these) — drive the
  // governance corridor editor's seed values + the validation envelope.
  maxLtvFloorBps: number;
  maxLtvBaselineBps: number;
  borrowCapFloorBps: number;
  borrowCapBaselineBps: number;
  registeredAgent: string;
  lastCheckMs: number;
}

export function usePolicy(refetchMs = 2500): PolicyView | null {
  const { data } = useSuiClientQuery(
    "getObject",
    { id: CFG.policyId, options: { showContent: true } },
    { refetchInterval: refetchMs },
  );
  const f = (data?.data?.content as any)?.fields;
  if (!f) return null;
  return {
    paused: !!f.paused,
    maxLtvCurrentBps: Number(f.max_ltv_current_bps),
    borrowCapCurrentBps: Number(f.borrow_cap_current_bps),
    maxLtvFloorBps: Number(f.max_ltv_floor_bps),
    maxLtvBaselineBps: Number(f.max_ltv_baseline_bps),
    borrowCapFloorBps: Number(f.borrow_cap_floor_bps),
    borrowCapBaselineBps: Number(f.borrow_cap_baseline_bps),
    registeredAgent: String(f.registered_agent ?? ""),
    lastCheckMs: Number(f.last_check_ms),
  };
}
