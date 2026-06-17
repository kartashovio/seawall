// The plain-language explainer that sits UNDER the architecture diagram — the
// judge/newcomer onramp that replaced the old thesis strip. Copy is the product
// of a 3-draft → judge-panel → synthesis pass (see the design note in the repo);
// it is deliberately SEQUENTIAL and trust-first: lead with "the AI is never
// trusted", then one risk event start-to-finish, then the guarantees + why Sui.
//
// Pure presentational, no data/props — static markup so it renders in the
// DOM-free static tests. Colors map to the same actor legend the rest of the
// dashboard uses: amber = the (untrusted) agent, cyan = the contract, dao-blue =
// the DAO. Step 1 is the only amber rung (the one place the agent acts); the
// contract owns every rung after it.

import { DIV } from "../config";

interface Item {
  title: string;
  body: string;
}

// Keep the prose in lockstep with the contract: the freeze threshold is the
// SAME shared constant the gauge bands bind to (T_FREEZE → DIV.freezeBps = 500 bps).
const FREEZE_PCT = DIV.freezeBps / 100;

const INTRO =
  "The off-chain AI is never trusted: the contract re-derives every breach from raw on-chain data it reads itself, can only be pushed safer, and answers to one DAO key.";

// One risk event, first wobble to on-chain action. actor tints the rung.
const STEPS: Array<Item & { actor: "agent" | "contract" }> = [
  {
    actor: "agent",
    title: "the AI watches, off-chain",
    body: "An ML model watches the oracle and the order book across sources and outputs a 0–100 risk score. The score is shown but never reaches the contract's logic; when risk climbs, it sends one request to tighten the lending limits.",
  },
  {
    actor: "contract",
    title: "the contract re-derives the breach",
    body: "In one Sui transaction the contract reads raw Pyth and DeepBook itself and recomputes the divergence from scratch. It acts only on its own reading, never on the agent's word.",
  },
  {
    actor: "contract",
    title: "tighten now, relax slowly",
    body: "The request is clamped to the safe direction inside fixed DAO-set bounds. A safer limit applies instantly; a looser one drips back one notch at a time, and only after an all-clear has held.",
  },
  {
    actor: "contract",
    title: "freeze is contract-only",
    body: `If the contract's own divergence crosses ${FREEZE_PCT}%, or the book goes unusable, it freezes borrowing and withdrawals on its own. The agent has no part in the freeze.`,
  },
  {
    actor: "contract",
    title: "the inline floor, always on",
    body: "Every borrow and withdrawal re-runs the guardian inline, with no agent input. A frozen market or a breached limit rejects the transaction — even if the agent is dead.",
  },
];

// Why you don't have to trust the agent. accent maps to the actor each guarantee
// is *about* (contract holds the truth · agent is fenced in · DAO holds the key).
const GUARDS: Array<Item & { accent: "contract" | "agent" | "dao" }> = [
  {
    accent: "contract",
    title: "the AI's number is never trusted",
    body: "The contract acts only on divergence it reads and computes itself, so a wrong, late, or malicious score changes nothing it enforces. The AI's value is being early and smooth; the contract's value is being safe.",
  },
  {
    accent: "agent",
    title: "a one-way ratchet",
    body: "Settings only ever move toward safer. The agent cannot loosen a limit, lift a freeze, or touch the liquidation buffer that could harm users. Kill it and the market just stays strict.",
  },
  {
    accent: "dao",
    title: "only the DAO loosens or unfreezes",
    body: "Re-widening the bounds and unfreezing the market need an owned GovernanceCap the agent physically cannot hold. Move's type system enforces it; no off-chain key can reach it.",
  },
];

const WHY_SUI: Item[] = [
  {
    title: "one atomic block",
    body: "A single PTB posts fresh Pyth, re-derives the breach, and acts — no relay or glue window for the price to slip through.",
  },
  {
    title: "safety in the types",
    body: 'Move capabilities put the unfreeze key out of the agent\'s reach; "only push safer" is enforced at the type level, not by trust.',
  },
  {
    title: "native DeepBook CLOB",
    body: "The on-chain order book is the divergence reference the contract reads itself, checked against the oracle.",
  },
];

const ONE_LINER = "manual freeze takes hours, a DAO vote takes days, Seawall takes one block — and you never have to trust it.";

export function HowItWorks() {
  return (
    <div className="hiw">
      <p className="hiw-intro">{INTRO}</p>

      <div className="hiw-flow">
        <div className="hiw-subhead">
          <span className="kicker">What happens</span>
          <span className="hiw-subhead-note">one risk event, start to finish</span>
        </div>
        <ol className="hiw-steps">
          {STEPS.map((s, i) => (
            <li key={i} className={`hiw-step hiw-step--${s.actor}`}>
              <span className="hiw-step-n">{i + 1}</span>
              <div className="hiw-step-main">
                <span className="hiw-step-title">{s.title}</span>
                <p className="hiw-step-text">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="hiw-cols">
        <div className="hiw-block">
          <div className="hiw-subhead">
            <span className="kicker">Why you don't trust the agent</span>
          </div>
          <div className="hiw-guards">
            {GUARDS.map((g, i) => (
              <div key={i} className={`hiw-guard hiw-guard--${g.accent}`}>
                <span className="hiw-guard-title">{g.title}</span>
                <p className="hiw-guard-text">{g.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="hiw-block">
          <div className="hiw-subhead">
            <span className="kicker">Why Sui</span>
          </div>
          <div className="hiw-why">
            {WHY_SUI.map((w, i) => (
              <div key={i} className="hiw-why-item">
                <span className="hiw-why-title">{w.title}</span>
                <p className="hiw-why-text">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="hiw-oneliner">{ONE_LINER}</p>
    </div>
  );
}
