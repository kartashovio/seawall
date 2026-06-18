// One stress-test case, now COLLAPSIBLE: a <details> whose <summary> is the scan row
// (title + class/driver tags + the headline guardian-reaction chip + asset drawdown),
// and whose body holds the dual-panel chart, the inline legend, the numbered news, the
// detection lead, and the market/guardian/read prose. One case (oct10) opens by default
// so the expanded shape is visible; the rest collapse so the page scrolls easily.
// DISPLAY-ONLY — every number is an existing computed/stored value.
import { BacktestChart, type BtCase, type BtNews } from "./BacktestChart";
import { COPY } from "./backtest-copy";

export interface BacktestData extends BtCase {
  label: string;
  asset: string;
  cls: "systemic" | "idiosyncratic" | "depeg";
  driver: string | null;
  minLtv: number;
  minCap: number;
  peakScore: number;
  priceMin: number | null;
  priceMax: number | null;
  everFroze: boolean;
  calmFalseAlarmRate: number;
  newsEvents?: BtNews[];
}

const CLS_LABEL: Record<string, string> = {
  systemic: "systemic",
  idiosyncratic: "idiosyncratic",
  depeg: "stablecoin depeg",
};

// feb2025 floors BOTH knobs, but its takeaway is the solvency-LED onset (max LTV
// floors first while borrow cap holds at baseline) — so the collapsed chip names
// the onset instead of "both", to match the case prose. Display-only, keyed by case.
const CHIP_OVERRIDE: Record<string, string> = { feb2025: "solvency-led · max LTV → 55%" };

const pad2 = (x: number) => String(x).padStart(2, "0");
const utc = (ts: number) => {
  const d = new Date(ts);
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${mon} ${d.getUTCDate()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`;
};
// strip the trailing "(… market)" proxy note from the report label — it reads like a
// trading pair and confused viewers; the asset + proxy are stated explicitly below.
const cleanTitle = (label: string) => label.replace(/\s*\([^)]*market\)\s*$/i, "").trim();

// The 7-swatch chart legend — only meaningful beside an open chart, so it lives INSIDE
// each case body (it used to sit once at the top of the gallery, far from the charts).
function BtLegend() {
  return (
    <div className="bt-legend bt-legend--inline">
      <span className="bt-leg"><span className="bt-leg-line bt-leg-score" /> AI risk score</span>
      <span className="bt-leg"><span className="bt-leg-line bt-leg-ltv" /> max LTV</span>
      <span className="bt-leg"><span className="bt-leg-line bt-leg-cap" /> borrow cap</span>
      <span className="bt-leg"><span className="bt-leg-line bt-leg-div" /> divergence</span>
      <span className="bt-leg"><span className="bt-leg-line bt-leg-price" /> price</span>
      <span className="bt-leg"><span className="bt-leg-mark bt-leg-agent" /> agent → CAUTION</span>
      <span className="bt-leg"><span className="bt-leg-sw bt-leg-freeze" /> contract FROZEN (red until DAO)</span>
    </div>
  );
}

export function BacktestCase({ data, defaultOpen = false }: { data: BacktestData; defaultOpen?: boolean }) {
  const copy = COPY[data.key];
  const dd =
    data.priceMin != null && data.priceMax != null && data.priceMax > 0 ? (100 * (data.priceMax - data.priceMin)) / data.priceMax : null;
  const driverTag = data.driver === "both" ? "both knobs" : data.driver ? `${data.driver}-driven` : null;

  // Headline stat = the REAL reaction: a freeze, or which knob the ratchet drove,
  // derived from the displayed data (with the feb2025 solvency-onset override above).
  const reaction =
    CHIP_OVERRIDE[data.key] ??
    (data.everFroze
      ? "contract FROZE"
      : data.driver === "solvency"
        ? `max LTV → ${data.minLtv.toFixed(0)}%`
        : data.driver === "liquidity"
          ? `borrow cap → ${data.minCap.toFixed(0)}%`
          : "both knobs tightened");

  // ONE rationed accent per card, shared by the left border AND the reaction chip:
  // coral = the contract FROZE · amber = an agent-originated CAUTION tighten. Both
  // knobs are clamped agent requests, so every non-freeze case is amber (never cyan,
  // which would imply the contract originated it); the chip TEXT + driver tag carry
  // the solvency-vs-liquidity distinction.
  const tone = data.everFroze ? "freeze" : "caution";

  return (
    <details className={`bt-case bt-case--${tone}`} open={defaultOpen}>
      <summary className="bt-case-sum">
        <span className="bt-sum-marker" aria-hidden="true">+</span>
        <span className="bt-sum-main">
          <span className="bt-sum-title">{cleanTitle(data.label)}</span>
          <span className="bt-sum-tags">
            <span className={`tag bt-cls bt-cls--${data.cls}`}>{CLS_LABEL[data.cls] ?? data.cls}</span>
            {driverTag && <span className="tag bt-drv">{driverTag}</span>}
          </span>
        </span>
        <span className="bt-sum-stats">
          <span className={`bt-sum-react bt-sum-react--${tone}`}>{reaction}</span>
          <span className="bt-sum-dd">
            {dd != null ? `−${dd.toFixed(0)}%` : "—"} <i>{data.asset}</i>
          </span>
        </span>
      </summary>

      <div className="bt-case-body">
        <BacktestChart c={data} />
        <BtLegend />

        {!!data.newsEvents?.length && (
          <div className="bt-news">
            {data.newsEvents.map((nv, i) => (
              <span key={i} className={`bt-news-item bt-news--${nv.kind}`}>
                <span className="bt-news-num">{i + 1}</span>
                <span className="bt-news-lbl">{nv.label}</span>
                <span className="bt-news-ts">{utc(nv.ts)}{nv.confidence !== "high" ? ` · ~${nv.confidence}` : ""}</span>
              </span>
            ))}
          </div>
        )}

        {copy?.detection && <p className="bt-detect">{copy.detection}</p>}

        <div className="bt-read">
          <div className="bt-read-pair">
            <div className="bt-read-cell">
              <span className="bt-read-k">The market</span>
              <p>{copy?.market}</p>
            </div>
            <div className="bt-read-cell bt-read-cell--guard">
              <span className="bt-read-k">The guardian</span>
              <p>{copy?.guardian}</p>
            </div>
          </div>
          <div className="bt-read-take">
            <span className="bt-read-k">How to read it</span>
            <p>{copy?.read}</p>
          </div>
          {copy?.caveat && (
            <details className="bt-read-limit">
              <summary>
                <span className="bt-read-k">Honest limit</span>
              </summary>
              <p>{copy.caveat}</p>
            </details>
          )}
        </div>
      </div>
    </details>
  );
}
