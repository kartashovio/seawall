// A page-top ALARM shown ONLY on a hard stop (FROZEN). The NORMAL / CAUTION state
// is already covered by the panels below (the How-it-works ladder and The reading
// band), so we don't repeat a "current state" banner there — only the contract-only
// freeze warrants a top-of-page alarm. role="alert" (assertive) so a screen reader
// announces a market halt immediately, not after the current utterance ends.
export function PostureBanner({ paused }: { paused: boolean }) {
  if (!paused) return null;
  return (
    <div className="posture is-frozen" role="alert">
      <div className="posture-state">
        <span className="pword">FROZEN</span>
        <span className="pheadline">Market paused</span>
      </div>
      <span className="psentence">
        The contract found a real Pyth↔DeepBook break in its own on-chain reading and stopped the market. The agent had no say
        in this — only the DAO can lift it.
      </span>
    </div>
  );
}
