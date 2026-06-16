// Subscribes to the agent control-server SSE (AgentTickDTO). Keeps the latest
// tick + a bounded history + a connection flag. On mount it also fetches GET
// /history once, so the risk chart can paint up to ~12h of PAST readings instead
// of only what accumulates after the page opens. The agent is the v1 island; we
// talk to it over HTTP only — never import it.
import { useEffect, useRef, useState } from "react";
import type { AgentTickDTO } from "@seawall/shared";
import { CFG } from "./config";

export interface AgentStream {
  latest: AgentTickDTO | null;
  history: AgentTickDTO[];
  connected: boolean;
}

// 760 ≈ 12h at the 60s grid, with margin for scene-change ticks.
export function useAgentStream(maxHistory = 760): AgentStream {
  const [latest, setLatest] = useState<AgentTickDTO | null>(null);
  const [connected, setConnected] = useState(false);
  const histRef = useRef<AgentTickDTO[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const bump = (): void => {
      if (!cancelled) force((n) => n + 1);
    };
    // Merge ticks into history deduped by ts (newer wins on equal ts), sorted,
    // bounded — so the /history seed and the live stream can't double-count and
    // stay ordered regardless of which arrives first.
    const merge = (ticks: AgentTickDTO[]): void => {
      const byTs = new Map<number, AgentTickDTO>();
      for (const x of histRef.current) byTs.set(x.ts, x);
      for (const x of ticks) byTs.set(x.ts, x);
      histRef.current = [...byTs.values()].sort((a, b) => a.ts - b.ts).slice(-maxHistory);
    };

    // Seed past history (best-effort — the live stream works without it).
    fetch(`${CFG.agentUrl}/history`)
      .then((r) => r.json())
      .then((d: { ticks?: AgentTickDTO[] }) => {
        if (cancelled || !Array.isArray(d.ticks)) return;
        merge(d.ticks);
        bump();
      })
      .catch(() => {
        /* no history endpoint / offline → chart just grows from live ticks */
      });

    const es = new EventSource(`${CFG.agentUrl}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const t = JSON.parse(e.data) as AgentTickDTO;
        merge([t]);
        setLatest(t);
        bump();
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => {
      cancelled = true;
      es.close();
    };
  }, [maxHistory]);

  return { latest, history: histRef.current, connected };
}
