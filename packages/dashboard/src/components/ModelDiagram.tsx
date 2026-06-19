// ModelDiagram — the SECOND diagram under "Show the full architecture": a staged
// left→right DATA PIPELINE answering "how the ML model computes the score". It is
// NOT a trust map (that is ArchitectureDiagram, shown above it) — no DAO node, no
// on/off-chain swimlanes. IA from the model-diagram-ia judge panel (hybrid):
//
//   4 SOURCES → ALIGN → 5 FEATURES (solvency lane / liquidity lane)
//     → ONE shared MULTIVARIATE CORE (EWMA-Mahalanobis, couples both lanes)
//     → per-axis d²→score (+ a QUIET overall/advisory score)
//     → two CLAMPED knobs (max_ltv ← solvency, borrow_cap ← liquidity)
//
// HONESTY GUARDS baked into the layout (do not regress):
//   • the OVERALL/advisory score dead-ends as a thin DASHED spur into the request
//     bracket — it never reaches a knob ("score never on the decision path").
//   • FREEZE / RELAX is a DETACHED coral note with NO incoming edge (contract-only,
//     not an ML output — the model never freezes).
//   • exactly 5 live features; max_ltv←solvency, borrow_cap←liquidity (never crossed).
//   • prior art named but quiet (Kritzman-Li / RiskMetrics); the LLM is a footnote.
//
// Pure presentational: no props, no state, no handlers (renders in the DOM-free tests).

const C = {
  ink: "#0B1B2B",
  inkSoft: "#5A6B7B",
  suiBlue: "#4DA2FF",
  suiBlueText: "#1f6fc2",
  suiBlueWash: "#EAF4FF",
  amber: "#B07A1E",
  amberText: "#8a5a0e",
  amberWash: "#FFF6E9",
  danger: "#E5484D",
  dangerText: "#c4203f",
  dangerWash: "#FBEAEA",
  paper: "#FFFFFF",
  hair: "#D8E0E8",
  inset: "#F4F7FA",
} as const;

const FONT = "var(--font-ui), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace";
const HALO = { paintOrder: "stroke" as const, stroke: C.paper, strokeWidth: 3 };

// ── node geometry: edges derive from these anchors so they can't drift ──────────
type Box = { x: number; y: number; w: number; h: number };
const rc = (n: Box) => ({ x: n.x + n.w, y: n.y + n.h / 2 });
const lc = (n: Box) => ({ x: n.x, y: n.y + n.h / 2 });
type Pt = { x: number; y: number };
// smooth horizontal cubic between two anchor points
const hp = (a: Pt, b: Pt): string => {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
};

const N: Record<string, Box> = {
  // 1 · SOURCES (stacked)
  pyth: { x: 22, y: 70, w: 158, h: 46 },
  deepbook: { x: 22, y: 124, w: 158, h: 46 },
  cex: { x: 22, y: 178, w: 158, h: 46 },
  btc: { x: 22, y: 232, w: 158, h: 46 },
  // ALIGN
  align: { x: 202, y: 144, w: 86, h: 60 },
  // 2 · FEATURES — solvency lane (top), liquidity lane (bottom)
  div: { x: 310, y: 64, w: 184, h: 44 },
  divvel: { x: 310, y: 114, w: 184, h: 44 },
  disp: { x: 310, y: 196, w: 184, h: 44 },
  volvel: { x: 310, y: 246, w: 184, h: 44 },
  mktvol: { x: 310, y: 296, w: 184, h: 44 },
  // 3 · CORE (tall waist, straddles both lanes)
  core: { x: 516, y: 92, w: 180, h: 236 },
  // 4+5 · per-axis d²→score (+ quiet overall)
  sscore: { x: 716, y: 96, w: 214, h: 58 },
  oscore: { x: 716, y: 192, w: 214, h: 58 },
  lscore: { x: 716, y: 288, w: 214, h: 58 },
  // 6 · clamped knobs
  maxltv: { x: 996, y: 100, w: 158, h: 56 },
  borrowcap: { x: 996, y: 286, w: 158, h: 56 },
};

// request bracket enclosing both knobs (the terminal "contract clamps" frame)
const BR = { x: 982, y: 88, w: 186, h: 266 };

function Source({ box, label, sub, accent }: { box: Box; label: string; sub: string; accent: string }) {
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={9} fill={C.paper} stroke={accent} strokeWidth={1.4} />
      <text x={box.x + 12} y={box.y + 19} fontFamily={FONT} fontSize={12.5} fontWeight={600} fill={C.ink}>
        {label}
      </text>
      <text x={box.x + 12} y={box.y + 34} fontFamily={FONT} fontSize={9.5} fontWeight={400} fill={C.inkSoft}>
        {sub}
      </text>
    </g>
  );
}

function Feat({ box, name, sub, accent, wash, loud }: { box: Box; name: string; sub: string; accent: string; wash: string; loud?: boolean }) {
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={8} fill={wash} stroke={accent} strokeWidth={loud ? 2 : 1.2} />
      <text x={box.x + 11} y={box.y + 18} fontFamily={MONO} fontSize={12} fontWeight={700} fill={C.ink}>
        {name}
      </text>
      <text x={box.x + 11} y={box.y + 33} fontFamily={FONT} fontSize={9} fontWeight={400} fill={C.inkSoft}>
        {sub}
      </text>
    </g>
  );
}

function Score({ box, label, sub, accent, quiet }: { box: Box; label: string; sub: string; accent: string; quiet?: boolean }) {
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={9} fill={quiet ? C.inset : C.paper} stroke={accent} strokeWidth={quiet ? 1 : 1.5} strokeDasharray={quiet ? "4 3" : undefined} />
      <text x={box.x + 13} y={box.y + 22} fontFamily={FONT} fontSize={12.5} fontWeight={quiet ? 500 : 700} fill={quiet ? C.inkSoft : C.ink}>
        {label}
      </text>
      <text x={box.x + 13} y={box.y + 40} fontFamily={FONT} fontSize={9.5} fontWeight={400} fill={C.inkSoft}>
        {sub}
      </text>
    </g>
  );
}

function Knob({ box, name, sub, accent, wash }: { box: Box; name: string; sub: string; accent: string; wash: string }) {
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={9} fill={wash} stroke={accent} strokeWidth={2} />
      <text x={box.x + box.w / 2} y={box.y + 22} textAnchor="middle" fontFamily={MONO} fontSize={13} fontWeight={700} fill={C.ink}>
        {name}
      </text>
      <text x={box.x + box.w / 2} y={box.y + 40} textAnchor="middle" fontFamily={FONT} fontSize={9.5} fontWeight={400} fill={C.inkSoft}>
        {sub}
      </text>
    </g>
  );
}

function Edge({ d, stroke, w = 1.5, dash, marker }: { d: string; stroke: string; w?: number; dash?: string; marker: string }) {
  return <path d={d} fill="none" stroke={stroke} strokeWidth={w} strokeDasharray={dash} markerEnd={`url(#${marker})`} />;
}

export function ModelDiagram() {
  // fan-in exit points on the core's left edge (slightly spread → one node)
  const coreIn = (y: number): Pt => ({ x: N.core.x, y });
  // exit points on the core's right edge
  const coreOut = (y: number): Pt => ({ x: N.core.x + N.core.w, y });

  return (
    <svg
      viewBox="0 0 1200 700"
      width="100%"
      role="img"
      aria-label="How the ML model computes the score: four data sources become five features in two risk lanes, fused by one EWMA-Mahalanobis covariance core into two per-axis scores that drive two clamped lending limits; the overall score stays advisory and the freeze is contract-only."
      style={{ height: "auto", display: "block" }}
    >
      <defs>
        {[
          ["md-arrow", C.ink],
          ["md-arrow-blue", C.suiBlue],
          ["md-arrow-amber", C.amber],
          ["md-arrow-soft", C.inkSoft],
        ].map(([id, fill]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={fill} />
          </marker>
        ))}
      </defs>

      {/* canvas frame */}
      <rect x={0.5} y={0.5} width={1199} height={699} rx={4} fill={C.paper} stroke={C.hair} strokeWidth={1} />

      {/* ── stage column captions ──────────────────────────────────────────── */}
      {([
        ["1 · sources", 24, "4 feeds · every 60s tick"],
        ["2 · features", 312, "5 signals the chain can't compute"],
        ["3 · model", 518, "one shared covariance"],
        ["4 · scores", 718, "d² → 0–100 per axis"],
        ["5 · limits", 998, "clamped requests"],
      ] as Array<[string, number, string]>).map(([t, x, s]) => (
        <g key={t}>
          <text x={x} y={36} fontFamily={FONT} fontSize={11.5} fontWeight={700} letterSpacing={0.6} fill={C.ink}>
            {t.toUpperCase()}
          </text>
          <text x={x} y={50} fontFamily={FONT} fontSize={9} fontWeight={400} fill={C.inkSoft}>
            {s}
          </text>
        </g>
      ))}

      {/* lane tags over the features (the two-lane gestalt) */}
      <text x={310} y={59} fontFamily={FONT} fontSize={9} fontWeight={700} letterSpacing={0.4} fill={C.suiBlueText}>
        SOLVENCY · drives max_LTV
      </text>
      <text x={310} y={191} fontFamily={FONT} fontSize={9} fontWeight={700} letterSpacing={0.4} fill={C.amberText}>
        LIQUIDITY · drives borrow_cap
      </text>

      {/* ── EDGES (under nodes) ────────────────────────────────────────────── */}
      {/* sources → align (dashed reads, converging) */}
      {(["pyth", "deepbook", "cex", "btc"] as const).map((k) => (
        <Edge key={k} d={hp(rc(N[k]), lc(N.align))} stroke={C.inkSoft} w={1.3} dash="5 4" marker="md-arrow-soft" />
      ))}
      {/* align → 5 features (dashed reads, fanning) */}
      {(["div", "divvel", "disp", "volvel", "mktvol"] as const).map((k) => (
        <Edge key={k} d={hp(rc(N.align), lc(N[k]))} stroke={C.inkSoft} w={1.3} dash="5 4" marker="md-arrow-soft" />
      ))}
      {/* 5 features → CORE (solid fan-in = the fusion) */}
      <Edge d={hp(rc(N.div), coreIn(150))} stroke={C.suiBlue} w={2} marker="md-arrow-blue" />
      <Edge d={hp(rc(N.divvel), coreIn(172))} stroke={C.suiBlue} w={2} marker="md-arrow-blue" />
      <Edge d={hp(rc(N.disp), coreIn(216))} stroke={C.amber} w={2} marker="md-arrow-amber" />
      <Edge d={hp(rc(N.volvel), coreIn(248))} stroke={C.amber} w={2} marker="md-arrow-amber" />
      <Edge d={hp(rc(N.mktvol), coreIn(278))} stroke={C.amber} w={2} marker="md-arrow-amber" />
      {/* CORE → scores (solid per-axis, dashed for the quiet overall) */}
      <Edge d={hp(coreOut(132), lc(N.sscore))} stroke={C.suiBlue} w={2} marker="md-arrow-blue" />
      <Edge d={hp(coreOut(212), lc(N.oscore))} stroke={C.inkSoft} w={1.3} dash="4 3" marker="md-arrow-soft" />
      <Edge d={hp(coreOut(290), lc(N.lscore))} stroke={C.amber} w={2} marker="md-arrow-amber" />
      {/* scores → knobs (solid, color-disciplined, NEVER crossed) */}
      <Edge d={hp(rc(N.sscore), lc(N.maxltv))} stroke={C.suiBlue} w={2} marker="md-arrow-blue" />
      <Edge d={hp(rc(N.lscore), lc(N.borrowcap))} stroke={C.amber} w={2} marker="md-arrow-amber" />
      {/* overall/advisory score → the request bracket: a THIN DASHED spur that
          dead-ends at the request (it NEVER reaches a knob). The honesty money-shot. */}
      <Edge d={hp(rc(N.oscore), { x: BR.x, y: 221 })} stroke={C.inkSoft} w={1.3} dash="2 3" marker="md-arrow-soft" />

      {/* ── edge labels ────────────────────────────────────────────────────── */}
      <text x={606} y={83} textAnchor="middle" fontFamily={FONT} fontSize={9.5} fontWeight={700} fill={C.suiBlueText} style={HALO}>
        5-feature vector xₜ
      </text>
      <text x={957} y={113} textAnchor="middle" fontFamily={FONT} fontSize={8.5} fill={C.suiBlueText} style={HALO}>
        logistic
      </text>
      <text x={957} y={299} textAnchor="middle" fontFamily={FONT} fontSize={8.5} fill={C.amberText} style={HALO}>
        logistic
      </text>
      <text x={956} y={214} textAnchor="middle" fontFamily={FONT} fontSize={7.5} fontStyle="italic" fill={C.inkSoft} style={HALO}>
        event-only
      </text>

      {/* gate valves on the two tighten edges (warm-up + hysteresis + ratchet) */}
      {[124, 314].map((gy) => (
        <g key={gy}>
          <rect x={931} y={gy - 9} width={42} height={18} rx={5} fill={C.inset} stroke={C.hair} strokeWidth={1} />
          <text x={952} y={gy + 1} textAnchor="middle" dominantBaseline="middle" fontFamily={FONT} fontSize={8} fontWeight={700} fill={C.inkSoft}>
            gate
          </text>
        </g>
      ))}

      {/* ── NODES ──────────────────────────────────────────────────────────── */}
      <Source box={N.pyth} label="Pyth oracle" sub="price + conf · hermes-beta" accent={C.suiBlue} />
      <Source box={N.deepbook} label="DeepBook CLOB" sub="on-chain mid · SUI_DBUSDC" accent={C.suiBlue} />
      <Source box={N.cex} label="CEX spot ×3" sub="Coinbase · OKX · Bybit" accent={C.amber} />
      <Source box={N.btc} label="BTC" sub="Bybit · market proxy" accent={C.amber} />

      {/* ALIGN */}
      <g>
        <rect x={N.align.x} y={N.align.y} width={N.align.w} height={N.align.h} rx={9} fill={C.inset} stroke={C.inkSoft} strokeWidth={1.3} />
        <text x={N.align.x + N.align.w / 2} y={N.align.y + 26} textAnchor="middle" fontFamily={FONT} fontSize={12} fontWeight={700} fill={C.ink}>
          align
        </text>
        <text x={N.align.x + N.align.w / 2} y={N.align.y + 41} textAnchor="middle" fontFamily={FONT} fontSize={8.5} fill={C.inkSoft}>
          as-of · 60s grid
        </text>
      </g>

      <Feat box={N.div} name="div" sub="oracle↔book gap [bps]" accent={C.suiBlue} wash={C.suiBlueWash} loud />
      <Feat box={N.divvel} name="divvel" sub="widening vel · max(0,·)" accent={C.suiBlue} wash={C.suiBlueWash} />
      <Feat box={N.disp} name="disp" sub="cross-venue spread [bps]" accent={C.amber} wash={C.amberWash} />
      <Feat box={N.volvel} name="volvel" sub="SUI realized-vol velocity" accent={C.amber} wash={C.amberWash} />
      <Feat box={N.mktvol} name="mktvol" sub="BTC market-vol velocity" accent={C.amber} wash={C.amberWash} />

      {/* CORE — the shared multivariate brain */}
      <g>
        <rect x={N.core.x} y={N.core.y} width={N.core.w} height={N.core.h} rx={12} fill={C.inset} stroke={C.ink} strokeWidth={2} />
        <text x={N.core.x + N.core.w / 2} y={N.core.y + 22} textAnchor="middle" fontFamily={FONT} fontSize={13} fontWeight={700} fill={C.ink}>
          Multivariate model
        </text>
        <text x={N.core.x + N.core.w / 2} y={N.core.y + 38} textAnchor="middle" fontFamily={FONT} fontSize={9} fill={C.inkSoft}>
          EWMA-adaptive Mahalanobis
        </text>
        <line x1={N.core.x + 14} y1={N.core.y + 48} x2={N.core.x + N.core.w - 14} y2={N.core.y + 48} stroke={C.hair} strokeWidth={1} />
        {([
          "μ: EWMA  λ=0.99",
          "Σ: EWMA  λ=0.996",
          "(~2.9h half-life)",
          "shrink 0.15 + ridge",
        ]).map((t, i) => (
          <text key={t} x={N.core.x + N.core.w / 2} y={N.core.y + 66 + i * 16} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fill={C.ink}>
            {t}
          </text>
        ))}
        <text x={N.core.x + N.core.w / 2} y={N.core.y + 150} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fontWeight={700} fill={C.ink}>
          d² = (x−μ)ᵀ Σ⁻¹ (x−μ)
        </text>
        <text x={N.core.x + N.core.w / 2} y={N.core.y + 166} textAnchor="middle" fontFamily={MONO} fontSize={9} fill={C.inkSoft}>
          via Cholesky
        </text>
        <text x={N.core.x + N.core.w / 2} y={N.core.y + 190} textAnchor="middle" fontFamily={FONT} fontSize={9} fontStyle="italic" fill={C.ink}>
          one Σ couples all 5 features
        </text>
        <text x={N.core.x + N.core.w / 2} y={N.core.y + 220} textAnchor="middle" fontFamily={FONT} fontSize={8} fontStyle="italic" fill={C.inkSoft}>
          Kritzman-Li · RiskMetrics
        </text>
      </g>

      <Score box={N.sscore} label="solvency d² → score" sub="{div, divvel} · χ²(2) · 0–100" accent={C.suiBlue} />
      <Score box={N.oscore} label="overall d² → score" sub="all 5 · χ²(5) · ADVISORY (event-only)" accent={C.inkSoft} quiet />
      <Score box={N.lscore} label="liquidity d² → score" sub="{disp, volvel, mktvol} · χ²(3) · 0–100" accent={C.amber} />

      {/* request bracket (terminal "contract clamps") around both knobs */}
      <g>
        <rect x={BR.x} y={BR.y} width={BR.w} height={BR.h} rx={12} fill="none" stroke={C.suiBlue} strokeWidth={1.3} strokeDasharray="3 4" />
        <text x={BR.x + BR.w / 2} y={BR.y - 6} textAnchor="middle" fontFamily={FONT} fontSize={9.5} fontWeight={700} fill={C.suiBlueText}>
          ParamRequest — contract clamps ▸ safer
        </text>
        <text x={BR.x + BR.w / 2} y={BR.y + BR.h + 15} textAnchor="middle" fontFamily={FONT} fontSize={8.5} fill={C.inkSoft}>
          to [floor, baseline] + its own divergence
        </text>
        <text x={BR.x + BR.w / 2} y={BR.y + BR.h + 28} textAnchor="middle" fontFamily={FONT} fontSize={8.5} fontStyle="italic" fill={C.inkSoft}>
          the advisory score never drives a knob
        </text>
      </g>
      <Knob box={N.maxltv} name="max_LTV" sub="55% → 75%" accent={C.suiBlue} wash={C.suiBlueWash} />
      <Knob box={N.borrowcap} name="borrow_cap" sub="40% → 100%" accent={C.amber} wash={C.amberWash} />

      {/* ── INSETS BAND ────────────────────────────────────────────────────── */}
      <line x1={22} y1={392} x2={1178} y2={392} stroke={C.hair} strokeWidth={1} />

      {/* (i) the joint-anomaly catch — the model's whole reason to exist (LOUD) */}
      <g>
        <rect x={22} y={410} width={452} height={170} rx={12} fill={C.paper} stroke={C.ink} strokeWidth={1.5} />
        <text x={40} y={434} fontFamily={FONT} fontSize={12.5} fontWeight={700} fill={C.ink}>
          The catch · joint anomaly
        </text>
        {/* LEFT: 5 calm univariate bars under their shared line · RIGHT: the joint
            d² bar crossing ABOVE its own (separate) trip line — visibly separated. */}
        {(() => {
          const baseY = 522;
          const uniY = 494; // each feature sits below this
          const tripY = 470; // the separate d² threshold
          const bars = [16, 22, 13, 19, 15];
          return (
            <g>
              <text x={44} y={uniY - 7} fontFamily={FONT} fontSize={8} fill={C.inkSoft}>
                each feature below its own line
              </text>
              <line x1={44} y1={uniY} x2={206} y2={uniY} stroke={C.inkSoft} strokeWidth={1} strokeDasharray="4 3" />
              {bars.map((hh, i) => (
                <rect key={i} x={50 + i * 28} y={baseY - hh} width={17} height={hh} rx={2} fill={C.suiBlueWash} stroke={C.suiBlue} strokeWidth={1} />
              ))}
              <text x={250} y={tripY - 7} fontFamily={FONT} fontSize={8} fontWeight={700} fill={C.dangerText}>
                d² trip line
              </text>
              <line x1={250} y1={tripY} x2={372} y2={tripY} stroke={C.danger} strokeWidth={1} strokeDasharray="4 3" />
              <rect x={315} y={tripY - 18} width={26} height={baseY - (tripY - 18)} rx={3} fill={C.dangerWash} stroke={C.danger} strokeWidth={1.6} />
              <text x={328} y={baseY + 12} textAnchor="middle" fontFamily={MONO} fontSize={8.5} fontWeight={700} fill={C.dangerText}>
                d²
              </text>
            </g>
          );
        })()}
        <text x={40} y={556} fontFamily={FONT} fontSize={10} fontWeight={600} fill={C.ink}>
          Every feature sits below its own line — the joint distance still trips.
        </text>
        <text x={40} y={571} fontFamily={FONT} fontSize={9} fill={C.inkSoft}>
          d² fires on the correlation break, not on any single spike.
        </text>
      </g>

      {/* (ii) two knobs, two signals — the backtest discrimination payoff */}
      <g>
        <rect x={490} y={410} width={362} height={170} rx={12} fill={C.paper} stroke={C.hair} strokeWidth={1.5} />
        <text x={508} y={434} fontFamily={FONT} fontSize={12.5} fontWeight={700} fill={C.ink}>
          Two knobs, two signals
        </text>
        {([
          [C.suiBlue, C.suiBlueText, "Feb-2025 · solvency-led", "max_LTV floors first, borrow_cap holds", 462],
          [C.amber, C.amberText, "Aug-2024 · liquidity-led", "borrow_cap floors, max_LTV barely moves", 506],
        ] as Array<[string, string, string, string, number]>).map(([dot, tx, a, b, yy]) => (
          <g key={a}>
            <circle cx={516} cy={yy} r={5} fill={dot} />
            <text x={530} y={yy + 4} fontFamily={FONT} fontSize={10.5} fontWeight={700} fill={tx}>
              {a}
            </text>
            <text x={530} y={yy + 19} fontFamily={FONT} fontSize={9} fill={C.inkSoft}>
              {b}
            </text>
          </g>
        ))}
        <text x={508} y={562} fontFamily={FONT} fontSize={9} fontStyle="italic" fill={C.inkSoft}>
          different crises light different lanes — backtest-validated.
        </text>
      </g>

      {/* (iii) FREEZE / RELAX — DETACHED, contract-only, NO incoming edge */}
      <g>
        <rect x={868} y={410} width={310} height={78} rx={12} fill={C.dangerWash} stroke={C.danger} strokeWidth={1.3} strokeDasharray="4 4" />
        <text x={884} y={434} fontFamily={FONT} fontSize={11.5} fontWeight={700} fill={C.dangerText}>
          FREEZE / RELAX — contract-only
        </text>
        <text x={884} y={452} fontFamily={FONT} fontSize={9} fill={C.dangerText}>
          not an ML output. The market halt fires on the
        </text>
        <text x={884} y={466} fontFamily={FONT} fontSize={9} fill={C.dangerText}>
          contract's OWN divergence; relax is its own all-clear.
        </text>
      </g>

      {/* (iv) two legs + LLM footnote (quiet) */}
      <g>
        <rect x={868} y={502} width={310} height={78} rx={12} fill={C.inset} stroke={C.hair} strokeWidth={1} />
        <text x={884} y={524} fontFamily={FONT} fontSize={9.5} fontWeight={700} fill={C.ink}>
          Same model, two states
        </text>
        <text x={884} y={540} fontFamily={FONT} fontSize={8.5} fill={C.inkSoft}>
          enforced testnet (Pyth↔DeepBook) ·
        </text>
        <text x={884} y={553} fontFamily={FONT} fontSize={8.5} fill={C.inkSoft}>
          read-only mainnet observatory (real market).
        </text>
        <text x={884} y={571} fontFamily={FONT} fontSize={8.5} fontStyle="italic" fill={C.inkSoft}>
          LLM writes the rationale text only — not on this path.
        </text>
      </g>
    </svg>
  );
}
