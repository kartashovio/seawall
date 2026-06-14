# DESIGN_SPEC — Seawall "Tide Observatory" Dashboard (LOCKED)

> **Director's note on the merge.** Four leads, one decision. The **narrative** lead's 8-band spine is the backbone (it makes a judge *discover* the trust-min thesis top-to-bottom, which is the Real-World 50% + "clean demo" edge). The **editorial** lead's three-face type system + the old-name CSS-alias migration is the typographic skeleton (lowest-risk path to a non-generic identity). The **atmosphere** lead's three fixed background layers + the surge/freeze hero is the mood. The **dataviz** lead's bespoke SVG (tide-gauge-as-wall, the sparkline off the unused 120-tick history, the corridor *gate*, the d²-vs-χ² *post*) supplies the signature visuals. Conflicts resolved inline, marked **[CALL]**.

---

## 1. AESTHETIC THESIS

Seawall is a **harbor tide observatory**: abyssal navy water under a faint instrument grain, where the Pyth↔DeepBook **divergence is a literal sea level that rises up the page**, and a thin cyan **seawall** holds it back. Numbers are *engraved* in a wonky optical serif, never glowing SaaS chrome; color is rationed to exactly three meanings — **cyan is the contract and the calm, amber is the untrusted agent, coral is the breach** — so the page reads near-monochrome until something happens. It stays mission-control still until one earned, violent moment: the surge overtops the wall, the sea goes *still* (motion stops — frozen, literally), and the whole frame takes the cold coral light. The unforgettable thing is that **the atmosphere IS the data**: a judge watches the model work in the water before reading a single number.

---

## 2. TYPOGRAPHY

**[CALL]** Three families, none on the banned list, delivered via Google Fonts `<link>` (not self-hosted — the demo runs online; one fewer build step on a tight timeline). **Display = Fraunces** (wonky optical serif — the signature, on the brand + every big numeral), **UI/body = Archivo** (industrial grotesque — labels, copy), **mono = IBM Plex Mono** (all measured data, tabular). This is the editorial lead's pairing; the atmosphere & dataviz leads independently converged on Fraunces + a mono, so it's the consensus display face. Clash Display (narrative lead's alt) is **dropped** — Fraunces already carries display and ships on Google Fonts.

### `<link>` (drop into `index.html` `<head>`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..700,0..100,0..1&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

### Font tokens

```css
:root{
  --font-display:'Fraunces', Georgia, 'Times New Roman', serif;
  --font-ui:'Archivo','Helvetica Neue', sans-serif;
  --font-mono:'IBM Plex Mono', ui-monospace, monospace;
  --fraunces-axes:'SOFT' 0,'WONK' 1,'opsz' 96;
}
body{ font-family:var(--font-ui); font-size:var(--fs-base); -webkit-font-smoothing:antialiased; }
.mono{ font-family:var(--font-mono); font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
.display{ font-family:var(--font-display); font-variation-settings:var(--fraunces-axes); font-optical-sizing:auto; }
```

### Type scale (modular ~1.20, anchored 14px — eight roles, no more)

| Token | px | line-height | letter-spacing | Family / weight | Role |
|---|---|---|---|---|---|
| `--fs-display` | 30 | 1.0 | −0.01em | Fraunces 600 `opsz 144` | Brand wordmark "Seawall" |
| `--fs-numeral` | 52 | 0.95 | 0 | Fraunces 500 `opsz 144`, lining+proportional | Gauge value (the engraved tide reading) |
| `--fs-kicker` | 12 | 1.2 | 0.16em (UPPER) | Archivo 700 | Band chapter kickers + posture word |
| `--fs-h2` | 13 | 1.2 | 0.14em (UPPER) | Archivo 600 | In-card eyebrows |
| `--fs-lg` | 17 | 1.3 | 0 | Fraunces 500 `opsz 40` | Scorecard env title (TESTNET/MAINNET) |
| `--fs-base` | 14 | 1.5 | 0 | Archivo 400 | Body, role-notes, posture sentence |
| `--fs-sm` | 12.5 | 1.5 | 0 | Archivo 400 | Dense rows, log rows |
| `--fs-xs` | 11 | 1.45 | 0.04em | Archivo 500 | Captions, sub-labels, pills |
| `--fs-data` | 13 | 1.4 | −0.01em | Plex Mono 500, tabular | All measured numbers |

```css
:root{
  --fs-display:30px; --fs-numeral:52px; --fs-kicker:12px; --fs-h2:13px;
  --fs-lg:17px; --fs-base:14px; --fs-sm:12.5px; --fs-xs:11px; --fs-data:13px;
}
```

**Hard typographic rules:** every ticking number gets `font-variant-numeric:tabular-nums` (the #1 anti-jitter detail); numbers in mono, labels in Archivo, headlines in Fraunces — never mixed within a role; the **gauge value and the posture word share the display face** so the page's two loudest readings feel like one instrument family.

---

## 3. COLOR TOKENS

**[CALL]** The three semantic accents keep their *hues* (cyan/amber/coral — load-bearing) but the ground deepens to true abyss and each accent gets a 4-step ladder (base/dim/glow/wash) so it's usable at four intensities without guessing. **The migration trick is mandatory:** alias the old token names to the new ones so every existing `var(--teal)`/`var(--red)`/`var(--green)`/`var(--blue)` in the JSX (gauge bands, lamps, bars, log badges) inherits the refined palette with **zero component edits**. This preserves the gauge-bands-bind-to-constants invariant for free.

```css
:root{
  /* ───────── GROUND (abyssal water, surface → trench) ───────── */
  --ground-0:#060b12;  /* deepest — fixed background floor */
  --ground-1:#0a121c;  /* app body */
  --ground-2:#0e1828;  /* card base (gradient bottom) */
  --ground-3:#122236;  /* card top of gradient */
  --inset:#081019;     /* recessed wells: bar tracks, log rows */

  /* ───────── STRUCTURE ───────── */
  --line:#1b2c40;      /* default 1px borders */
  --line-soft:#142133; /* internal dividers */
  --line-lit:#284460;  /* hover / focused edge */

  /* ───────── INK ───────── */
  --ink:#e6eef6;       /* primary / engraved numerals */
  --ink-dim:#aebccb;   /* secondary body */
  --muted:#6f8497;     /* labels, eyebrows, captions */
  --muted-deep:#4a5d70;/* tertiary, disabled */

  /* ───────── CYAN = SAFE / CONTRACT / CALM ───────── */
  --cyan:#2dd4bf;      /* KEEP exact hue — gauge "calm" band binds here */
  --cyan-dim:#1b8c80; --cyan-glow:#6cf2e6;
  --cyan-wash:rgba(45,212,191,.12); --cyan-line:rgba(45,212,191,.40);

  /* ───────── AMBER = CAUTION / AGENT (untrusted) ───────── */
  --amber:#f5b942;     /* KEEP exact hue — gauge mid band + agent semantics */
  --amber-dim:#a87e2e; --amber-glow:#ffcf6b;
  --amber-wash:rgba(245,185,66,.12); --amber-line:rgba(245,185,66,.42);

  /* ───────── CORAL = BREACH / FROZEN (contract) ───────── */
  --coral:#f0476a;     /* KEEP exact hue — gauge breach band + freeze */
  --coral-dim:#b8324a; --coral-glow:#ff8499;
  --coral-wash:rgba(240,71,106,.13); --coral-line:rgba(240,71,106,.45);

  /* ───────── DAO (cool blue — the only secondary, governance) ───────── */
  --dao:#4aa3ff; --dao-wash:rgba(74,163,255,.13); --dao-line:rgba(74,163,255,.40);

  /* ───────── THE WATERLINE (surge motif) ───────── */
  --tide-low:#123042; --tide-high:#2a4a5e; --tide-crest:rgba(45,212,191,.22);
  --foam:rgba(45,212,191,.55); --foam-soft:rgba(45,212,191,.14);

  /* ───────── BREACH ABYSS (freeze recolor) ───────── */
  --flood-0:#2a0a14; --flood-1:#5e1224; --flood-crest:rgba(240,71,106,.7);

  /* ───────── GLOWS (rationed — only lamps, needle, freeze) ───────── */
  --glow-cyan:0 0 24px rgba(45,212,191,.32);
  --glow-amber:0 0 24px rgba(245,185,66,.30);
  --glow-coral:0 0 30px rgba(240,71,106,.42);

  /* ── MIGRATION ALIASES — every existing var(--teal/red/green/blue) resolves here.
        DO NOT remove: this is what keeps the gauge bands == on-chain BANDS with no JSX edit. */
  --teal:var(--cyan); --red:var(--coral); --green:var(--cyan); --blue:var(--dao);
  --bg:var(--ground-1); --panel:var(--ground-3); --panel2:var(--ground-2);

  /* one JS-set knob: 0 = calm low water … 1 = at the wall lip */
  --surge:0.06; --grain-opacity:.05;
}
```

**Color governance (what keeps it un-generic):** (1) three accents, three meanings, DAO blue the *only* secondary — green folds into cyan, no fourth hue; (2) ground stays >92% of pixels — accents appear as ink/hairline/small-fill/single-glow, never a saturated block; (3) **amber and coral never touch the same element** (agent ≠ contract is load-bearing); (4) glow is earned — `box-shadow` halos on exactly the live lamps, the gauge needle, and the FREEZE banner, nowhere else.

---

## 4. BACKGROUND & TEXTURE

**[CALL]** Atmosphere lead's three fixed layers, but driven through CSS vars so they cost one composite each and never reflow. Layers live as empty divs in `index.html` *before* `#root`; `.app` sits at `z-index:1` on a transparent background so the water shows through the gaps between cards.

```css
/* index.html: <div class="bg-abyss"></div><div class="bg-grain"></div>
   <div class="bg-surge"></div><div class="freeze-veil"></div><div class="wall-lip"></div>
   then <div id="root"></div> */

/* L1 — ABYSS: static depth gradient + two off-center current glows (sky→trench). */
.bg-abyss{
  position:fixed; inset:0; z-index:-3; pointer-events:none;
  background:
    radial-gradient(1100px 520px at 72% -8%, rgba(45,212,191,.10), transparent 60%),
    radial-gradient(900px 700px at 8% 108%, rgba(30,90,130,.14), transparent 62%),
    linear-gradient(180deg, #0c1d30 0%, var(--ground-2) 28%, var(--ground-1) 62%, var(--ground-0) 100%);
  transition:background 1.2s ease;   /* lets the freeze recolor crossfade */
}
/* L2 — GRAIN: one inline fractalNoise data-URI, monochrome, overlay-blended ~5%.
   Kills gradient banding (the #1 tell of a cheap dark dashboard). No animation. */
.bg-grain{
  position:fixed; inset:0; z-index:-2; pointer-events:none;
  opacity:var(--grain-opacity); mix-blend-mode:overlay; background-size:160px 160px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
/* L3 — SURGE: the rising waterline. Height bound to --surge (set from divBps).
   Two phase-offset SVG wave crests give parallax swell. THE signature motif. */
.bg-surge{
  position:fixed; left:0; right:0; bottom:0; z-index:-1; pointer-events:none;
  height:calc(8vh + var(--surge) * 64vh);
  transition:height .9s cubic-bezier(.22,.61,.36,1), background .9s ease, box-shadow .6s ease;
  background:linear-gradient(180deg, var(--tide-high) 0%, var(--tide-low) 22%, var(--ground-1) 100%);
  box-shadow:
    inset 0 1px 0 0 rgba(170,240,255,.75),
    inset 0 6px 22px -6px var(--tide-crest),
    0 -10px 40px -8px var(--tide-crest);              /* surface bleeds light UP */
  -webkit-mask-image:linear-gradient(180deg,#000 0%,#000 70%,transparent 100%);
          mask-image:linear-gradient(180deg,#000 0%,#000 70%,transparent 100%);
}
.bg-surge::before,.bg-surge::after{
  content:""; position:absolute; left:-50%; right:-50%; top:-14px; height:28px;
  background-repeat:repeat-x; background-size:50% 28px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='28' viewBox='0 0 240 28'%3E%3Cpath d='M0 16 C40 4 80 4 120 16 S200 28 240 16 V28 H0 Z' fill='%232dd4bf' fill-opacity='0.35'/%3E%3C/svg%3E");
}
.bg-surge::before{ animation:swell 9s linear infinite; opacity:.7; }
.bg-surge::after { animation:swell 14s linear infinite reverse; opacity:.4; top:-9px; }
@keyframes swell{ from{ background-position-x:0 } to{ background-position-x:240px } }

/* the cyan "wall" the water is held below — a hairline under the header */
.wall-lip{
  position:fixed; left:0; right:0; top:64px; height:1px; z-index:0; pointer-events:none;
  background:linear-gradient(90deg, transparent, var(--cyan), transparent);
  opacity:.18; box-shadow:0 0 12px rgba(45,212,191,.25);
}
.freeze-veil{ position:fixed; inset:0; z-index:0; pointer-events:none; opacity:0; }
.app{ position:relative; z-index:1; }
```

Card surfaces float on the water: glass with a lit top bevel and a shadow cast onto the sea.

```css
.card{
  position:relative;
  background:linear-gradient(180deg, var(--ground-3) 0%, var(--ground-2) 38%, var(--ground-2) 100%);
  border:1px solid var(--line); border-radius:var(--r-card); padding:var(--sp-5);
  backdrop-filter:blur(8px) saturate(112%);
  box-shadow:0 1px 0 0 rgba(180,220,240,.05) inset, 0 18px 40px -24px rgba(0,0,0,.85);
}
```

**prefers-reduced-motion:** the surge keeps its `--surge`-driven height but loses the rise transition; the waves hold a static crest; the abyss/veil recolor instantly. **No information is lost — only motion.** Full block in §7.

---

## 5. LAYOUT & NARRATIVE IA

**[CALL]** Narrative lead's 8-band spine, full-width stacked, each band a chapter that advances the thesis. This **dissolves** the current `grid-2` pairs: LayerStatus ("the wall") and ModelInternals ("the instruments") go **full-width** because the 3-layer ladder is the make-or-break and must not read as a co-equal half-tile; Governance demotes to the ActionLog's companion; AttackPanel graduates to a titled "drill" chapter (the demo is a first-class deliverable). **App.test.tsx renders unchanged** because all asserted strings (`ENFORCING ▸ TESTNET`, the ribbons, `TESTNET`/`MAINNET`, `warming up` + `over-react`) survive — see §9.

```
─ wall-lip (fixed cyan hairline, top:64px) ──────────────────────────────────
A  MASTHEAD          brand (Fraunces) · ENFORCING ▸ {env} pill · ● radar live · Connect
   POSTURE BANNER    one synthesized word + sentence + "last action Ns ago"  (replaces frozen-banner)
B  THESIS STRIP      one quiet color-keyed line — states the claim once, teaches the legend
C  THE TWO SEAS      twin ScoreCards (testnet ENFORCED · mainnet READ-ONLY)
   SCORE SPARKLINE   full-width 36px tide-chart strip (the unused 120-tick history)  [non-interactive]
   WARM-UP CAVEAT    the verbatim cold-start note (kept at App level)
D  THE WALL          LayerStatus — full-width breakwater (L1 cyan · L2 amber · L3 coral)
E  THE INSTRUMENTS   ModelInternals — full-width, internal 3-up sub-grid
F  ON-CHAIN PROOF    ActionLog (1.6fr) | GovernancePanel (1fr)
G  THE DRILL         AttackPanel — full-width 5-button filmstrip
H  FOOTER LEDGER     SCOPE · DEPLOYED·TESTNET · LEGEND
─ water rises from the viewport bottom toward the wall-lip ───────────────────
```

```css
.app{ max-width:1240px; margin:0 auto; padding:0 24px 80px; }
.band{ margin-top:28px; }  .band--hero{ margin-top:20px; }
.band-head{ display:flex; align-items:baseline; gap:12px; margin:0 2px 14px; }
.band-head .kicker{ font:700 var(--fs-kicker)/1 var(--font-ui); letter-spacing:.16em; text-transform:uppercase; color:var(--ink); }
.band-head .lede{ font-size:var(--fs-sm); color:var(--muted); }
.band-head .tag{ margin-left:auto; }

.seas{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.wall, .instruments{ display:block; }
.instruments .model-blocks{ display:grid; grid-template-columns:1fr 1.2fr 1fr; gap:24px; }
.proof{ display:grid; grid-template-columns:1.6fr 1fr; gap:16px; align-items:start; }
.drill .scene-strip{ display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }

/* MOBILE COLLAPSE: one rule, single breakpoint — every multi-col grid → 1 col. */
@media (max-width:920px){
  .seas,.proof,.instruments .model-blocks{ grid-template-columns:1fr; }
  .drill .scene-strip{ grid-template-columns:1fr 1fr; }
  .ledger{ grid-template-columns:1fr; }
}
```

### The POSTURE banner (the synthesizer — replaces the standalone frozen-banner)

Derived purely from props App already holds (`paused`, `applied`, `baseline`) — no new data:

```ts
const posture = paused ? "FROZEN"
  : (applied.maxLtv < baseline.maxLtv || applied.borrowCap < baseline.borrowCap) ? "CAUTION ACTIVE"
  : "NORMAL";
```

| Posture | Color | Word | Sentence (exact) |
|---|---|---|---|
| **NORMAL** | cyan | `NORMAL` | `Calm seas. The wall is holding at full corridor — the agent is watching, the contract has nothing to act on.` |
| **CAUTION ACTIVE** | amber | `CAUTION ACTIVE` | `The radar flagged a rising surge. The contract accepted a clamped tighten — params ratcheted toward floor, only-safer. The agent's number was re-checked, not trusted.` |
| **FROZEN** | coral | `🧊 FROZEN` | `Hard stop. The contract re-derived a Pyth↔DeepBook breach itself and paused the market. No agent input — only the DAO can unfreeze.` |

NORMAL never says "safe" (it says *the wall is holding*); FROZEN is the **only** posture that says "the contract… itself" + "No agent input" (honors FREEZE-never-agent-attributed).

### The THESIS strip (band B)

`Seawall` · `[amber]` an off-chain ML radar watches the oracle and the order book — `[cyan]` the contract re-derives every breach from raw Pyth + DeepBook and only ever pushes safer — `[dao]` only the DAO can unfreeze. · `[ink italic]` Its number is never trusted. (The one place the tagline is a headline; the legend is taught here.)

---

## 6. SIGNATURE COMPONENTS

### 6.1 The tide-gauge risk dial (RiskGauge)
Keep the exact geometry (`CX110 CY116 R92 STROKE16`, `scoreToAngle`, the three `BANDS`-bound band paths, the 99 alert marker, the caption verbatim). **[CALL]** dataviz lead's "rising-water wedge" is **deferred to a stretch** (it needs `<clipPath>` JSX surgery that risks the geometry); the **shippable** dial changes are CSS-only + 2 tiny safe JSX `<text>` adds: (1) the value in **Fraunces 52px** band-colored, tabular, with a reserved leading slot so 8↔88↔100 don't shift; (2) the needle gets `filter:drop-shadow(0 0 4px currentColor)` and sweeps via `transition:transform .5s cubic-bezier(.4,0,.2,1)` about the hub origin; (3) the band track recolors to `--inset` so the colored bands sit proud; (4) a 9px mono `99` label beside the alert tick; (5) caption in Plex Mono `--muted`. Bands still read `BANDS` — untouched.

### 6.2 The 3-layer WALL (LayerStatus)
**[CALL]** dataviz lead's breakwater is the hero visual but **build it as enhanced stacked relay-rows first** (the existing `.lamp` DOM), with the SVG cross-section as a clearly-scoped stretch — the rows alone deliver the story at zero risk. Rows are connected by a vertical **escalation rail** whose gradient runs cyan→amber→coral (L1→L3), making "three rungs of one ladder" legible:

```css
.lamps{ position:relative; display:flex; flex-direction:column; gap:12px; }
.lamps::before{ content:""; position:absolute; left:19px; top:14px; bottom:14px; width:2px;
  background:linear-gradient(180deg, var(--cyan-dim), var(--amber-dim) 50%, var(--coral-dim)); opacity:.35; }
.lamp{ display:flex; align-items:center; gap:12px; padding:12px 12px 12px 16px;
  background:var(--inset); border:1px solid var(--line); border-radius:var(--r-ctl); }
.lamp .led{ width:11px; height:11px; border-radius:50%; background:#1a2836; border:1px solid var(--line-lit); z-index:1; }
.lamp.on.l1 .led{ background:var(--cyan);  border-color:var(--cyan);  box-shadow:0 0 12px var(--cyan); }
.lamp.on.l2 .led{ background:var(--amber); border-color:var(--amber); box-shadow:0 0 12px var(--amber); }
.lamp.on.l3 .led{ background:var(--coral); border-color:var(--coral); box-shadow:0 0 16px var(--coral); }
.lamp.on.l2{ border-color:var(--amber-line); }
.lamp.on.l3{ border-color:var(--coral-line); background:linear-gradient(180deg, var(--coral-wash), var(--inset)); }  /* L3 ≠ L2: whole row glows coral, never agent-attributed */
```
Speed line typeset as a pull-quote — "seconds" in Fraunces italic `--cyan`. Keep the `last on-chain action: {ago}` timer. **Sub-labels stay verbatim** (`always-on · agent-independent · per-borrow` / `agent-originated · clamped to corridor` / `contract-only · div≥T or book-not-ok · DAO-unfreeze`).

### 6.3 Score-history SPARKLINE (NEW — Sparkline.tsx, lifts the unused 120-tick `history`)
A 36px full-width strip directly under the two ScoreCards, spanning both, **non-interactive** (status, not control). `<svg viewBox="0 0 1000 36" preserveAspectRatio="none">`. Back-to-front: (1) two dashed band-etch lines at `y(60)`/`y(95)` read from `BANDS` (8px mono `60`/`95` labels), (2) a low-opacity area fill under the trace, (3) the trace `<polyline>` whose stroke is a **vertical `userSpaceOnUse` gradient** cyan→amber→coral so color encodes height automatically (cyan low, coral on a spike — the Scene-2 creep across `60` is visible), (4) a breathing newest-tick dot at the right, `cx/cy` transitioned over `--t-value`. Mode tints: `malicious` → faint amber hatch on the right 20%; `dead` → trace desaturates to `--muted` + dashes.

### 6.4 Corridor bars (inside ModelInternals — keep `.corr`/`.band`/`.cur` math)
**[CALL]** the editorial+dataviz "lock-gate": the floor→baseline band stays cyan-wash, but the current marker becomes an **amber diamond** (the agent's ratchet, inside a cage it can't widen), and a faint static "ghost" tick at the previous `applied` proves one-way motion. A 4px coral end-cap on `[baseline,100%]` makes "the agent can never push looser" impossible-by-construction visible. Legend stays verbatim (`◆ marker = agent's current ratchet · band = floor→baseline (DAO-set, agent can't widen)`).

```css
.corr{ position:relative; height:16px; background:var(--inset); border:1px solid var(--line); border-radius:var(--r-bar); }
.corr .band{ position:absolute; top:0; bottom:0; background:var(--cyan-wash); border-left:1px solid var(--cyan-line); }
.corr .cur{ position:absolute; top:50%; width:9px; height:9px; transform:translate(-50%,-50%) rotate(45deg);
  background:var(--amber); box-shadow:0 0 8px var(--amber-glow); border:1px solid var(--ground-1);
  transition:left var(--t-value) var(--ease-tide); }
```

### 6.5 Model-internals charts (ModelInternals — keep every number + the joint-anomaly line)
(1) **d²-vs-χ² as a threshold post:** keep the existing `d2Width=min(100,(d2/thr)*50)` formula (so χ² sits at the 50% midpoint), add a fixed 2px `--ink` vertical post at 50% labeled `χ²₀.₉₅(k)=thr`; the fill is cyan in the calm half and flips coral past the post (`tripped`); the `TRIP` word renders Fraunces-italic coral. (2) **Per-feature bars:** add one full-width **stacked** spectrum bar above the individual bars so the joint-anomaly money shot is self-evident (no single bar alarming, yet the stack is full and d² is past the post). Bars stagger-settle 30ms·index. (3) Recessed engraved tracks, labels Archivo, values mono-tabular. The synthesizing line `The score is an event field — never on this logic path. Everything the contract acts on is re-derived on-chain.` sits under the three blocks.

### 6.6 ActionLog rows — the loud CLAMP/REJECT money shot
Receipt-tape feel: mono, dense, newest-first, a 1px left-gutter rule connecting the chips. Keep `summarize()` strings + digest links + the existing `accent()` left-borders verbatim. **Make refusals loud:** CLAMP rows get a 3px amber left border + a left-edge amber wash; REJECT rows the same in coral; a new clamp/reject row fires a one-shot `log-strike` (background flash band-color@18%→transparent, 900ms). `k-frozen` becomes the loudest solid chip. A muted pin above the log: `Watch for CLAMP (amber) and REJECT (coral): the contract refusing the agent. That's distrust, on-chain.`

```css
.logrow{ display:grid; grid-template-columns:74px 1fr auto; gap:12px; align-items:center; padding:9px 11px;
  background:var(--inset); border:1px solid var(--line-soft); border-radius:var(--r-ctl);
  font-family:var(--font-mono); font-size:12px; animation:tape-in .35s ease-out; }
.logrow.clamp{  border-left:3px solid var(--amber); background:linear-gradient(90deg,var(--amber-wash),var(--inset) 40%); }
.logrow.reject{ border-left:3px solid var(--coral); background:linear-gradient(90deg,var(--coral-wash),var(--inset) 40%); }
```

### 6.7 The FREEZE hero moment
Atmosphere lead's earned-then-still beat, fired from `paused` via a `body.frozen` class. Beats (≈1.4s, then frozen-still): (1) **overtop** — `--surge` clamps to ~0.98 so the surge covers the wall-lip, water gradient whips to coral; (2) **wall fails** — `.wall-lip` snaps coral, pulses once (`lip-fail`); (3) **cold light** — `.bg-abyss` crossfades to a coral-tinted dark and `.freeze-veil` fades a one-shot vignette in, then *barely* breathes (`held-breath`, 6s, 85%↔100% — "a held breath," never strobes); (4) **the sea STOPS** — `.bg-surge::before/::after { animation-play-state:paused }` (removing motion reads as *frozen* more than any flash). The posture banner FROZEN state is the verdict. **Amber appears nowhere in `.frozen`.** Reversible: removing `.frozen` runs everything in reverse (water recedes, lip cools to cyan).

---

## 7. MOTION

One easing vocabulary; the page is *still* until data moves it.

```css
:root{ --ease-tide:cubic-bezier(.22,.61,.36,1); --ease-surge:cubic-bezier(.5,0,.1,1);
  --t-value:650ms; --t-pulse:2600ms; }
```

- **Page-load stagger:** bands fade/translate-up 8px, 60ms apart (`band-in`); inside ModelInternals, bars stagger 30ms·index.
- **Value easing:** every data-driven geometry glides over `--t-value` `--ease-tide` (never snaps): needle `transform`, bar `width`, corridor diamond `left`, sparkline dot `cx/cy`, surge `height`. On a fast de-peg (Δscore>25 or `paused`) swap to `--ease-surge` (420ms) — water *slams* up the wall.
- **Live-pulse:** the `● radar live` dot + the sparkline newest-tick dot breathe on `--t-pulse` (cyan, 2.6s). The freeze banner is the only scaled glow.
- **FREEZE transition:** §6.7 — single-run beats 1–2, only the vignette loops (barely), the sea stops.

```css
@media (prefers-reduced-motion:reduce){
  *{ animation:none!important; }
  .bg-surge,.card,.bg-abyss,.gauge svg line,.corr .cur,.bar-fill{ transition:none!important; }
  .bg-surge::before,.bg-surge::after{ animation:none; }
  .freeze-veil{ opacity:1; }      /* state still fully resolves — only motion removed */
}
```
Crucially the FREEZE *story still lands* with motion off — color + height **states** carry it, motion only sweetens. (Product & UX 20% signal.)

---

## 8. PER-COMPONENT BUILD BRIEF

- **`index.html`** — add the Google Fonts `<link>` (§2) to `<head>`; add the five fixed layer divs (`bg-abyss`, `bg-grain`, `bg-surge`, `freeze-veil`, `wall-lip`) immediately inside `<body>` before `#root`.
- **`App.tsx`** — restructure the flat grid into the eight `.band` regions of §5 (wrap `.seas`, `.wall`, `.instruments`, `.proof`, `.drill`, `.ledger`). Derive `posture` from the in-scope `paused`/`applied`/`baseline`; render the **posture banner** (replacing the `{paused && frozen-banner}` block) with the three exact sentences. **Keep the verbatim warm-up note `<div className="muted warmup-note">…warming up…over-react…</div>` at App level** (App.test asserts those substrings on the full App markup). Add two presentational `useEffect`s: `document.documentElement.style.setProperty("--surge", clamp(0.06 + (latest?.divBps??0)/130, 0.06, paused?0.98:0.95))` and `document.body.classList.toggle("frozen", paused)`. Add the thesis strip (band B), the band-head kickers, the sparkline strip, the footer ledger. Lift `history` from `useAgentStream` (hook already returns it) into the Sparkline. No data flow / handler / load-bearing-string changes.
- **`styles.css`** — replace `:root` with §3 tokens **including the alias block**; swap the `body` font/background for §4 (move the radial to `.bg-abyss`); add §2 type rules, the `.band`/`.band-head`/grid system (§5), glass `.card` + lit eyebrow rule, the lamp rail (§6.2), corridor gate (§6.4), log strike rows (§6.6), posture banner, thesis, ledger, freeze rules (§6.7), and the §7 reduced-motion block. Keep `.scorecard`, `.ribbon`, `.is-enforced`, `.is-readonly`, `.env-pill`, `.gauge`, `.barrow`, `.bar-track`, `.corr`, `.lamp`, `.logrow`, `.k-*` class names intact (only restyle).
- **`RiskGauge.tsx`** — CSS-only restyle per §6.1 (Fraunces value, needle glow+sweep, recessed track) via existing classes; the `99` label + needle `strokeWidth`/`filter` are tiny safe JSX adds. **Do not touch** `CX/CY/R/STROKE`, `scoreToAngle`, the `arcPath` band paths, or the `BANDS` references. Caption verbatim.
- **`ScoreCard.tsx`** — **structurally frozen.** No new `<button>`/`<a>`/`role`/`onClick`/`cursor:pointer` — add explicit `cursor:default` on `.scorecard` in CSS as a belt-and-braces guard. Add a `box-shadow`-only role glow (amber for `.is-enforced`, cyan for `.is-readonly`) — ambient, not a hover state. Ribbon text, `ML · advisory` tag, env title, both `NOTE` role-notes, info-row strings stay verbatim.
- **`LayerStatus.tsx`** — restyle to the rail + relay rows (§6.2) via existing `.lamp`/`.led`/`.lt`/`.ls` classes; the speed-line pull-quote and `ago` timer are CSS. `agentTightened`/`paused` logic and all sub-label strings unchanged.
- **`ModelInternals.tsx`** — restyle per §6.5: threshold-post on the d² bar, the new stacked spectrum bar above the per-feature bars, corridor amber diamond. Keep `CHI2_95`, `d2Width`, the contribution math, the `joint-anomaly` line, the corridor legend, the synthesizing line all verbatim.
- **`ActionLog.tsx`** — add `clamp`/`reject` row classes (map from kind) for the loud treatment + the `log-strike` animation + the watch-for pin line; keep `summarize()`, `txUrl`, badge classes, digest links verbatim.
- **`GovernancePanel.tsx`** — restyle only: DAO-blue card accent, the unfreeze button as the one deliberately-heavy coral control, `--t-pulse` breath when enabled. All four status strings, the cap-ownership gating, the `&GovernanceCap · owned` tag unchanged.
- **`AttackPanel.tsx`** — restyle the 5 buttons as a horizontal `.scene-strip` filmstrip with per-scene accent (Scene ① coral, ② amber, ③ amber, ④ grey, ↺ cyan); scene numbers in Fraunces. **[CALL]** keep the existing array ORDER and `mode`/`override` payloads (the agent + any e2e depend on them) — do **not** reorder despite the narrative lead's suggestion; the ① ②… glyphs already encode the demo arc. Keep the honest `scripts/inject-divergence` line verbatim.
- **NEW `Sparkline.tsx`** — §6.3; consumes `history` + `BANDS`; pure SVG, non-interactive, no chart lib.
- **NEW `PostureBanner.tsx`** (optional split from App) — §5; renders the derived posture word + sentence + `ago`.
- **NEW `FooterLedger.tsx`** (optional) — §10/band H: SCOPE · DEPLOYED·TESTNET (package/policy slices + explorer links via `CFG.explorerObj`) · LEGEND.

---

## 9. PRESERVED INVARIANTS & TEST IMPACT

**Hard invariants (do not break):**
- **ScoreCards non-interactive** — no `<button>`/`<a>`/`role="button"`/`role="tab"`/`onclick`/`cursor:pointer` anywhere in the card subtree; the new role glow is `box-shadow` only; explicit `cursor:default` added. The sparkline strip is likewise non-interactive.
- **amber=agent / cyan=contract&calm / coral=breach kept disjoint;** amber and coral never share an element; **L3/FREEZE carries no agent attribution** (posture FROZEN + L3 sub-label both say "contract-only / no agent input").
- **Advisory score is a readout, never the trigger** — stated explicitly by the ModelInternals synthesizing line; the trust story is carried by the wall, the corridor gate, and the loud CLAMP/REJECT rows.
- **Gauge bands == on-chain constants** — RiskGauge keeps reading `BANDS` (`SCORE_LO 60 / SCORE_HI 95 / ALERT_SCORE 99`); the sparkline etch lines read `BANDS`; the corridor reads `MAX_LTV_BPS`/`BORROW_CAP_BPS`. The alias block (`--teal:var(--cyan)` etc.) means no JSX color reference changes.
- **Every honest caveat kept:** cold-start `warming up`/`over-react` note (App level, verbatim); testnet thin-pool jumpiness + "mainnet reads calm proves the model" (both `NOTE` role-notes verbatim); `99 = measurement marker, not the gate` caption; the demo-tight-freeze-threshold + single-key-DAO framing (footer SCOPE column).

**Exact strings/behaviors that MUST survive so the vitest suites stay green:**

*App.test.tsx:* `is-enforced` / `is-readonly` classes on the `scorecard` sections in render order (testnet first); `ENFORCED · IN USE` / `READ-ONLY · OBSERVING`; `ENFORCING ▸ TESTNET` and `ENFORCING ▸ MAINNET` (env pill flips with `enforcedEnv`); `env-pill`; `TESTNET` + `MAINNET` titles both present; the substrings `warming up` **and** `over-react` present in App markup; roles SWAP with `enforcedEnv`; default `latest=null` ⇒ testnet enforced; **`· Sui testnet` must NOT appear** (don't reintroduce it in any header restyle).

*ScoreCard.test.tsx:* `ENFORCED · IN USE` + `is-enforced` (and not `is-readonly`) for enforced; `READ-ONLY · OBSERVING` + `is-readonly` (and not `is-enforced`) for read-only; `TESTNET` / `MAINNET` titles; `ML · advisory` tag; info row `~88.0 bps`, `$0.7610`, `40.0 bps`; enforced note substrings `Drives on-chain CAUTION param-requests` + `intentionally NOT recalibrated`; read-only note substrings `read-only` + `not enforced` + `Never on any enforcement path`; `no signal` (book.ok===false and divBps-undefined paths); `—` em-dash; `connecting` body with no `Pyth↔DeepBook divergence` when `available=false`; and the **non-interactivity guard** — markup contains none of `<button`, `<a `, `role="button"`, `role="tab"`, `onclick`, `cursor:pointer`, `cursor: pointer`.

> All of the above are untouched by this spec: it restyles via CSS + adds new sibling bands/components, and every asserted string lives in JSX text or class names that remain verbatim. Run `pnpm --filter dashboard test` after the styles.css + App.tsx restructure and before any component restyle to confirm the spine change alone is green.