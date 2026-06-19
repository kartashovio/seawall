// The body of the "What Sui makes possible" band (the band claim header lives in
// App.tsx): the three described Sui-primitive legs (PTB atomicity, Move
// capabilities, native DeepBook CLOB) — the "meaningful Sui" evidence the 20%
// Technical rubric rewards, stated as facts a judge can check. The detailed
// architecture schematic used to live here too; it now stands as its own bare
// disclosure band (ArchitectureReveal) between "how it works" and this band.
//
// Colour: about the contract / the Sui platform → cyan only. Pure presentational,
// no props.
const WHY_SUI = [
  {
    id: "ptb",
    title: "One atomic PTB",
    body: "One transaction posts the signed Pyth update and acts on the re-derived breach — no relay window to slip through.",
  },
  {
    id: "movetype",
    title: "Move capabilities",
    body: "Capabilities and object ownership put the rules in the type system: the agent can't hold the unfreeze cap, and the contract clamps every request to the safe direction.",
  },
  {
    id: "deepbook",
    title: "Native DeepBook CLOB",
    body: "Sui has an on-chain central limit order book, so the contract reads the live order-book mid itself as the divergence reference — no external price needed.",
  },
] as const;

export function WiringReveal() {
  return (
    <section className="why-sui" aria-label="Sui primitives">
      <ol className="why-sui-legs">
        {WHY_SUI.map((leg, i) => (
          <li key={leg.id} className="wsui-leg">
            <span className="wsui-leg-num">{i + 1}</span>
            <div className="wsui-leg-text">
              <h3 className="wsui-leg-title">{leg.title}</h3>
              <p className="wsui-leg-body">{leg.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
