export interface KeeperConfig {
  packageId: string;
  policyId: string;
  poolId: string;
  feedId: string;
  dbusdcType: string;
  pythState: string;
  wormholeState: string;
  registeredAgent: string; // the policy's agent — the keeper key must DIFFER from it
  hermesUrl: string;
}

export interface PolicySnapshot {
  paused: boolean;
  maxLtvCurrentBps: number;
  borrowCapCurrentBps: number;
  lastCheckMs: number;
  lastChangeMs: number;
  lastBreachMs: number;
  epoch: number;
  feedId: string; // raw 32-byte hex (0x…)
}

export interface TickResult {
  ok: boolean;
  digest?: string;
  divOwn?: bigint;
  signal?: number;
  paused?: boolean;
  frozeThisTick?: boolean;
  lastCheckMs?: number;
  error?: string;
}
