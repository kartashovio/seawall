// ArchitectureDiagram — a single hand-built inline SVG implementing PART 2 of
// /home/seawall/packages/dashboard/ARCHITECTURE_DIAGRAM_SPEC.md.
//
// It is the one-glance trust story for Seawall:
//   • 4 zones: External Feeds / Off-chain (untrusted) / On-chain Sui (trust root) / DAO
//   • 10 nodes, 11 edges (exact labels + line styles from the spec)
//   • The 3-layer L1/L2/L3 enforcement ladder, the TRUST-BOUNDARY banner, a legend.
//
// Z-ORDER (render order, matters): zones → faint amber feed→on-chain arcs (E7/E8,
// the proof the chain reads raw data ITSELF, bypassing the agent) → nodes →
// primary edges → edge labels → trust banner + ladder + legend on top.
//
// LOUD-vs-QUIET: the only "loud" elements are the two 3px trust-critical edges
// (E4 same-PTB submit, E6 contract re-derives) and the danger-red L3 FREEZE rung.
// Everything else stays quiet so the trust story pops in <10s.
//
// INVARIANT: no arrow or label ever implies the agent triggers or influences
// FREEZE. FREEZE (L3) is contract-only. The agent's edge is a clamped,
// sender-gated ParamRequest only.
//
// Pure presentational: no props, no state, no handlers.

// ── Palette (spec "Palette" table) ───────────────────────────────────────────
const C = {
  ink: "#0B1B2B",
  inkSoft: "#5A6B7B",
  suiBlue: "#4DA2FF",
  suiBlueText: "#1f6fc2",
  suiBlueWash: "#EAF4FF",
  agentWash: "#F4F7FA",
  feedWash: "#FFF6E9",
  daoWash: "#F3EEFF",
  daoInk: "#6B4DCB",
  danger: "#E5484D",
  dangerText: "#c4203f",
  paper: "#FFFFFF",
  hair: "#D8E0E8",
  amber: "#B07A1E",
  amberText: "#8a5a0e",
  dangerWash: "#FBEAEA",
  bannerWash: "#FFF5F5",
} as const;

const FONT =
  "var(--font-ui), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// White-halo style so edge labels sit legibly over zone fills.
const HALO = {
  paintOrder: "stroke" as const,
  stroke: C.paper,
  strokeWidth: 3,
};

// ── Node helper: rounded rect + bold label + muted sublabel (centered) ────────
function Node({
  x,
  y,
  w,
  h,
  label,
  sub,
  stroke,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string;
  stroke: string;
}) {
  const cx = x + w / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        fill={C.paper}
        stroke={stroke}
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={y + h / 2 - 5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={FONT}
        fontSize={14}
        fontWeight={600}
        fill={C.ink}
      >
        {label}
      </text>
      <text
        x={cx}
        y={y + h / 2 + 13}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={FONT}
        fontSize={11}
        fontWeight={400}
        fill={C.inkSoft}
      >
        {sub}
      </text>
    </g>
  );
}

// ── Edge label helper: halo-backed text at a point ────────────────────────────
function EdgeLabel({
  x,
  y,
  text,
  fill = C.ink,
  bold = false,
}: {
  x: number;
  y: number;
  text: string;
  fill?: string;
  bold?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontFamily={FONT}
      fontSize={10.5}
      fontWeight={bold ? 700 : 500}
      fill={fill}
      style={HALO}
    >
      {text}
    </text>
  );
}

// ── Zone title helper ─────────────────────────────────────────────────────────
function ZoneTitle({
  x,
  y,
  text,
  fill,
}: {
  x: number;
  y: number;
  text: string;
  fill: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fontFamily={FONT}
      fontSize={12}
      fontWeight={700}
      letterSpacing={1}
      fill={fill}
    >
      {text}
    </text>
  );
}

export function ArchitectureDiagram() {
  return (
    <svg
      viewBox="0 0 1200 560"
      width="100%"
      role="img"
      aria-label="Seawall architecture: off-chain untrusted agent, on-chain trust-root contract, DAO override"
      style={{ height: "auto", display: "block" }}
    >
      <defs>
        <marker
          id="arch-arrow"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={C.ink} />
        </marker>
        <marker
          id="arch-arrow-blue"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={C.suiBlue} />
        </marker>
        <marker
          id="arch-arrow-amber"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={C.amber} />
        </marker>
        <marker
          id="arch-arrow-dao"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={C.daoInk} />
        </marker>
        <marker
          id="arch-arrow-soft"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={C.inkSoft} />
        </marker>
      </defs>

      {/* canvas frame */}
      <rect
        x={0.5}
        y={0.5}
        width={1199}
        height={559}
        rx={4}
        fill={C.paper}
        stroke={C.hair}
        strokeWidth={1}
      />

      {/* ── (a) ZONES ─────────────────────────────────────────────────────── */}
      <g>
        {/* Z1 External Feeds */}
        <rect
          x={24}
          y={40}
          width={250}
          height={300}
          rx={14}
          fill={C.feedWash}
          stroke={C.hair}
          strokeWidth={1.5}
          strokeDasharray="6 5"
        />
        <ZoneTitle x={40} y={62} text="EXTERNAL FEEDS" fill={C.amberText} />

        {/* Z2 Off-chain agent world */}
        <rect
          x={300}
          y={40}
          width={300}
          height={480}
          rx={14}
          fill={C.agentWash}
          stroke={C.hair}
          strokeWidth={1.5}
          strokeDasharray="6 5"
        />
        <ZoneTitle x={316} y={62} text="OFF-CHAIN (untrusted)" fill={C.inkSoft} />

        {/* Z3 On-chain Sui */}
        <rect
          x={624}
          y={40}
          width={420}
          height={480}
          rx={14}
          fill={C.suiBlueWash}
          stroke={C.hair}
          strokeWidth={1.5}
          strokeDasharray="6 5"
        />
        <ZoneTitle x={640} y={62} text="ON-CHAIN · SUI (trust root)" fill={C.suiBlueText} />

        {/* Z4 DAO / Human */}
        <rect
          x={1068}
          y={40}
          width={108}
          height={480}
          rx={14}
          fill={C.daoWash}
          stroke={C.hair}
          strokeWidth={1.5}
          strokeDasharray="6 5"
        />
        <ZoneTitle x={1084} y={62} text="DAO" fill={C.daoInk} />
      </g>

      {/* ── faint feed→on-chain arcs (E7 / E8) — drawn UNDER the nodes. ────────
           These bypass the agent entirely: the chain reads raw Pyth + DeepBook
           ITSELF. Two independent paths into Z3 = the whole trust story. ───── */}
      <g>
        {/* E7 pyth → divmod, looping along the bottom gutter (y≈540) */}
        <path
          d="M 149 146 C 149 545, 149 545, 600 545 S 850 320, 850 318"
          fill="none"
          stroke={C.amber}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.55}
          markerEnd="url(#arch-arrow-amber)"
        />
        {/* E8 deepbook → divmod, parallel inner arc */}
        <path
          d="M 149 236 C 149 520, 200 520, 600 520 S 820 318, 838 312"
          fill="none"
          stroke={C.amber}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.55}
          markerEnd="url(#arch-arrow-amber)"
        />
      </g>

      {/* ── (b) NODES ─────────────────────────────────────────────────────── */}
      <Node x={44} y={90} w={210} h={56} label="Pyth" sub="signed price + conf" stroke={C.amber} />
      <Node x={44} y={180} w={210} h={56} label="DeepBook CLOB" sub="L2 order book (mid)" stroke={C.amber} />
      <Node x={320} y={96} w={260} h={60} label="ML model" sub="EWMA-Mahalanobis · 6-feat" stroke={C.ink} />
      <Node x={320} y={196} w={260} h={64} label="Agent" sub="ratchet + send-gate · score→ParamRequest" stroke={C.suiBlue} />
      <Node x={320} y={320} w={260} h={60} label="Keeper" sub="model-free heartbeat · own key" stroke={C.inkSoft} />
      <Node x={700} y={150} w={300} h={76} label="GuardianPolicy" sub="shared · corridor + caps + state" stroke={C.suiBlue} />
      <Node x={700} y={262} w={300} h={56} label="divergence::read" sub="re-derives div from raw Pyth+book" stroke={C.suiBlue} />
      <Node x={700} y={356} w={300} h={60} label="Vault (consumer)" sub="borrow / withdraw — gated" stroke={C.ink} />
      <Node x={1072} y={230} w={104} h={110} label="GovernanceCap" sub="owned · separate object" stroke={C.daoInk} />
      <Node x={320} y={432} w={260} h={56} label="Dashboard" sub="gauge · action log" stroke={C.inkSoft} />

      {/* ── (c) PRIMARY EDGES ─────────────────────────────────────────────── */}
      <g fill="none">
        {/* E1 pyth → agent (dashed read, amber) */}
        <path
          d="M 254 124 C 290 140, 300 200, 318 218"
          stroke={C.amber}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          markerEnd="url(#arch-arrow-amber)"
        />
        {/* E2 deepbook → agent (dashed read, amber) */}
        <path
          d="M 254 208 C 290 216, 300 224, 318 230"
          stroke={C.amber}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          markerEnd="url(#arch-arrow-amber)"
        />
        {/* E3 ml → agent (solid 2px ink, within Z2, down) */}
        <path
          d="M 450 156 L 450 194"
          stroke={C.ink}
          strokeWidth={2}
          markerEnd="url(#arch-arrow)"
        />
        {/* E4 agent → policy — HERO trust-critical edge (3px blue) */}
        <path
          d="M 580 222 C 640 200, 660 188, 698 188"
          stroke={C.suiBlue}
          strokeWidth={3}
          markerEnd="url(#arch-arrow-blue)"
        />
        {/* E5 keeper → policy (solid 2px blue, lower) */}
        <path
          d="M 580 344 C 650 330, 660 220, 698 210"
          stroke={C.suiBlue}
          strokeWidth={2}
          markerEnd="url(#arch-arrow-blue)"
        />
        {/* E6 policy → divmod — trust-critical (3px blue, short down) */}
        <path
          d="M 850 226 L 850 260"
          stroke={C.suiBlue}
          strokeWidth={3}
          markerEnd="url(#arch-arrow-blue)"
        />
        {/* E9 vault → policy (solid 2px ink, up-left within Z3) */}
        <path
          d="M 760 356 C 740 320, 720 250, 730 228"
          stroke={C.ink}
          strokeWidth={2}
          markerEnd="url(#arch-arrow)"
        />
        {/* E10 gov → policy (solid 2px dao-ink, left) */}
        <path
          d="M 1080 250 C 1040 230, 1020 200, 1002 192"
          stroke={C.daoInk}
          strokeWidth={2}
          markerEnd="url(#arch-arrow-dao)"
        />
        {/* E11 policy → dash (dashed 1.5px soft, long curve back to bottom-left) */}
        <path
          d="M 700 200 C 640 270, 640 440, 580 458"
          stroke={C.inkSoft}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          markerEnd="url(#arch-arrow-soft)"
        />
      </g>

      {/* ── EDGE LABELS (over fills, halo-backed) ──────────────────────────── */}
      <EdgeLabel x={150} y={62 + 100} text="signed price feed" fill={C.amberText} />
      {/* E2 label moved onto the path (between feeds zone and agent, off the node) */}
      <EdgeLabel x={285} y={210} text="L2 book + CEX depth" fill={C.amberText} />
      <EdgeLabel x={450} y={176} text="0–100 score (advisory)" fill={C.ink} />
      {/* E4 hero label, two-line lowered onto the off-chain↔on-chain seam */}
      <EdgeLabel x={640} y={178} text="same-PTB: post Pyth +" fill={C.suiBlueText} bold />
      <EdgeLabel x={640} y={192} text="submit ParamRequest (sender-gated)" fill={C.suiBlueText} bold />
      <EdgeLabel x={612} y={330} text="permissionless poke · 5 min" fill={C.suiBlueText} />
      <EdgeLabel x={920} y={244} text="reads price + L2 book ITSELF," fill={C.suiBlueText} bold />
      <EdgeLabel x={920} y={257} text="re-derives divergence" fill={C.suiBlueText} bold />
      <EdgeLabel x={665} y={346} text="inline poke on borrow / withdraw" fill={C.ink} />
      {/* E10 dao label, two-line */}
      <EdgeLabel x={1024} y={150} text="&GovernanceCap:" fill={C.daoInk} bold />
      <EdgeLabel x={1024} y={164} text="unfreeze / set corridor / rotate agent" fill={C.daoInk} bold />
      <EdgeLabel x={636} y={400} text="events → dashboard (queryEvents)" fill={C.inkSoft} />
      {/* E7 / E8 bottom-arc labels */}
      <EdgeLabel x={400} y={543} text="PriceInfoObject (same PTB)" fill={C.amberText} />
      <EdgeLabel x={400} y={520} text="Pool L2 ticks (on-chain)" fill={C.amberText} />

      {/* ── (e) TRUST-BOUNDARY banner — horizontal strip over the off↔on seam ─ */}
      <g>
        <rect
          x={300}
          y={18}
          width={744}
          height={40}
          rx={12}
          fill={C.bannerWash}
          stroke={C.danger}
          strokeWidth={1.5}
        />
        <text
          x={672}
          y={32}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily={FONT}
          fontSize={11}
          fontWeight={700}
          fill={C.dangerText}
        >
          TRUST BOUNDARY — agent can only push safer (one-way ratchet) · cannot
          hold the unfreeze cap
        </text>
        <text
          x={672}
          y={46}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily={FONT}
          fontSize={11}
          fontWeight={700}
          fill={C.dangerText}
        >
          freeze is contract-only · score is advisory (event-only)
        </text>
      </g>

      {/* ── (d) 3-LAYER ENFORCEMENT LADDER (inset, bottom-right of Z3) ──────── */}
      <g>
        {(() => {
          const lx = 700;
          const lw = 300;
          const barH = 20;
          const gap = 4;
          let by = 432;
          const rung = (
            key: string,
            fill: string,
            rule: string,
            left: string,
            right: string,
          ) => {
            const y = by;
            by += barH + gap;
            return (
              <g key={key}>
                <rect x={lx} y={y} width={lw} height={barH} rx={6} fill={fill} stroke={C.hair} strokeWidth={1} />
                <rect x={lx} y={y} width={4} height={barH} rx={2} fill={rule} />
                <text
                  x={lx + 12}
                  y={y + barH / 2 + 1}
                  dominantBaseline="middle"
                  fontFamily={FONT}
                  fontSize={9.5}
                  fontWeight={700}
                  fill={C.ink}
                >
                  {left}
                </text>
                <text
                  x={lx + lw - 8}
                  y={y + barH / 2 + 1}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontFamily={FONT}
                  fontSize={9}
                  fontWeight={400}
                  fontStyle="italic"
                  fill={C.inkSoft}
                >
                  {right}
                </text>
              </g>
            );
          };
          return (
            <>
              {rung("l1", C.paper, C.ink, "L1 · Inline floor — aborts if frozen / LTV-cap breach", "any borrow tx")}
              {rung("l2", C.suiBlueWash, C.suiBlue, "L2 · CAUTION — clamp-and-log param tighten", "agent req, clamped · or contract-own")}
              {rung("l3", C.dangerWash, C.danger, "L3 · FREEZE — halt borrow + withdraw", "contract-only · DAO unfreezes")}
            </>
          );
        })()}
        <text
          x={700}
          y={520}
          fontFamily={FONT}
          fontSize={10}
          fontWeight={400}
          fontStyle="italic"
          fill={C.inkSoft}
        >
          one signal — Pyth↔DeepBook divergence — three rungs; trust level decides who pulls each.
        </text>
      </g>

      {/* ── (f) LEGEND — bottom-left, under Z1 ─────────────────────────────── */}
      <g>
        <rect
          x={24}
          y={356}
          width={250}
          height={164}
          rx={10}
          fill={C.paper}
          stroke={C.hair}
          strokeWidth={1}
        />
        <text
          x={38}
          y={376}
          fontFamily={FONT}
          fontSize={11}
          fontWeight={700}
          letterSpacing={0.5}
          fill={C.ink}
        >
          LEGEND
        </text>
        {(() => {
          const rows: Array<{ kind: "line" | "swatch"; color: string; width?: number; dash?: string; text: string }> = [
            { kind: "line", color: C.ink, width: 2, text: "write / on-chain action" },
            { kind: "line", color: C.inkSoft, width: 1.5, dash: "5 4", text: "read (no state change)" },
            { kind: "line", color: C.suiBlue, width: 3, text: "trust-critical path" },
            { kind: "swatch", color: C.suiBlue, text: "on-chain (trust root)" },
            { kind: "swatch", color: C.agentWash, text: "off-chain (untrusted)" },
            { kind: "swatch", color: C.feedWash, text: "external feed" },
            { kind: "swatch", color: C.daoInk, text: "human / DAO authority" },
          ];
          return rows.map((r, i) => {
            const ry = 396 + i * 17;
            return (
              <g key={r.text}>
                {r.kind === "line" ? (
                  <line
                    x1={38}
                    y1={ry}
                    x2={58}
                    y2={ry}
                    stroke={r.color}
                    strokeWidth={r.width}
                    strokeDasharray={r.dash}
                    strokeLinecap="round"
                  />
                ) : (
                  <rect x={38} y={ry - 6} width={14} height={12} rx={3} fill={r.color} stroke={C.hair} strokeWidth={1} />
                )}
                <text
                  x={66}
                  y={ry + 1}
                  dominantBaseline="middle"
                  fontFamily={FONT}
                  fontSize={11}
                  fontWeight={400}
                  fill={C.ink}
                >
                  {r.text}
                </text>
              </g>
            );
          });
        })()}
      </g>
    </svg>
  );
}
