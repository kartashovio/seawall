// Tiny HTTP control plane for the dashboard (Step 6), no framework:
//   GET  /stream         — SSE of AgentTick (live gauge + action feed)
//   GET  /feed-id        — the beta feed id the agent/contract read (reject mainnet)
//   POST /control/scene  — set the demo scene { mode, override? } + tick now
//   GET  /healthz        — liveness
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { AgentTick, Scene } from "./loop";

// Defense-in-depth secret for the MUTATING route. The primary gate is at Caddy
// (operator-only bearer on /agent/control/*), but the agent ALSO enforces it so a
// Caddy misconfig / direct localhost hit can't drive the agent. Token is read from
// the env (set via /etc/seawall/agent.env, perms 600) — NEVER baked into the SPA.
const CONTROL_TOKEN = process.env.CONTROL_TOKEN ?? "";
const MAX_BODY_BYTES = 4096; // scene POSTs are tiny; cap to avoid a memory-pin DoS.

function authorized(req: IncomingMessage): boolean {
  // If no token is configured, fail CLOSED (refuse all mutating POSTs) — never
  // fail open. The operator MUST set CONTROL_TOKEN for scenes to work.
  if (!CONTROL_TOKEN) return false;
  const hdr = req.headers["authorization"];
  if (typeof hdr !== "string" || !hdr.startsWith("Bearer ")) return false;
  const got = Buffer.from(hdr.slice(7));
  const want = Buffer.from(CONTROL_TOKEN);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

export interface ControlOpts {
  port: number;
  feedId: string;
  setScene: (s: Scene) => void;
  runTick: () => Promise<AgentTick | null>; // run one tick now (used on scene change)
}

export interface ControlServer {
  broadcast: (t: AgentTick) => void;
  close: () => void;
  clientCount: () => number;
}

export function startControlServer(opts: ControlOpts): ControlServer {
  const clients = new Set<ServerResponse>();

  const send = (res: ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(body));
  };

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? "/").split("?")[0];
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    if (url === "/healthz") return send(res, 200, { ok: true });
    if (url === "/feed-id") return send(res, 200, { feedId: opts.feedId });

    if (url === "/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        // Disable proxy (nginx/Caddy) response buffering so each SSE frame flushes.
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(": connected\n\n");
      clients.add(res);
      // Heartbeat: calm steady-state emits one data frame per 60s; Cloudflare idle-
      // times out a silent connection (~100s) → the live gauge drops. A ~20s comment
      // ping keeps the connection (and the "agent live" dot) alive between ticks.
      const ping = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          /* socket gone; close handler cleans up */
        }
      }, 20_000);
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }

    if (url === "/control/scene" && req.method === "POST") {
      // MUTATING + can submit a real on-chain PTB → require the operator bearer.
      if (!authorized(req)) return send(res, 401, { error: "unauthorized" });
      let body = "";
      let aborted = false;
      req.on("data", (c) => {
        body += c;
        if (body.length > MAX_BODY_BYTES && !aborted) {
          aborted = true;
          send(res, 413, { error: "body too large" });
          req.destroy();
        }
      });
      req.on("end", async () => {
        if (aborted) return;
        try {
          const scene = JSON.parse(body || "{}") as Scene;
          if (!["calm", "elevate", "malicious", "dead"].includes(scene.mode)) {
            return send(res, 400, { error: "bad mode" });
          }
          opts.setScene(scene);
          const tick = await opts.runTick(); // react immediately (don't wait for the 60s grid)
          if (tick) broadcast(tick);
          send(res, 200, { ok: true, scene, tick });
        } catch (e) {
          send(res, 400, { error: String((e as Error).message) });
        }
      });
      return;
    }
    send(res, 404, { error: "not found" });
  });

  function broadcast(t: AgentTick): void {
    const line = `data: ${JSON.stringify(t)}\n\n`;
    for (const c of clients) c.write(line);
  }

  server.listen(opts.port);
  return { broadcast, close: () => server.close(), clientCount: () => clients.size };
}
