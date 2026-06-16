// One stress-test block: header (what + the headline REACTION stat), the dual-panel
// chart, the numbered real-news legend (maps to the chart flags), an honest one-line
// detection note (the lead, framed for what it is), then market/guardian/read prose.
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
const NEWS_KIND: Record<string, string> = { trigger: "trigger", escalation: "escalation", reversal: "reversal" };

const pad2 = (x: number) => String(x).padStart(2, "0");
const utc = (ts: number) => {
  const d = new Date(ts);
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${mon} ${d.getUTCDate()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`;
};
// strip the trailing "(… market)" proxy note from the report label — it reads like a
// trading pair and confused viewers; the asset + proxy are stated explicitly below.
const cleanTitle = (label: string) => label.replace(/\s*\([^)]*market\)\s*$/i, "").trim();

export function BacktestCase({ data }: { data: BacktestData }) {
  const copy = COPY[data.key];
  const dd =
    data.priceMin != null && data.priceMax != null && data.priceMax > 0 ? (100 * (data.priceMax - data.priceMin)) / data.priceMax : null;
  const driverTag = data.driver === "both" ? "both knobs" : data.driver ? `${data.driver}-driven` : null;

  // Headline stat = the REAL reaction (not the faint detection lead): a freeze, or
  // which knob the ratchet drove, derived from the displayed data.
  const reaction = data.everFroze
    ? "contract FROZE"
    : data.driver === "solvency"
      ? `max LTV → ${data.minLtv.toFixed(0)}%`
      : data.driver === "liquidity"
        ? `borrow cap → ${data.minCap.toFixed(0)}%`
        : "both knobs tightened";

  return (
    <article className="bt-case">
      <header className="bt-case-head">
        <div className="bt-case-title">
          <h3>{cleanTitle(data.label)}</h3>
          <div className="bt-tags">
            <span className={`tag bt-cls bt-cls--${data.cls}`}>{CLS_LABEL[data.cls] ?? data.cls}</span>
            {driverTag && <span className="tag bt-drv">{driverTag}</span>}
            {data.everFroze && <span className="tag bt-froze">contract FROZE</span>}
          </div>
        </div>
        <div className="bt-stats">
          <div className={`bt-stat ${data.everFroze ? "is-freeze" : ""}`}>
            <span className="bt-stat-v">{reaction}</span>
            <span className="bt-stat-k">guardian reaction</span>
          </div>
          <div className="bt-stat">
            <span className="bt-stat-v">{dd != null ? `−${dd.toFixed(0)}%` : "—"}</span>
            <span className="bt-stat-k">{data.asset} drawdown</span>
          </div>
          <div className="bt-stat">
            <span className="bt-stat-v">{data.peakScore.toFixed(0)}</span>
            <span className="bt-stat-k">peak score</span>
          </div>
        </div>
      </header>

      <BacktestChart c={data} />

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
        <div className="bt-read-row">
          <span className="bt-read-k">The market</span>
          <p>{copy?.market}</p>
        </div>
        <div className="bt-read-row">
          <span className="bt-read-k">The guardian</span>
          <p>{copy?.guardian}</p>
        </div>
        <div className="bt-read-row bt-read-row--accent">
          <span className="bt-read-k">How to read it</span>
          <p>{copy?.read}</p>
        </div>
        {copy?.caveat && (
          <div className="bt-read-row bt-read-row--caveat">
            <span className="bt-read-k">Honest limit</span>
            <p>{copy.caveat}</p>
          </div>
        )}
      </div>

      <p className="bt-foot">
        Price = <b>{data.asset}/USD</b> (dark line). BTC is a market-context input, not a pair — its volatility tells a systemic crash
        (asset falls with BTC → borrow cap) from an idiosyncratic one (asset alone → max LTV). All times UTC.
      </p>
    </article>
  );
}
