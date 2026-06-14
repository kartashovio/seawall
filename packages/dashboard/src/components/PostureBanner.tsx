// The synthesized verdict — one word + one sentence that reads the system's
// current posture off props App already holds (no new data): FROZEN > CAUTION
// ACTIVE > NORMAL. Replaces the old standalone frozen-banner. FROZEN is the only
// state that says "the contract… itself" + "No agent input" (FREEZE is never
// agent-attributed); NORMAL never says "safe" — it says the wall is holding.
import type { BpsPair } from "@seawall/shared";

export function PostureBanner({
  paused,
  applied,
  baseline,
  ago,
}: {
  paused: boolean;
  applied: BpsPair;
  baseline: BpsPair;
  ago: string;
}) {
  const caution = applied.maxLtv < baseline.maxLtv || applied.borrowCap < baseline.borrowCap;
  const state = paused ? "frozen" : caution ? "caution" : "normal";
  const word = paused ? "FROZEN" : caution ? "CAUTION ACTIVE" : "NORMAL";
  const sentence = paused
    ? "Hard stop. The contract re-derived a Pyth↔DeepBook breach itself and paused the market. No agent input — only the DAO can unfreeze."
    : caution
      ? "The radar flagged a rising surge. The contract accepted a clamped tighten — params ratcheted toward floor, only-safer. The agent's number was re-checked, not trusted."
      : "Calm seas. The wall is holding at full corridor — the agent is watching, the contract has nothing to act on.";

  return (
    <div className={`posture is-${state}`} role="status">
      <span className="pword">{word}</span>
      <span className="psentence">{sentence}</span>
      <span className="pago">
        last on-chain action
        <br />
        <b>{ago}</b>
      </span>
    </div>
  );
}
