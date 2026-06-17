// "The freeze, recorded on-chain" — a NON-interactive witness block. Judges read
// it; they don't get to spam our contract with freezes. It renders one real,
// recorded testnet cycle (data/freeze-demo.json, produced by
// scripts/record-freeze-demo.ts): a normal borrow on a healthy policy, then a
// keeper-style ping that makes a stressed policy FREEZE on the contract's own
// re-derived divergence, then the IDENTICAL borrow aborting at the L1 inline
// floor (EFrozen, a real failed tx), then the DAO clearing the halt. Every step
// is a real transaction — each digest is explorer-linked and verifiable.
//
// Pure presentational, no props/handlers — static markup so it renders in the
// DOM-free static tests. House style: hand-built SVG (matching Sparkline's
// DivStrip), the .log/.logrow row idiom (matching ActionLog), the design-system
// color vars. Actor legend: emerald = healthy/live, coral = the contract's
// freeze/abort, dao-blue = the DAO override.
import freeze from "../data/freeze-demo.json";

// ── chart geometry (viewBox units; responsive frame at a fixed aspect) ──────────
const W = 760;
const H = 156;
const ML = 8;
const MR = 96; // right gutter for the threshold labels
const MT = 24; // top (band labels + freeze mark)
const MB = 20; // bottom (time axis)
const PW = W - ML - MR;
const PH = H - MT - MB;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

const series = freeze.series;
const freezeAtMs = freeze.marks.freezeAtMs;
const unfreezeAtMs = freeze.marks.unfreezeAtMs;
// Timeline domain: first reading → a hair past the last event, so the divergence
// line spans the frame and the closing LIVE band stays visible.
const tStart = series.length ? series[0].tMs : 0;
const lastMs = Math.max(unfreezeAtMs, series.length ? series[series.length - 1].tMs : unfreezeAtMs);
const span = Math.max(1, (lastMs - tStart) * 1.05);
const tEnd = tStart + span; // right edge of the timeline
// Divergence domain: headroom above the live gap so the line is legible while the
// (tiny) demo-T line still sits visibly above the floor.
const maxDiv = Math.max(0.5, ...series.map((s) => s.divPct)) * 1.3;

const tX = (ms: number): number => ML + clamp((ms - tStart) / span, 0, 1) * PW;
const dY = (v: number): number => MT + (1 - clamp(v, 0, maxDiv) / maxDiv) * PH;

const polyline = (pts: Array<[number, number]>): string => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(2)}`).join(" ");
const divLine = polyline(series.map((s): [number, number] => [tX(s.tMs), dY(s.divPct)]));

const STEP_META: Record<string, { cls: string; label: string; row: string }> = {
  normal: { cls: "k-ok", label: "OK", row: "" },
  freeze: { cls: "k-frozen", label: "FREEZE", row: " frozen" },
  abort: { cls: "k-reject", label: "ABORT", row: " reject" },
  unfreeze: { cls: "k-dao", label: "DAO", row: "" },
};

const objUrl = (id: string): string => `${freeze.explorerObjBase}/${id}`;
const txUrl = (d: string): string => `${freeze.explorerTxBase}/${d}`;
const recorded = new Date(freeze.recordedAt).toLocaleString("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function FreezeDemo() {
  return (
    <section className="card freeze-demo">
      <h2>
        The freeze, recorded on-chain <span className="tag tag-contract">witness · not interactive</span>
      </h2>
      <p className="muted fd-intro">
        One real testnet cycle, captured end-to-end — <b>LIVE → contract-only FREEZE → inline ABORT → DAO UNFREEZE</b>. Every
        step below is a real transaction; click any hash to verify it on the explorer.
      </p>

      {/* timeline chart */}
      <div className="rc-frame fd-frame">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="recorded freeze cycle timeline">
          {/* state bands: LIVE (emerald) → FROZEN (coral) → LIVE (emerald) */}
          <rect x={tX(0)} y={MT} width={tX(freezeAtMs) - tX(0)} height={PH} fill="var(--emerald-wash)" />
          <rect x={tX(freezeAtMs)} y={MT} width={tX(unfreezeAtMs) - tX(freezeAtMs)} height={PH} fill="var(--coral-wash)" />
          <rect x={tX(unfreezeAtMs)} y={MT} width={tX(tEnd) - tX(unfreezeAtMs)} height={PH} fill="var(--emerald-wash)" />

          {/* band labels (top, inside each band) */}
          <text x={(tX(0) + tX(freezeAtMs)) / 2} y={MT - 8} fontSize="9" fontWeight="700" fontFamily="var(--font-ui)" fill="var(--emerald-dim)" textAnchor="middle">
            LIVE
          </text>
          <text x={(tX(freezeAtMs) + tX(unfreezeAtMs)) / 2} y={MT - 8} fontSize="9" fontWeight="700" fontFamily="var(--font-ui)" fill="var(--coral-dim)" textAnchor="middle">
            FROZEN
          </text>
          <text x={(tX(unfreezeAtMs) + tX(tEnd)) / 2} y={MT - 8} fontSize="9" fontWeight="700" fontFamily="var(--font-ui)" fill="var(--emerald-dim)" textAnchor="middle">
            LIVE
          </text>

          {/* demo-T reference line (the deliberately tight threshold) */}
          <line x1={ML} y1={dY(freeze.demoTPct)} x2={ML + PW} y2={dY(freeze.demoTPct)} stroke="var(--coral-line)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <text x={ML + PW + 5} y={dY(freeze.demoTPct)} fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--coral-dim)" dominantBaseline="middle">
            demo T {freeze.demoTPct}%
          </text>
          {/* prod-T annotation (5% is far off this scale) */}
          <text x={ML + PW + 5} y={MT + 4} fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--muted-deep)" dominantBaseline="middle">
            prod T {freeze.prodTPct}% ↑
          </text>

          {/* divergence line (the contract's own Pyth↔DeepBook read) */}
          <polyline points={divLine} fill="none" stroke="var(--coral)" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {series.map((s, i) => (
            <circle key={i} cx={tX(s.tMs)} cy={dY(s.divPct)} r="2.4" fill="var(--coral)" />
          ))}

          {/* freeze + unfreeze markers */}
          <line x1={tX(freezeAtMs)} y1={MT} x2={tX(freezeAtMs)} y2={MT + PH} stroke="var(--coral)" strokeWidth="1.2" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          <line x1={tX(unfreezeAtMs)} y1={MT} x2={tX(unfreezeAtMs)} y2={MT + PH} stroke="var(--dao)" strokeWidth="1.2" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          <text x={tX(freezeAtMs)} y={H - 6} fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--coral-dim)" textAnchor="middle">
            ping → freeze
          </text>
          <text x={tX(unfreezeAtMs)} y={H - 6} fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--dao)" textAnchor="middle">
            DAO unfreeze
          </text>
        </svg>
      </div>
      <p className="rc-divstrip-note fd-chart-note">
        The contract-measured divergence (coral) sits at ~0.35% the whole time — far above this policy's <b>tight demo
        threshold</b> ({freeze.demoTPct}%), so a single ping is enough to make the contract HALT on its own reading. The
        score plays no part: the freeze is contract-only.
      </p>

      {/* the four real transactions */}
      <div className="log fd-steps">
        {freeze.steps.map((s) => {
          const m = STEP_META[s.key] ?? { cls: "k-dao", label: "TX", row: "" };
          return (
            <div className={"logrow" + m.row} key={s.n}>
              <span className={"k " + m.cls}>{m.label}</span>
              <span>
                <b>{s.title}</b> — {s.desc}
                {s.status === "failure" ? <span className="fd-fail"> · reverted on-chain ({s.abortName}, code {s.abortCode})</span> : null}
                {typeof s.divPct === "number" ? <span className="fd-dim"> · div {s.divPct.toFixed(3)}%</span> : null}
              </span>
              <a className="digest mono" href={txUrl(s.digest)} target="_blank" rel="noreferrer" title={`${s.status} · ${s.digest}`}>
                {s.digest.slice(0, 8)}…
              </a>
            </div>
          );
        })}
      </div>

      <p className="fd-caveat">
        Honest scope: the frozen policy uses a deliberately tight freeze threshold <b>T = {freeze.demoTPct}%</b> so the
        natural testnet Pyth↔DeepBook offset crosses it on cue. <b>Production T = {freeze.prodTPct}%</b> — the pool would
        have to genuinely de-peg. The freeze code and the threshold check are identical; only this per-policy, DAO-set T
        differs. This block proves the <i>mechanism</i>; the live observatory above shows real monitoring at prod thresholds.
      </p>

      <div className="fd-meta mono">
        <span>recorded {recorded} · testnet · objects:</span>
        <a href={objUrl(freeze.stressed.policyId)} target="_blank" rel="noreferrer">frozen policy</a>
        <a href={objUrl(freeze.stressed.vaultId)} target="_blank" rel="noreferrer">vault</a>
        <a href={objUrl(freeze.stressed.capId)} target="_blank" rel="noreferrer">GovernanceCap</a>
        <a href={objUrl(freeze.healthy.policyId)} target="_blank" rel="noreferrer">healthy policy</a>
      </div>
      <div className="fd-meta mono fd-setup">
        <span>deploy receipts — healthy:</span>
        <a href={txUrl(freeze.setup.healthyCreate)} target="_blank" rel="noreferrer">create</a>
        <a href={txUrl(freeze.setup.healthyVault)} target="_blank" rel="noreferrer">vault</a>
        <a href={txUrl(freeze.setup.healthyDeposit)} target="_blank" rel="noreferrer">deposit</a>
        <span>· stressed:</span>
        <a href={txUrl(freeze.setup.stressedCreate)} target="_blank" rel="noreferrer">create</a>
        <a href={txUrl(freeze.setup.stressedVault)} target="_blank" rel="noreferrer">vault</a>
        <a href={txUrl(freeze.setup.stressedDeposit)} target="_blank" rel="noreferrer">deposit</a>
      </div>
    </section>
  );
}
