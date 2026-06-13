// Tiny HTTP control plane for the dashboard (Step 6), no framework:
//   GET  /stream         — SSE of AgentTick (live gauge + action feed)
//   GET  /feed-id        — the beta feed id the agent/contract read (reject mainnet)
//   POST /control/scene  — set the demo scene { mode, override? } + tick now
//   GET  /healthz        — liveness
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { AgentTick, Scene } from "./loop";

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
        "Access-Control-Allow-Origin": "*",
      });
      res.write(": connected\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (url === "/control/scene" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
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
