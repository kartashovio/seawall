// Subscribes to the agent control-server SSE (AgentTickDTO). Keeps the latest
// tick + a bounded history (for sparklines) + a connection flag. The agent is
// the v1 island; we talk to it over HTTP only — never import it.
import { useEffect, useRef, useState } from "react";
import type { AgentTickDTO } from "@seawall/shared";
import { CFG } from "./config";

export interface AgentStream {
  latest: AgentTickDTO | null;
  history: AgentTickDTO[];
  connected: boolean;
}

export function useAgentStream(maxHistory = 120): AgentStream {
  const [latest, setLatest] = useState<AgentTickDTO | null>(null);
  const [connected, setConnected] = useState(false);
  const histRef = useRef<AgentTickDTO[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    const es = new EventSource(`${CFG.agentUrl}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const t = JSON.parse(e.data) as AgentTickDTO;
        histRef.current = [...histRef.current, t].slice(-maxHistory);
        setLatest(t);
        force((n) => n + 1);
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => es.close();
  }, [maxHistory]);

  return { latest, history: histRef.current, connected };
}
