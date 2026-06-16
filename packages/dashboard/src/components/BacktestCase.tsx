// One stress-test block: a self-contained header (what + the headline stats), the
// dual-panel chart, and three plain-English readouts (market / guardian / how to
// read it) + an honest caveat where one applies. Built so a viewer can understand
// the block on its own without scrolling back to a legend.
import { BacktestChart, type BtCase, type BtPoint } from "./BacktestChart";
import { COPY } from "./backtest-copy";

export interface BacktestData extends BtCase {
  label: string;
  asset: string;
  cls: "systemic" | "idiosyncratic" | "depeg";
  driver: string | null;
  peakScore: number;
  priceMin: number | null;
  priceMax: number | null;
  everFroze: boolean;
  calmFalseAlarmRate: number;
}

const CLS_LABEL: Record<string, string> = {
  systemic: "systemic",
  idiosyncratic: "idiosyncratic",
  depeg: "stablecoin depeg",
};

export function BacktestCase({ data }: { data: BacktestData }) {
  const copy = COPY[data.key];
  const lead = data.leadMinutes;
  const early = lead != null && lead > 20;
  const leadText = lead == null ? "—" : early ? `+${lead} min early` : `coincident (${lead >= 0 ? "+" : ""}${lead}m)`;
  const dd =
    data.priceMin != null && data.priceMax != null && data.priceMax > 0
      ? (100 * (data.priceMax - data.priceMin)) / data.priceMax
      : null;

  return (
    <article className="bt-case">
      <header className="bt-case-head">
        <div className="bt-case-title">
          <h3>{data.label}</h3>
          <div className="bt-tags">
            <span className={`tag bt-cls bt-cls--${data.cls}`}>{CLS_LABEL[data.cls] ?? data.cls}</span>
            {data.driver && <span className="tag bt-drv">{data.driver === "both" ? "both knobs" : `${data.driver}-driven`}</span>}
            {data.everFroze && <span className="tag bt-froze">contract FROZE</span>}
          </div>
        </div>
        <div className="bt-stats">
          <div className={`bt-stat ${early ? "is-early" : ""}`}>
            <span className="bt-stat-v">{leadText}</span>
            <span className="bt-stat-k">warning lead</span>
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
    </article>
  );
}
