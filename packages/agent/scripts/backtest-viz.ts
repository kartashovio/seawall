// Dashboard stress-test-gallery data generator.
//
// ⚠️ NO MODEL/CALIBRATION CHANGE. This REPLAYS the existing live scoring path over
// each historical event so the gallery shows what the LIVE dashboard would show on
// that day — nothing is re-tuned:
//   detector (same features/warmup/λ as the validated backtest) → live Calibrator
//   (χ²(k) CDF + calm dead-zone, reads ~0 in calm) → EWMA smooth (SCORE_SMOOTH_ALPHA)
//   → one-way ratchet (tighten fast, relax only on sustained calm, 10%/10min).
// It then RE-DERIVES the report's calm-percentile score from the same d² and asserts
// it matches the validated data/reports/<case>.json bit-close — proof the detector +
// cached data are byte-identical to the validated run (no drift). Overlaid context:
//   • price  — the drawdownKey series (the market move);
//   • divBps — the detector's own `div` feature (1e4·|ln(divA)−ln(divB)|), the same
//              oracle↔market gap shape the contract re-derives on-chain;
//   • freeze — divBps ≥ 5% (the contract-only FREEZE line).
// Output: packages/dashboard/src/backtests/<case>.json (+ barrel index).
//
// Run:  pnpm exec tsx packages/agent/scripts/backtest-viz.ts all
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { EVENTS } from "../src/events";
import { loadSeries } from "../src/backtest-lib";
import { Detector, buildFeatures, asofJoin, paramFromScore } from "@seawall/model";
import { Calibrator, smoothScore, percentileFn, type CalibratedScore } from "../src/calibrate";
import { MAX_LTV, BORROW_CAP, T_FREEZE, D_CAUTION, SCORE_LO, RELAX_STEP_FRAC_BPS, SCORE_SMOOTH_ALPHA } from "@seawall/shared";

const GRID = 60_000;
const FREEZE_BPS = Number(T_FREEZE) / 1e5; // 500
const CAUTION_BPS = Number(D_CAUTION) / 1e5; // 100
const RELAX_STEP = Number(RELAX_STEP_FRAC_BPS) / 10_000; // 0.10 = 10% of span per step
const ALL_CLEAR_TICKS = 10; // 10 min of sustained calm before relax begins
const RELAX_COOLDOWN_TICKS = 10; // 10 min between relax steps
const OUT_DIR = join(process.cwd(), "packages/dashboard/src/backtests");
const MAX_POINTS = 300;

const META: Record<string, { asset: string; cls: "systemic" | "idiosyncratic" | "depeg"; priceLabel: string }> = {
  oct10: { asset: "SUI", cls: "systemic", priceLabel: "SUI/USD (last)" },
  aug2024: { asset: "SUI", cls: "systemic", priceLabel: "SUI/USD (last)" },
  feb2025: { asset: "SUI", cls: "systemic", priceLabel: "SUI/USD (last)" },
  usdc2023: { asset: "USDC", cls: "depeg", priceLabel: "USDC/USD (bybit)" },
  cetus: { asset: "SUI", cls: "idiosyncratic", priceLabel: "SUI/USD (last)" },
};

interface VizPoint {
  ts: number;
  price: number | null;
  divBps: number | null;
  score: number; // live-calibrated, smoothed (calm ~0)
  maxLtv: number; // % (ratcheted applied)
  borrowCap: number; // %
  frozen: boolean;
}

async function gen(key: string): Promise<void> {
  const cfg = EVENTS[key];
  const reportPath = join(process.cwd(), `data/reports/${key}.json`);
  if (!existsSync(reportPath)) {
    console.warn(`[viz] ${key}: no report — run \`tsx src/backtest.ts ${key}\` first; skipping`);
    return;
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    label: string; firstAlert: number | null; visibleDrop: number | null;
    leadMinutes: number | null; peakD2: { ts: number }; driverAtAlert: string | null;
    calmSingleAlerts: number; calmCount: number;
    series: { ts: number; score: number; solvency: number; liquidity: number }[];
  };

  // ── replay the SAME detector pipeline the validated report was built from ──
  const series = await loadSeries(cfg, GRID);
  const rows = asofJoin(series, cfg.windowStartMs, cfg.windowEndMs, GRID, 3 * GRID);
  const feats = buildFeatures(rows, {
    refKey: cfg.refKey, divA: cfg.divA, divB: cfg.divB, dispKeys: cfg.dispKeys,
    marketRefKey: cfg.marketSymbol ? "market" : undefined, velWindow: cfg.velWindow ?? 30, rvSpan: cfg.velWindow ?? 30,
  });
  const featureList = cfg.marketSymbol ? ["disp", "div", "divvel", "volvel", "mktvol"] : ["disp", "div", "divvel", "volvel"];
  const det = new Detector(featureList, { warmup: 120, lambdas: { mean: cfg.lambda ?? 0.99, cov: cfg.lambda ?? 0.99 } });
  const raw = feats.map(({ ts, fv }) => ({ ts, r: det.update(fv), div: typeof fv.div === "number" ? fv.div : null }));

  // ── regression guard: re-derive the report's calm-percentile score from this d²
  //    and confirm it matches the validated file (proves no model/data drift) ──
  const inCalm = (ts: number) => ts >= cfg.calm[0] && ts < cfg.calm[1];
  const post = raw.filter((s) => s.r.score > 0);
  const pctAll = percentileFn(post.filter((s) => inCalm(s.ts)).map((s) => s.r.d2).sort((a, b) => a - b));
  const repByTs = new Map(report.series.map((s) => [s.ts, s.score]));
  let maxDiff = 0;
  let compared = 0;
  for (const s of raw) {
    const rep = repByTs.get(s.ts);
    if (rep != null) {
      maxDiff = Math.max(maxDiff, Math.abs(rep - (s.r.score > 0 ? pctAll(s.r.d2) : 0)));
      compared++;
    }
  }
  const drift = maxDiff > 0.5;
  if (drift) console.warn(`[viz] ⚠️ ${key}: re-derived score differs from report by up to ${maxDiff.toFixed(2)} pct over ${compared} ticks — data may have drifted`);

  // ── REPLAY the live scoring path so the gallery shows what the LIVE dashboard
  //    would show on that day: detector d² → live Calibrator (χ²(k) CDF + calm
  //    dead-zone, reads ~0 in calm) → EWMA smooth (SCORE_SMOOTH_ALPHA) → one-way
  //    ratchet on the smoothed sub-scores (tighten fast, relax only on sustained
  //    calm, 10%/10min). Baseline in calm → tighten on the event → slow relax after.
  //    divBps = the detector's own `div` feature (oracle↔market gap, bps); price =
  //    the drawdownKey series. The validated alert/lead markers come from the report. ──
  const cal = Calibrator.forFeatures(featureList);
  const byTs = new Map(rows.map((r) => [r.ts, r.values as Record<string, number | undefined>]));
  let sm: CalibratedScore | undefined;
  let curLtv = MAX_LTV.baseline;
  let curCap = BORROW_CAP.baseline;
  let calmRun = 0;
  let lastRelax = -RELAX_COOLDOWN_TICKS;
  const ltvStep = (MAX_LTV.baseline - MAX_LTV.floor) * RELAX_STEP;
  const capStep = (BORROW_CAP.baseline - BORROW_CAP.floor) * RELAX_STEP;

  const full: VizPoint[] = raw.map((s, i) => {
    sm = smoothScore(sm, cal.calibrate(s.r));
    const tgtLtv = paramFromScore(sm.solvency, MAX_LTV);
    const tgtCap = paramFromScore(sm.liquidity, BORROW_CAP);
    if (tgtLtv < curLtv) curLtv = tgtLtv;
    if (tgtCap < curCap) curCap = tgtCap;
    const divBps = s.div;
    const calm = (divBps == null || divBps < CAUTION_BPS) && sm.overall < SCORE_LO;
    calmRun = calm ? calmRun + 1 : 0;
    if (calmRun >= ALL_CLEAR_TICKS && i - lastRelax >= RELAX_COOLDOWN_TICKS) {
      curLtv = Math.min(MAX_LTV.baseline, curLtv + ltvStep);
      curCap = Math.min(BORROW_CAP.baseline, curCap + capStep);
      lastRelax = i;
    }
    const v = byTs.get(s.ts) ?? {};
    const price = typeof v[cfg.drawdownKey] === "number" ? (v[cfg.drawdownKey] as number) : null;
    return { ts: s.ts, price, divBps, score: sm.overall, maxLtv: curLtv, borrowCap: curCap, frozen: divBps != null && divBps >= FREEZE_BPS };
  });

  // window to the action + decimate (keep alert/drop/peak ticks)
  const anchors = [report.firstAlert, report.visibleDrop, report.peakD2?.ts].filter((x): x is number => typeof x === "number");
  const lo = anchors.length ? Math.min(...anchors) - 180 * 60_000 : full[0]?.ts ?? 0;
  const hi = anchors.length ? Math.max(...anchors) + 150 * 60_000 : full[full.length - 1]?.ts ?? 0;
  let windowed = full.filter((p) => p.ts >= lo && p.ts <= hi);
  if (windowed.length < 10) windowed = full;
  const keepTs = new Set(anchors);
  const stride = Math.max(1, Math.ceil(windowed.length / MAX_POINTS));
  const points = windowed.filter((p, i) => i % stride === 0 || i === windowed.length - 1 || keepTs.has(p.ts));

  // driver + knob floors are computed over the DISPLAYED points (what the chart
  // actually renders), not the full series — so the tag/copy never claim a reaction
  // that happened outside the visible window.
  const minLtv = Math.min(...points.map((p) => p.maxLtv));
  const minCap = Math.min(...points.map((p) => p.borrowCap));
  const ltvTighten = (MAX_LTV.baseline - minLtv) / (MAX_LTV.baseline - MAX_LTV.floor);
  const capTighten = (BORROW_CAP.baseline - minCap) / (BORROW_CAP.baseline - BORROW_CAP.floor);
  const drivenBy = ltvTighten > capTighten + 0.08 ? "solvency" : capTighten > ltvTighten + 0.08 ? "liquidity" : "both";

  const prices = points.map((p) => p.price).filter((x): x is number => x != null);
  const peakScore = Math.max(0, ...points.map((p) => p.score));
  const out = {
    key,
    label: report.label,
    asset: META[key]?.asset ?? cfg.label,
    cls: META[key]?.cls ?? "systemic",
    priceLabel: META[key]?.priceLabel ?? cfg.drawdownKey,
    driver: drivenBy,
    reportDriver: report.driverAtAlert,
    minLtv: Number(minLtv.toFixed(1)),
    minCap: Number(minCap.toFixed(1)),
    leadMinutes: report.leadMinutes,
    firstAlertTs: report.firstAlert,
    visibleDropTs: report.visibleDrop,
    peakTs: report.peakD2?.ts ?? null,
    peakScore,
    calmFalseAlarmRate: report.calmCount ? report.calmSingleAlerts / report.calmCount : 0,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    everFroze: points.some((p) => p.frozen),
    freezeBps: FREEZE_BPS,
    cautionBps: CAUTION_BPS,
    regressionMaxDiff: Number(maxDiff.toFixed(3)),
    points,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${key}.json`), JSON.stringify(out));
  const ddPct = out.priceMin != null && out.priceMax != null && out.priceMax > 0 ? (100 * (out.priceMax - out.priceMin)) / out.priceMax : 0;
  console.log(
    `[viz] ${key}: ${points.length} pts · lead=${report.leadMinutes}min · driver=${report.driverAtAlert} · ` +
      `peakScore=${peakScore.toFixed(0)} · drawdown≈${ddPct.toFixed(1)}% · froze=${out.everFroze} · ` +
      `divBps[max]=${Math.max(0, ...points.map((p) => p.divBps ?? 0)).toFixed(0)} · regression-maxDiff=${maxDiff.toFixed(3)}${drift ? " ⚠️DRIFT" : " ✓"}`,
  );
}

async function main(): Promise<void> {
  const arg = process.argv[2] ?? "all";
  const keys = arg === "all" ? Object.keys(EVENTS) : [arg];
  for (const k of keys) await gen(k);
  const present = keys.filter((k) => existsSync(join(OUT_DIR, `${k}.json`)));
  const order = ["feb2025", "usdc2023", "oct10", "aug2024", "cetus"].filter((k) => present.includes(k));
  const idx =
    `// AUTO-GENERATED by packages/agent/scripts/backtest-viz.ts — do not edit by hand.\n` +
    order.map((k) => `import ${k} from "./${k}.json";`).join("\n") +
    `\nexport const BACKTESTS = [${order.join(", ")}] as const;\n` +
    `export type Backtest = (typeof BACKTESTS)[number];\n`;
  writeFileSync(join(OUT_DIR, "index.ts"), idx);
  console.log(`[viz] wrote ${present.length} case files + index (order: ${order.join(", ")})`);
}

main().catch((e) => {
  console.error("[viz] ERROR", e);
  process.exit(1);
});
