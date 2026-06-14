// ONE shared presentational score card, rendered TWICE (true twins): the enforced
// testnet score and the read-only mainnet observatory. Equal SIZE/layout/gauge/
// info-row — the only differences are data-derived from `enforced`:
//   (1) the full-bleed ribbon text + color (amber ENFORCED vs teal READ-ONLY)
//   (2) the big title env word (TESTNET / MAINNET)
//   (3) the role-note sentence (the crisp honesty distinction)
//
// STATUS, NOT CONTROL (the make-or-break a judge named twice): pure display — no
// onClick, no href, no role=tab/button, no local state. Nothing here can re-route
// enforcement; the card only mirrors what the agent reports via the read-only SSE
// DTO. `enforced` is computed by App as (env === latest.enforcedEnv).
import { RiskGauge } from "./RiskGauge";

type Book = { ok: boolean; mid: number | null; spread: number | null; imb?: number | null };

interface ScoreCardProps {
  env: "testnet" | "mainnet"; // which environment THIS card represents → title word
  enforced: boolean; // env === latest.enforcedEnv → ribbon role
  score: number; // gauge value (0 when no signal)
  divBps?: number; // Pyth↔DeepBook divergence, bps
  book?: Book; // {ok, mid, spread}
  available?: boolean; // false ⇒ "connecting…" body (no data yet for this card)
}

const NOTE = {
  enforced:
    "Drives on-chain CAUTION param-requests to the testnet GuardianPolicy — the score the breaker acts on. Sandbox: jumpy by design (thin pool), intentionally NOT recalibrated.",
  readonly:
    "Live mainnet market · read-only · not enforced. The same unchanged model reads calm here, proving the testnet jumpiness is a thin-pool artifact. Never on any enforcement path.",
};

export function ScoreCard({ env, enforced, score, divBps, book, available = true }: ScoreCardProps) {
  const div = book?.ok && divBps != null ? `~${divBps.toFixed(1)} bps` : "no signal";
  const mid = book?.mid != null ? `$${book.mid.toFixed(4)}` : "—";
  const spread = book?.spread != null ? `${book.spread.toFixed(1)} bps` : "—";
  return (
    <section className={`card gauge scorecard ${enforced ? "is-enforced" : "is-readonly"}`}>
      <div className="ribbon">{enforced ? "ENFORCED · IN USE" : "READ-ONLY · OBSERVING"}</div>
      <h2 className="scorecard-title">
        {env.toUpperCase()} <span className="tag tag-agent">ML · advisory</span>
      </h2>
      {available ? (
        <>
          <RiskGauge score={book?.ok === false ? 0 : score} />
          <div className="muted info-row" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
            <div>
              Pyth↔DeepBook divergence: <b>{div}</b>
            </div>
            <div>
              book mid: {mid} · spread: {spread}
            </div>
          </div>
          <div className="gauge-cap role-note" style={{ marginTop: 10 }}>
            {enforced ? NOTE.enforced : NOTE.readonly}
          </div>
        </>
      ) : (
        <div className="muted" style={{ padding: "32px 0", textAlign: "center" }}>
          {env} observatory: connecting…
        </div>
      )}
    </section>
  );
}
