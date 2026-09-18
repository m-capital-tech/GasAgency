import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { DemoEngine, handle, type Method } from "@gassetu/engine";
import type { LiveEvent } from "@gassetu/shared";

const PORT = Number(process.env.PORT ?? 4000);
const engine = new DemoEngine();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req, res) => {
  const url = new URL(req.url, "http://x");
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));
  const auth = req.header("authorization");
  const userId = auth?.startsWith("Bearer tok_") ? auth.slice("Bearer tok_".length) : undefined;
  const out = handle(engine, { method: req.method as Method, path: url.pathname, query, body: req.body ?? {}, userId });
  res.status(out.status).json(out.body);
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/live" });

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", ts: Date.now() }));
  ws.on("message", (raw) => {
    // clients may send {type:"ping"}
    try {
      const msg = JSON.parse(String(raw));
      if (msg?.type === "ping") ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
    } catch {
      /* ignore */
    }
  });
});

engine.on((event: LiveEvent) => {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
});

server.listen(PORT, () => {
  console.log(`\n  GasSetu mock API  →  http://localhost:${PORT}\n  Live events       →  ws://localhost:${PORT}/live\n  Seed: ${engine.state.bookings.length} bookings, ${engine.state.businesses.length} businesses, ${engine.state.agencies.length} agencies\n`);
});
