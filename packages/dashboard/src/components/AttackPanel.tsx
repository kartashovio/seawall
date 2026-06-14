// Demo control: drives the OFF-CHAIN agent into each of the four demo scenes by
// POSTing a scene descriptor to the agent's control server. The contract-only
// FREEZE (Scene ①) is a SEPARATE, real DeepBook divergence injected on-chain
// (scripts/inject-divergence) — this panel only nudges the agent, it never
// fakes the on-chain breach.
import { useState } from "react";

type Scene = {
  mode: "elevate" | "malicious" | "dead" | "calm";
  override?: { overall: number; solvency: number; liquidity: number };
};

// NB: array order + mode/override payloads are load-bearing (the agent + e2e
// depend on them) — only presentation (num glyph, label, accent) is added.
const SCENES: { num: string; label: string; accent: string; body: Scene }[] = [
  { num: "②", label: "Slow drift → agent CAUTION", accent: "caution", body: { mode: "elevate", override: { overall: 78, solvency: 80, liquidity: 55 } } },
  { num: "①", label: "Fast de-peg → hard tighten", accent: "freeze", body: { mode: "elevate", override: { overall: 99, solvency: 99, liquidity: 70 } } },
  { num: "③", label: "Malicious agent (clamped)", accent: "caution", body: { mode: "malicious" } },
  { num: "④", label: "Dead agent (L1 still holds)", accent: "neutral", body: { mode: "dead" } },
  { num: "↺", label: "Calm (reset)", accent: "calm", body: { mode: "calm" } },
];

export function AttackPanel({ agentUrl }: { agentUrl: string }) {
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string>("");

  const sendScene = (scene: Scene): void => {
    setError("");
    setStatus(`scene → ${scene.mode} …`);
    fetch(`${agentUrl}/control/scene`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      <h2>
        Attack panel <span className="tag">demo control → agent</span>
      </h2>
      <div className="scene-strip">
        {SCENES.map((s) => (
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
        drives the OFF-CHAIN agent. The contract-only FREEZE (Scene ①) is a separate REAL DeepBook divergence — see
        scripts/inject-divergence.
      </div>
    </section>
  );
}
