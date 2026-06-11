// Label-free backtest metrics: when did the detector first fire, and how does
// that line up with the visible crash.

export interface Scored {
  ts: number;
  score: number;
}

// First tick at/after fromTs whose score >= tau and stays >= tau for n ticks.
export function firstSustainedAlert(
  series: Scored[],
  tau: number,
  n: number,
  fromTs = 0,
): number | null {
  for (let i = 0; i < series.length; i++) {
    if (series[i].ts < fromTs || series[i].score < tau) continue;
    let ok = true;
    for (let j = 0; j < n && i + j < series.length; j++) {
      if (series[i + j].score < tau) {
        ok = false;
        break;
      }
    }
    if (ok) return series[i].ts;
  }
  return null;
}

// First ts (>= fromTs) where price fell by >= dropFrac over the trailing window.
export function drawdownOnset(
  prices: { ts: number; value: number }[],
  dropFrac: number,
  windowMs: number,
  fromTs = 0,
): number | null {
  for (let i = 0; i < prices.length; i++) {
    if (prices[i].ts < fromTs) continue;
    let j = i;
    while (j > 0 && prices[i].ts - prices[j].ts < windowMs) j--;
    if (prices[i].value / prices[j].value - 1 <= -dropFrac) return prices[i].ts;
  }
  return null;
}

export function peak(series: Scored[]): { ts: number; score: number } {
  return series.reduce(
    (m, x) => (x.score > m.score ? { ts: x.ts, score: x.score } : m),
    { ts: 0, score: -1 },
  );
}
