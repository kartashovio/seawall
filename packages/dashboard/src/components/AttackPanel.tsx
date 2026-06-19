// Demo control: drives the OFF-CHAIN agent into each demo scene by POSTing a scene
// descriptor to the agent's control server. The contract-only FREEZE is a SEPARATE,
// real DeepBook divergence (scripts/demo-freeze.ts) — this panel only nudges the
// agent, it never fakes the on-chain breach.
import { useState } from "react";

type Scene = {
  mode: "elevate" | "malicious" | "dead" | "calm";
  override?: { overall: number; solvency: number; liquidity: number };
};

// NB: array order + mode/override payloads are load-bearing (the agent + e2e
// depend on them) — only presentation (num glyph, label, accent) is added.
const SCENES: { num: string; label: string; accent: string; body: Scene }[] = [
  { num: "②", label: "Slow drift → agent CAUTION", accent: "caution", body: { mode: "elevate", override: { overall: 78, solvency: 80, liquidity: 55 } } },
  { num: "①", label: "Fast de-peg → agent hard tighten", accent: "caution", body: { mode: "elevate", override: { overall: 99, solvency: 99, liquidity: 70 } } },
  { num: "③", label: "Malicious agent (clamped)", accent: "caution", body: { mode: "malicious" } },
  { num: "④", label: "Dead agent (L1 still holds)", accent: "neutral", body: { mode: "dead" } },
  { num: "↺", label: "Calm (reset)", accent: "calm", body: { mode: "calm" } },
];

export function AttackPanel({ agentUrl, operatorToken }: { agentUrl: string; operatorToken?: string }) {
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string>("");

  const sendScene = (scene: Scene): void => {
    setError("");
    setStatus(`scene → ${scene.mode} …`);
    fetch(`${agentUrl}/control/scene`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // /control/scene fails CLOSED (401) without the operator Bearer — passed in
        // via the ?demo=<token> gate so only the operator can drive a scene.
        ...(operatorToken ? { Authorization: `Bearer ${operatorToken}` } : {}),
      },
      body: JSON.stringify(scene),
    })
      .then((res) => setStatus(`scene → ${scene.mode} (${res.status})`))
      .catch((e: unknown) => {
        setStatus(`scene → ${scene.mode} (failed)`);
        setError(e instanceof Error ? e.message : String(e));
      });
  };

  return (
    <section className="card attack">
      <div className="scene-strip">
        {[...SCENES].sort((a, b) => "①②③④↺".indexOf(a.num) - "①②③④↺".indexOf(b.num)).map((s) => (
          <button key={s.label} className={`btn btn-scene scene--${s.accent}`} onClick={() => sendScene(s.body)}>
            <span className="scene-num">{s.num}</span>
            <span className="scene-label">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="muted-sm">{status}</div>
      {error && (
        <div className="muted-sm mono" style={{ color: "var(--red)" }}>
          {error}
        </div>
      )}
      <div className="muted-sm">
        Scene 3 turns the agent malicious; the contract clamps it to the safe direction. This panel drives the
        OFF-CHAIN agent only — it never fakes an on-chain breach. The contract-only FREEZE is a separate, real DeepBook
        divergence, recorded in “The contract froze itself” above.
      </div>
    </section>
  );
}
