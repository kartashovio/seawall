# DESIGN_SPEC_v2 — SEAWALL (light · Sui-blue · minimal)

> Locked merge of six leads. Drop-in for `/home/seawall/packages/dashboard/`. Restyle only — zero behavior change; all asserted strings/classes/non-interactivity survive (verified against `test/App.test.tsx` + `test/ScoreCard.test.tsx`). The `Sparkline` keeps its single `history` prop (App.test mocks `history: []`).

---

## 1 · AESTHETIC THESIS

**"Clear water."** A bright, almost-white instrument panel: deep Sui-navy ink on white, generous air, hairline structure, and exactly **three rationed meaning-colors** — **Sui-blue = the contract / calm**, **amber = the untrusted agent**, **red = breach / freeze**. The one memorable thing is the **risk gauge: a single open-bottom Sui-blue ring** that fills and warms (blue → amber → red) as risk climbs — no needle, no tick rail, no chrome. The whole page reads as a calm white control room where color only ever means *something is happening*. Depth comes from soft blue-tinted shadow, never glow; the page is dead-flat (no atmosphere layers).

---

## 2 · TYPOGRAPHY

**Pairing:** Display/wordmark = **Bricolage Grotesque** (variable `opsz`, distinctive modern grotesque — premium wordmark, not Fraunces/Inter/Grotesk). UI/body = **Hanken Grotesk** (warm, humanist, AA at 11–14px). Data/mono = **IBM Plex Mono** (kept — proven legible on light, true tabular). *(Spline Sans Mono rejected: keep the data face stable and battle-tested.)*

**`index.html` `<link>` (replace the current font link):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

**Font vars (`:root`):**
```css
--font-display: "Bricolage Grotesque", "Hanken Grotesk", system-ui, sans-serif;
--font-ui:      "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-mono:    "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
--display-opsz-wordmark: "opsz" 84;   /* big "Seawall" + the gauge numeral */
--display-opsz-heading:  "opsz" 24;   /* h1/h2/posture */
--fraunces-axes: "opsz" 32;           /* RETIRED alias — kept harmless so any stray
                                         font-variation-settings:var(--fraunces-axes) degrades cleanly */
```
`.display { font-family:var(--font-display); font-optical-sizing:auto; letter-spacing:-0.015em; }` Repoint every old `font-variation-settings:var(--fraunces-axes)` (brand h1, posture pword, scorecard-title, gauge-num, timer, scene-num, thesis tname/tagline) to `.display` + the appropriate opsz var. Wordmark weight **700** (not heavier).

**Scale:**
| token | size | lh | ls | wght | family |
|---|---|---|---|---|---|
| `--fs-wordmark` | 34px | 1.0 | −0.02em | 700 | display |
| `--fs-display` | 28px | 1.08 | −0.015em | 600 | display |
| `--fs-numeral` | 46px | 1.0 | −0.025em | 600 | display, tabular |
| `--fs-h1` | 22px | 1.15 | −0.012em | 600 | display |
| `--fs-h2` | 14px | 1.2 | 0.08em UPPER | 600 | ui |
| `--fs-kicker` | 11.5px | 1.2 | 0.16em UPPER | 600 | ui |
| `--fs-lg` | 17px | 1.45 | 0 | 500 | ui |
| `--fs-base` | 14.5px | 1.55 | 0 | 400 | ui |
| `--fs-sm` | 12.5px | 1.45 | 0 | 400 | ui |
| `--fs-xs` | 11px | 1.35 | 0.02em | 500 | ui |
| `--fs-data` | 13px | 1.4 | 0 | 500 | mono, tabular |

All ticking numerals get `font-variant-numeric: tabular-nums`. **Uppercase kickers/pills via `text-transform`, never by editing source text** (asserted strings like `ENFORCING ▸ TESTNET`, `ML · advisory` stay literal — only letter-spaced/cased in CSS).

---

## 3 · COLOR TOKENS

Full light `:root` block. Three meaning-colors stay **distinct + AA on white**: **Sui-blue = contract/calm**, **amber = agent**, **red = breach**. All JS-bound names preserved; the migration aliases keep the gauge bound to `BANDS` with zero JSX edits.

```css
:root {
  color-scheme: light;

  /* ── ground (flat, light) ───────────────────────────── */
  --ground-0: #f4f7fb;   /* page */
  --ground-1: #f8fafd;   /* app field */
  --ground-2: #ffffff;   /* card surface */
  --ground-3: #ffffff;
  --inset:    #f1f5fa;   /* wells, tracks, log rows */

  /* ── structure (cool hairlines, never black) ────────── */
  --line:      #e2e9f1;
  --line-soft: #edf1f6;
  --line-lit:  #cdd9e6;

  /* ── ink (deep Sui navy → muted) ────────────────────── */
  --ink:       #0a2942;
  --ink-dim:   #3d5a72;
  --muted:     #6b8198;
  --muted-deep:#9fb2c4;

  /* ── SUI-BLUE = contract / calm (AA text on white) ──── */
  --cyan:      #2585e6;   /* darkened Sui-blue for text */
  --cyan-dim:  #1f6fc2;
  --cyan-glow: #4da2ff;   /* brand Sui-blue — fills/rings/arcs */
  --cyan-wash: rgba(77,162,255,0.12);
  --cyan-line: rgba(37,133,230,0.34);

  /* ── AMBER = caution / agent (untrusted) ────────────── */
  --amber:     #c77f17;   /* AA amber text */
  --amber-dim: #9a6310;
  --amber-glow:#f0a330;   /* vivid amber — leds/arcs */
  --amber-wash:rgba(240,163,48,0.15);
  --amber-line:rgba(199,127,23,0.40);

  /* ── RED = breach / frozen ──────────────────────────── */
  --coral:     #dc2c4f;
  --coral-dim: #b01f3e;
  --coral-glow:#ff5e7d;
  --coral-wash:rgba(220,44,79,0.10);
  --coral-line:rgba(220,44,79,0.34);

  /* ── DAO (deeper Sui navy-blue — only secondary accent) */
  --dao:      #0b6ad6;
  --dao-wash: rgba(11,106,214,0.10);
  --dao-line: rgba(11,106,214,0.32);

  /* ── gauge/sparkline track ──────────────────────────── */
  --g-track:  #e3ecf4;

  /* ── soft tinted rings (replace neon glow) ──────────── */
  --glow-cyan:  0 0 0 4px rgba(77,162,255,0.14);
  --glow-amber: 0 0 0 4px rgba(240,163,48,0.16);
  --glow-coral: 0 0 0 4px rgba(220,44,79,0.14);

  /* ── elevation (blue-tinted shadow ladder, no black) ── */
  --shadow-0: 0 1px 2px rgba(13,42,71,0.04);
  --shadow-1: 0 1px 3px rgba(13,42,71,0.06), 0 6px 16px -10px rgba(13,42,71,0.12);
  --shadow-2: 0 2px 6px rgba(13,42,71,0.07), 0 18px 40px -22px rgba(13,42,71,0.18);
  --shadow-card: var(--shadow-1);
  --ring-1:   0 0 0 1px var(--line);

  /* ── radii / spacing (airier) ───────────────────────── */
  --r-card: 18px;  --r-ctl: 12px;  --r-bar: 8px;
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:18px; --sp-5:26px; --sp-6:40px; --sp-7:64px;
  --band-gap: 72px;  --band-gap-tight: 40px;  --head-gap: 22px;
  --card-pad: clamp(22px,3vw,32px);

  /* ── motion ─────────────────────────────────────────── */
  --ease-tide: cubic-bezier(0.22,0.61,0.36,1);
  --t-value: 650ms;

  /* ── MIGRATION ALIASES — DO NOT REMOVE (binds gauge bands == BANDS) ── */
  --teal:  var(--cyan);    /* calm / safe band */
  --red:   var(--coral);   /* breach band */
  --green: var(--cyan);    /* legacy ok → Sui-blue calm */
  --blue:  var(--dao);
  --bg:    var(--ground-1);
  --panel: var(--ground-2);
  --panel2:var(--ground-2);

  /* retired JS knobs — defined = 0 so nothing reads undefined; unused on light */
  --surge: 0;
  --grain-opacity: 0;
}
```
**Mapping (binds everywhere):** `--teal`/`--cyan` = contract & calm (score<60); `--amber` = agent/caution (60≤score<95); `--red`/`--coral` = breach/freeze (≥95); `--dao` = governance. `*-glow` = the vivid swatch tone for LED/arc fills where a non-text mark wants brand-vivid hue.

---

## 4 · FLAT BACKGROUND + DELETION LIST

`body { background: var(--ground-0); }` is the **entire** backdrop. No fixed layers, no grain, no waves, no blur.

**Delete (markup):** in `index.html` the five fixed divs — `.bg-abyss`, `.bg-grain`, `.bg-surge`, `.freeze-veil`, `.wall-lip` — and their explanatory comment.

**Delete (`styles.css` blocks):** the ATMOSPHERE block (`.bg-abyss/.bg-grain/.bg-surge/@keyframes swell/.wall-lip/.freeze-veil`); the FREEZE-HERO block (`body.frozen .bg-*`, `.freeze-veil`, `@keyframes lip-fail`, `held-breath`); the reduced-motion overrides that reference `.bg-surge/.bg-abyss/.freeze-veil` (trim to surviving elements). All `backdrop-filter:blur()` (`.card`, `.posture`). All deep `0 18px 40px -24px rgba(0,0,0,…)` shadows + all `--glow-*` box-shadow neon (replace with `--shadow-card` / a 1px tinted ring). All dark `--ground-*`/navy `--line*` values (replaced by §3).

**Delete (`App.tsx`):** the `--surge` effect (the `useEffect` writing `--surge`) and the `clamp` helper if now unused. **Keep** `divBps` (ScoreCards read it). **Keep** the `body.frozen` toggle effect — but `body.frozen` now only recolors card/banner tint (`--coral-wash`/`--coral-line`/`--glow-coral`), never water layers. `--surge`/`--grain-opacity` stay defined (=0) so any stray reference resolves.

`body.frozen` hero: a restrained light red wash on the posture banner + score cards, no fixed veil.

---

## 5 · LAYOUT & IA

**Shell:** single centered column, `max-width:1180px`, `padding: 0 clamp(20px,5vw,56px) 140px`, `z-index:0` (no stacking war). `--band-gap:72px` between major bands; the intro cluster (posture → thesis → arch) stays at `--band-gap-tight:40px`.

**Section order (top→bottom):**
| # | band | component(s) | grid |
|---|---|---|---|
| A | Masthead | `Header` (brand + `ENFORCING ▸ TESTNET` pill + radar dot + `ConnectButton`) | full |
| A2 | Posture verdict | `PostureBanner` | full |
| B | Thesis strip | `.thesis.band` | full |
| **NEW** | **Architecture** | `ArchitectureDiagram` slot | full, airiest |
| C | The two seas | 2× `ScoreCard` → `.seas`; then **split** `Sparkline`; then warm-up caveat | grid |
| D | The wall | `LayerStatus` | full |
| E | The instruments | `ModelInternals` | 3-col |
| F | On-chain proof | `ActionLog` + `GovernancePanel` | `.proof` 2-col |
| G | The drill | `AttackPanel` (4 scenes) | auto-fit |
| H | Footer ledger | `FooterLedger` | full |

**Architecture placement = directly after thesis, before the live data** (B → ARCH → C): the thesis states the trust claim in prose; the diagram *is that claim drawn*; the live gauges then read as the diagram in motion. It gets the **most whitespace** of any band.

**Grids (all collapse at the single 920px breakpoint):**
```css
.seas        { display:grid; grid-template-columns:1fr 1fr; gap:28px; }
.spark-split { display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-top:28px; }
.model-blocks{ display:grid; grid-template-columns:1fr 1.2fr 1fr; gap:40px; }
.proof       { display:grid; grid-template-columns:1.6fr 1fr; gap:28px; align-items:start; }
.scene-strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:16px; }
.ledger      { display:grid; grid-template-columns:1.3fr 1fr 1fr; gap:32px; }
```

**Cards:** `background:var(--ground-2); border:1px solid var(--line); border-radius:var(--r-card); padding:var(--card-pad); box-shadow:var(--shadow-card);` — NO backdrop-filter. Pick *one* of hairline-or-shadow emphasis per surface, don't stack heavily.

**Band-head (minimal):** `.kicker` = small Sui-blue uppercase (`color:var(--cyan); letter-spacing:0.16em; text-transform:uppercase`); `.lede` = light grey (`color:var(--ink-dim)`). One optional hairline under the head; nothing heavier. Posture/thesis `.posture`,`.thesis` 3px left accents → drop to **2px** or a soft tinted wash (keep color meaning, lose weight). `band-in` entrance keeps but `translateY` 8px→4px.

**Mobile — single breakpoint:**
```css
@media (max-width:920px){
  .seas,.spark-split,.proof,.model-blocks,.ledger{ grid-template-columns:1fr; }
  :root{ --band-gap:48px; --band-gap-tight:28px; }
  .band--arch{ margin-top:56px; } .arch-frame{ padding:20px; min-height:0; }
  .header{ flex-wrap:wrap; } .header .spacer{ display:none; }
  .app{ padding:0 18px 96px; }
}
```

---

## 6 · THE RISK GAUGE + SPLIT RISK-HISTORY

### 6a · Gauge — **CHOSEN: Concept A, the open-bottom radial ring.**
*Why:* it is the cleanest break from the old semicircular needle dial the owner rejected — a single thin Sui-blue ring whose **sweep length is the value** and **hue is the band**, no needle and no tick rail (just three small 60/95/99 markers). Tide (B) is on-brand but busier (gradients + meniscus + wave + white-number flip); segmented half-arc (C) still reads as "the old dial." The ring is the most minimal, most legible, most "static→live" viz.

**Geometry (exact):** `viewBox 0 0 200 200`; `CX=CY=100`, `R=82`, `SW=12`. A **270° open-bottom arc**: dash run starts lower-left (135°) and sweeps clockwise to lower-right; bottom gap centered. `C=2πR=515.22`; `ARC=C*0.75=386.42`. `lenOf(s)=clamp(s,0,100)/100*ARC`. Each segment = one `<circle r=82>` with `strokeDasharray="<len> <C>"`, `strokeDashoffset={-lenOf(from)}`, wrapped in `transform="rotate(135 100 100)"`. `strokeLinecap="round"`.

**Bands bind to `BANDS` (lo=60/hi=95/alert=99)** via the existing `bandColor`, recolored through `--teal/--amber/--red`:
```ts
const bandColor = (s:number) => s < BANDS.lo ? "var(--teal)" : s < BANDS.hi ? "var(--amber)" : "var(--red)";
```
**Layers (back→front):** (1) full-arc track `var(--g-track)`; (2) faint band tints under the value at `opacity 0.16` — `0..60` teal, `60..95` amber, `95..100` red (so the 60/95 zones read even at a low score); (3) the **live value arc** `from=0 to=v`, full opacity, colored by `bandColor(v)`; (4) three butt-capped markers at 60/95/99 just outside the ring with tiny mono labels (`60`,`95`,`99`); (5) centered readout — `.gauge-num` (display, ~46px, `var(--ink)`) + a `/ 100` mono sublabel. Marker angle: `deg = 135 + clamp(at,0,100)/100*270`.

`role="img"`, `aria-label="risk score N of 100"`. **No needle, no tick scale.** Caption unchanged (honest-caveat invariant): `calibrated anomaly score · 99 = measurement marker, not the gate`. Pure fragment — NO `<section>`/`<h2>`, no handlers, no `cursor:pointer` (ScoreCard renders it twice; non-interactivity test must pass).

```css
.gauge svg { width:100%; max-width:200px; height:auto; display:block; margin:0 auto; }
.gauge-num { font-family:var(--font-display); font-weight:600; font-size:46px;
             letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
.gauge-cap { color:var(--muted); font-family:var(--font-mono); font-size:var(--fs-xs);
             margin-top:8px; text-align:center; line-height:1.4; }
```

### 6b · Split risk-history — **SEPARATE testnet + mainnet, single `{history}` prop.**
`Sparkline` **keeps its exact prop `{ history: AgentTickDTO[] }`** (App passes `history={history}`; App.test mocks `history:[]` → must render the empty/warming state cleanly). Derive both series **internally**:
```ts
const h = history.slice(-120);
const testnet = h.map(t => t.scoreOverall ?? 0);
const mainnet = h.filter(t => t.observatory?.ok).map(t => t.observatory!.score); // sparser, honest
const dead = (h[h.length-1]?.mode ?? "calm") === "dead";
const malicious = (h[h.length-1]?.mode ?? "calm") === "malicious";
```
Render as a **side-by-side small-multiple** in `.spark-split` inside one `.card.sparkstrip`. Each mini-chart: `viewBox 0 0 320 72`, `PADX=6 PADTOP=8 PADBOT=8`, `yOf(s)=PADTOP+(1-clamp(s,0,100)/100)*56`, `xOf(i)=PADX+(n<=1?0:i/(n-1)*(W-2*PADX))`. Dashed etch lines at `yOf(60)` (`--amber-line`) and `yOf(95)` (`--coral-line`), `opacity 0.5`. Trace = `polyline` width 1.75, colored by the **last value's band** (`bandColor`), with a 10%-opacity band-colored area polygon and a newest-tick dot. `n<2` → centered mono `warming up…` text. `dead` → muted dashed trace; `malicious` → faint amber wash over the right 20% of the testnet panel only.

Each panel header carries the **literal asserted strings**: left `TESTNET` + badge `ENFORCED · IN USE` (`.tag-agent` amber); right `MAINNET` + badge `READ-ONLY · OBSERVING` (`.tag-readonly` — distinct from amber, keeps agent/contract color separation; mainnet is the only Sui-blue panel). Card head `.lbl` "Risk history" + `.hint` "last N ticks · color = current band (60 / 95 etched)". `preserveAspectRatio="none"`, `vectorEffect="non-scaling-stroke"`. Pure SVG, no handlers.
```css
.spark-split{ display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-top:28px; }
@media(max-width:920px){ .spark-split{ grid-template-columns:1fr; } }
.mini-spark{ display:flex; flex-direction:column; gap:6px; }
.mini-head{ display:flex; align-items:center; justify-content:space-between; }
.mini-head .lbl{ font-family:var(--font-mono); font-size:11px; letter-spacing:2px; color:var(--muted); }
.mini-spark svg{ width:100%; height:72px; display:block; background:var(--ground-2);
                 border:1px solid var(--g-track); border-radius:10px; }
.tag-readonly{ color:var(--cyan); background:var(--cyan-wash); }
```

---

## 7 · PER-COMPONENT BUILD BRIEF

- **`index.html`** — swap the Google-Fonts `<link>` to §2 (Bricolage + Hanken + IBM Plex Mono); delete the five atmosphere divs + comment; add `<meta name="theme-color" content="#f4f7fb">`. Nothing else.
- **`styles.css`** — replace the `:root` token block with §3; replace `--font-*` per §2; delete every block in §4; add the `.spark-split/.mini-spark`, `.band--arch/.arch-frame`, light `.card`, `--band-gap` rhythm, band-head minimal, and the single 920px media. Keep all migration aliases so the gauge stays bound.
- **`RiskGauge.tsx`** — full replacement with §6a ring (drop `#gauge-bowl`, the needle/`tickInner/tickOuter`, `polar/arcPath` half-arc math; keep `bandColor`, `BANDS`, `.gauge-num`, `.gauge-cap`, the exact caption). Stays a pure non-interactive fragment.
- **`ScoreCard.tsx`** — **no logic change.** Restyle via CSS only: light card, amber ribbon for `is-enforced` / Sui-blue ribbon for `is-readonly`, `.tag-agent` "ML · advisory" amber, role-notes at `--ink-dim`. Keep `cursor:default` on `.scorecard`; add no button/anchor/role. All asserted strings literal.
- **`Sparkline.tsx`** — full replacement with §6b. **Keep the `{ history }` prop signature** (App + App.test depend on it). Render the two-up small-multiple; surface `TESTNET`/`MAINNET` literally; keep `warming up` text; keep `dead`/`malicious` modes.
- **`LayerStatus.tsx`** — restyle only: L1/L2/L3 lamps on light. The `.lamps::before` gradient spine → flat 1px rail; lamp = solid band-color dot + soft 4px tinted ring (no neon). L3/FROZEN lamp = `--coral` (contract-attributed), never amber.
- **`ModelInternals.tsx`** — restyle: glass-box d²/χ² + per-feature contribution bars + corridor on light; bars colored by meaning (amber agent contributions, Sui-blue corridor). Recessed track `var(--inset)`; numerals mono+tabular.
- **`ActionLog.tsx`** — restyle: log rows on `var(--inset)`; the `.clamp`/`.reject` accents → 2px left accent (amber clamp / red reject), no heavy border; tx digests mono; explorer links use `--dao`.
- **`GovernancePanel.tsx`** — restyle: DAO/`GovernanceCap` panel; the override/unfreeze button uses `--dao` (or `--coral` for the danger action), drop the `pulse-coral` glow animation → flat fill + `--glow-coral` ring on hover. Keep existing wallet wiring untouched.
- **`AttackPanel.tsx`** — restyle the 4 scene tiles in `.scene-strip` auto-fit; scene-num uses `.display`; active scene = `--cyan-wash` tint + `--cyan` border. Keep all scene control behavior.
- **`PostureBanner.tsx`** — **no logic change.** Restyle `is-normal` (Sui-blue calm) / `is-caution` (amber) / `is-frozen` (red, contract-attributed — keeps "the contract… itself" + "No agent input" copy). 2px left accent or tinted wash, not 3px.
- **`FooterLedger.tsx`** — restyle to the light `.ledger` 3-col; muted mono metadata, hairline dividers.
- **`ArchitectureDiagram` (NEW placeholder component)** — `App.tsx` reserves a band after the thesis: `<section className="band band--arch"><div className="band-head"><span className="kicker">Architecture</span><span className="lede">how an untrusted radar, the contract, and the DAO actually wire together</span></div><div className="arch-frame">{/* <ArchitectureDiagram/> — filled by the diagram workflow */}</div></section>`. Create `components/ArchitectureDiagram.tsx` returning an empty/min-height placeholder `<div className="arch-slot" aria-label="architecture diagram" />` for now. CSS: `.band--arch{margin-top:88px} .arch-frame{background:var(--ground-2); border:1px solid var(--line); border-radius:var(--r-card); padding:clamp(28px,4vw,56px); display:flex; align-items:center; justify-content:center; min-height:320px} .arch-frame svg{width:100%; height:auto; max-width:1000px}`. Diagram inherits light palette; **never draw an arrow implying the agent triggers FREEZE** (contract-only invariant).
- **`App.tsx`** — delete the `--surge` effect + unused `clamp`; keep `body.frozen` toggle (now tint-only) + `divBps`. Insert the ARCH band after the thesis `.band`, before `.seas`. `Sparkline` call stays `<Sparkline history={history} />`. Everything else unchanged.

---

## 8 · PRESERVED INVARIANTS & TEST IMPACT

**Exact strings (keep literal, case-sensitive):** `ENFORCING ▸ TESTNET`, `ENFORCING ▸ MAINNET`, `ENFORCED · IN USE`, `READ-ONLY · OBSERVING`, `TESTNET`, `MAINNET`, `ML · advisory`, `warming up`, `over-react`, `Drives on-chain CAUTION param-requests`, `intentionally NOT recalibrated`, `read-only`, `not enforced`, `Never on any enforcement path`, `~88.0 bps`/`$0.7610`/`40.0 bps` (ScoreCard info-row format unchanged), `no signal`, `connecting`, `Pyth↔DeepBook divergence`, `—`. **Not present:** `· Sui testnet` (must stay removed). **Classes:** `is-enforced`, `is-readonly`, `env-pill`, `scorecard`.

**Behaviors that must survive:**
1. **ScoreCard non-interactive** — markup contains NO `<button`, `<a `, `role="button"`, `role="tab"`, `onclick`, `cursor:pointer`/`cursor: pointer`. CSS keeps `.scorecard{cursor:default}`; the new card/gauge/sparkline CSS introduces no `cursor:pointer` on these surfaces. (`ScoreCard.test.tsx` asserts this for both roles.)
2. **Role swap by `enforcedEnv`** — purely data-driven; ribbon + title + note swap with `enforced`. No control re-routes enforcement. (`App.test.tsx`.)
3. **`Sparkline` prop unchanged** = `{ history }`; renders cleanly with `history: []` (the empty/`warming up…` path) since App.test mocks `history:[]`.
4. **Both scores always render**; gauge bands bind to `BANDS` 60/95/99 via `--teal/--amber/--red` (migration aliases must resolve).
5. **Color meaning distinct + FREEZE never agent-attributed** — amber=agent ≠ Sui-blue=contract ≠ red=breach; `PostureBanner.is-frozen`, `LayerStatus` L3, and the freeze tint are red/contract, never amber.
6. **Every honest caveat preserved** — App cold-start "warming up"/"over-react" note; ScoreCard testnet thin-pool ("jumpy by design"/"intentionally NOT recalibrated") + mainnet "reads calm"/"Never on any enforcement path"; gauge "99 = measurement marker, not the gate"; sparkline "warming up…".

Run `vitest run` (App.test + ScoreCard.test) + `vite build` after applying; both must stay green/clean.