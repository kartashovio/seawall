// Pins the keeper-liveness selector: it must pick the newest permissionless POKE
// (RiskEvaluated had_request=false), never an agent SUBMIT (had_request=true) — the
// fix for the old last_check_ms pill that the agent's heartbeat kept falsely green.
import { describe, it, expect } from "vitest";
import { lastKeeperPokeMs } from "../src/abi";
import type { GuardianEventRow } from "../src/abi";

const ev = (tsMs: number, kind: GuardianEventRow["kind"], had_request?: boolean): GuardianEventRow => ({
  kind,
  digest: "0x" + tsMs,
  tsMs,
  json: had_request === undefined ? {} : { had_request },
});

describe("lastKeeperPokeMs — keeper poke vs agent submit", () => {
  it("picks the newest had_request=false (keeper poke), NOT the newer agent submit", () => {
    // events arrive newest-first (queryEvents order: descending)
    const events = [
      ev(500, "RiskEvaluated", true), // newest, but an AGENT submit — must be ignored
      ev(400, "RiskEvaluated", false), // the newest KEEPER poke → this one
      ev(300, "RiskEvaluated", false),
      ev(200, "RiskEvaluated", true),
    ];
    expect(lastKeeperPokeMs(events)).toBe(400);
  });

  it("returns undefined when there is no keeper poke (only agent submits)", () => {
    const events = [ev(500, "RiskEvaluated", true), ev(400, "RiskEvaluated", true)];
    expect(lastKeeperPokeMs(events)).toBeUndefined();
  });

  it("returns undefined for empty events", () => {
    expect(lastKeeperPokeMs([])).toBeUndefined();
  });

  it("ignores non-RiskEvaluated events", () => {
    const events = [ev(600, "RequestClamped"), ev(500, "Frozen"), ev(450, "RiskEvaluated", false)];
    expect(lastKeeperPokeMs(events)).toBe(450);
  });
});
