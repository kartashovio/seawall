// The one-glance verdict: a state chip + a plain-language line that reads the
// system's posture off props App already holds (no new data). FROZEN > CAUTION >
// NORMAL. FROZEN is the only state that says "the contract… itself" + "no agent
// say" (the freeze is never agent-attributed); NORMAL never claims "safe" — it
// says the wall is holding. Copy is deliberately plain (the ml-docs voice).
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
  const word = paused ? "FROZEN" : caution ? "CAUTION" : "NORMAL";
  const headline = paused ? "Market paused" : caution ? "Tightened — only safer" : "Calm seas";
  const sentence = paused
    ? "The contract found a real Pyth↔DeepBook break in its own on-chain reading and stopped the market. The agent had no say in this — only the DAO can lift it."
    : caution
      ? "The radar flagged stress, so the contract pulled the lending knobs tighter, within the DAO's bounds. It re-checked the agent's number against its own on-chain data first — it never takes it on faith."
      : "The wall is at full strength. The radar is watching and the contract has nothing it needs to act on.";

  return (
    <div className={`posture is-${state}`} role="status">
      <div className="posture-state">
        <span className="pword">{word}</span>
        <span className="pheadline">{headline}</span>
      </div>
      <span className="psentence">{sentence}</span>
      <span className="pago">
        last on-chain action
        <br />
        <b>{ago}</b>
      </span>
    </div>
  );
}
