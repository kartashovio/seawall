// Band H — the closing ledger: honest scope, the deployed testnet ids (explorer-
// linked), and the color legend. Reads ids straight from CFG (config/testnet.json).
import { CFG } from "../config";

const short = (id?: string): string => (id ? `${id.slice(0, 8)}…${id.slice(-4)}` : "—");

export function FooterLedger() {
  const objUrl = (id?: string): string => `${CFG.explorerObj}/${id ?? ""}`;
  return (
    <footer className="ledger band">
      <div>
        <h3>Deployed · testnet</h3>
        <div className="row">
          <span className="lbl">package</span>
          <a className="mono" href={objUrl(CFG.packageId)} target="_blank" rel="noreferrer">
            {short(CFG.packageId)}
          </a>
        </div>
        <div className="row">
          <span className="lbl">GuardianPolicy</span>
          <a className="mono" href={objUrl(CFG.policyId)} target="_blank" rel="noreferrer">
            {short(CFG.policyId)}
          </a>
        </div>
        {CFG.vaultId && (
          <div className="row">
            <span className="lbl">demo vault (consumer)</span>
            <a className="mono" href={objUrl(CFG.vaultId)} target="_blank" rel="noreferrer">
              {short(CFG.vaultId)}
            </a>
          </div>
        )}
        <div className="row">
          <span className="lbl">network</span>
          <span className="mono">testnet</span>
        </div>
      </div>
      <div>
        <h3>Legend</h3>
        <div className="legend">
          <div className="li">
            <span className="sw sw-cyan" />
            Cyan — the contract &amp; calm seas
          </div>
          <div className="li">
            <span className="sw sw-amber" />
            Amber — the agent (untrusted)
          </div>
          <div className="li">
            <span className="sw sw-coral" />
            Coral — breach / contract freeze
          </div>
          <div className="li">
            <span className="sw sw-emerald" />
            Emerald — live / enforced / healthy
          </div>
          <div className="li">
            <span className="sw sw-dao" />
            Blue — DAO governance
          </div>
        </div>
      </div>

      {/* honest scope — slimmed to one quiet fine-print line: the scope class + the
          named prior-art credit (the only two bits not stated in-context elsewhere on
          the dashboard; the demo concessions live in the freeze + DAO bands). */}
      <p className="ledger-scope">
        Scope: the <b>oracle / price-anomaly class</b> only — not key, governance, logic-bug, or credit risk. The
        estimator is named prior art (Mahalanobis = Kritzman-Li turbulence · EWMA covariance = RiskMetrics); the novelty
        is the application and the trust-minimized on-chain enforcement.
      </p>

      {/* credit strip — the page's closing line, a quiet full-width rule below the
          ledger columns (grid-column: 1 / -1). All type sits at the --fs-xs floor,
          neutral chrome (no meaning-color) — a credit, not a feature. */}
      <div className="credit">
        <span className="credit-lead">Team</span>
        <ul className="credit-people">
          <li className="who">
            <img className="face" src="/team/timur.jpg" width={30} height={30} alt="Timur Kartashov" loading="lazy" decoding="async" />
            <div className="who-body">
              <span className="who-top">
                <a className="who-name" href="https://github.com/kartashovio" target="_blank" rel="noreferrer">
                  Timur Kartashov
                </a>
                <span className="who-loc">Kazakhstan</span>
              </span>
              <span className="role">architecture · implementation · tests</span>
              <span className="who-links">
                <a href="https://github.com/kartashovio" target="_blank" rel="noreferrer">GitHub</a>
                {" · "}
                <a href="https://x.com/kartashovio" target="_blank" rel="noreferrer">X</a>
                {" · "}
                <a href="mailto:tkartashov.io@gmail.com">email</a>
                {" · "}
                <a href="https://www.deepsurge.xyz/profiles/bfef510f-dac2-44d2-96fb-5458ea718e99" target="_blank" rel="noreferrer">
                  DeepSurge
                </a>
              </span>
            </div>
          </li>
          <li className="who">
            <img className="face" src="/team/birzhan.jpg" width={30} height={30} alt="Birzhan Iglik" loading="lazy" decoding="async" />
            <div className="who-body">
              <span className="who-top">
                <a className="who-name" href="https://www.deepsurge.xyz/profiles/cca743e4-2322-4632-bfd9-ff0e67563a98" target="_blank" rel="noreferrer">
                  Birzhan Iglik
                </a>
                <span className="who-loc">VIP Kazakh</span>
              </span>
              <span className="role">architecture · tests · ML-engineer</span>
              <span className="who-links">
                <a href="https://www.deepsurge.xyz/profiles/cca743e4-2322-4632-bfd9-ff0e67563a98" target="_blank" rel="noreferrer">
                  DeepSurge
                </a>
              </span>
            </div>
          </li>
        </ul>
      </div>
    </footer>
  );
}
