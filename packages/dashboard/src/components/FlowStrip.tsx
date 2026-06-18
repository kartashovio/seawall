// b2 — the sequential spine of the "How it works" band: AI radar → the contract
// re-derives → it acts, in one block. Authored as VERB-PHRASES (the sequence),
// distinct from the ladder below it (which shows realized STATE).
//
// Color legend is load-bearing and fixed: the first node is AMBER (the untrusted
// agent); the last two are CYAN (the on-chain trust root). The connectors are
// deliberately NEUTRAL — never colored — so no arrow can be read as the agent
// reaching into the freeze. Pure presentational, no props, no data.
export function FlowStrip() {
  return (
    <div
      className="flow-strip"
      role="img"
      aria-label="Flow: an off-chain AI radar emits a 0 to 100 advisory score, the contract re-derives the breach from raw Pyth and DeepBook itself, then acts in one atomic transaction"
    >
      <span className="flow-node flow-node--agent">AI radar · 0–100 advisory</span>
      <span className="flow-arrow" aria-hidden="true">→</span>
      <span className="flow-node flow-node--contract">contract re-derives breach</span>
      <span className="flow-arrow" aria-hidden="true">→</span>
      <span className="flow-node flow-node--contract">act · one PTB</span>
    </div>
  );
}
