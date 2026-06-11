import { LAMBDA_MEAN, LAMBDA_COV } from "@seawall/shared";

// Exponentially-weighted running mean and covariance (RiskMetrics style).
// The covariance is updated against the PRE-update mean so there is no
// look-ahead: at tick t it only uses information through t.
export class Ewma {
  readonly k: number;
  private readonly lm: number;
  private readonly lc: number;
  mean: number[];
  cov: number[][];
  count = 0;

  constructor(k: number, lambdaMean = LAMBDA_MEAN, lambdaCov = LAMBDA_COV) {
    this.k = k;
    this.lm = lambdaMean;
    this.lc = lambdaCov;
    this.mean = new Array(k).fill(0);
    // start from the identity so the first distances are well-defined
    this.cov = Array.from({ length: k }, (_, i) =>
      Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)),
    );
  }

  update(x: number[]): void {
    if (x.length !== this.k) throw new Error(`expected ${this.k} features, got ${x.length}`);
    if (this.count === 0) {
      this.mean = x.slice();
      this.count = 1;
      return;
    }
    const delta = x.map((v, i) => v - this.mean[i]); // pre-update mean
    for (let i = 0; i < this.k; i++) {
      for (let j = 0; j < this.k; j++) {
        this.cov[i][j] = this.lc * this.cov[i][j] + (1 - this.lc) * delta[i] * delta[j];
      }
    }
    for (let i = 0; i < this.k; i++) {
      this.mean[i] = this.lm * this.mean[i] + (1 - this.lm) * x[i];
    }
    this.count++;
  }
}
