import { randomInt } from "node:crypto";
import { pathToFileURL } from "node:url";
import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PrivateRoom, setRoomDisposedCallback } from "./PrivateRoom.mjs";

const PORT = Number(process.env.PORT || 2567);
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomsByCode = new Map();
const createRequests = new Map();
const lookupRequests = new Map();

function makeCode() {
  let code = "";
  for (let index = 0; index < 6; index++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function rateLimited(request, requestsByIp, limit) {
  const ip = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (requestsByIp.get(ip) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= limit) {
    requestsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestsByIp.set(ip, recent);
  return false;
}

export async function startServer({ port = PORT, allowedOrigins = process.env.ALLOWED_ORIGINS } = {}) {
  const origins = new Set(
    (allowedOrigins || "http://localhost:5173,http://127.0.0.1:5173")
      .split(",").map((origin) => origin.trim()).filter(Boolean),
  );
  const transport = new WebSocketTransport({
    verifyClient: ({ origin }, done) => {
      if (!origin || origins.has(origin)) done(true);
      else done(false, 403, "Origin is not allowed.");
    },
  });
  const gameServer = new Server({
    transport,
    greet: false,
    express(app) {
      app.use((request, response, next) => {
        const origin = request.headers.origin;
        if (origin && !origins.has(origin)) {
          return response.status(403).json({ error: "Origin is not allowed." });
        }
        response.setHeader("Access-Control-Allow-Origin", origin || "null");
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setHeader("Access-Control-Max-Age", "600");
        response.setHeader("Vary", "Origin");
        if (request.method === "OPTIONS") return response.sendStatus(204);
        next();
      });

      app.get("/healthz", (_request, response) => response.json({ status: "ok" }));

      app.post("/api/rooms", async (request, response) => {
        if (rateLimited(request, createRequests, 8)) {
          return response.status(429).json({ error: "Too many rooms created. Try again in a minute." });
        }
        try {
          let code = makeCode();
          while (roomsByCode.has(code)) code = makeCode();
          const room = await matchMaker.createRoom("private", {});
          roomsByCode.set(code, { roomId: room.roomId, expiresAt: Date.now() + ROOM_TTL_MS });
          return response.status(201).json({ code, roomId: room.roomId });
        } catch (error) {
          console.error("Room creation failed:", error);
          return response.status(500).json({ error: "The room could not be created." });
        }
      });

      app.get("/api/rooms/:code", (request, response) => {
        if (rateLimited(request, lookupRequests, 30)) {
          return response.status(429).json({ error: "Too many invite-code lookups. Try again in a minute." });
        }
        const code = String(request.params.code).toUpperCase();
        if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
          return response.status(404).json({ error: "Invite code not found or expired." });
        }
        const room = roomsByCode.get(code);
        if (!room || room.expiresAt <= Date.now()) {
          roomsByCode.delete(code);
          return response.status(404).json({ error: "Invite code not found or expired." });
        }
        return response.json({ roomId: room.roomId });
      });
    },
  });
  gameServer.define("private", PrivateRoom);

  setRoomDisposedCallback((roomId) => {
    for (const [code, room] of roomsByCode) {
      if (room.roomId === roomId) roomsByCode.delete(code);
    }
  });

  await gameServer.listen(port, "0.0.0.0");
  const address = transport.server?.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    port: actualPort,
    async close() {
      await gameServer.gracefullyShutdown(false);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().then(({ port }) => {
    console.log(`Private room server listening on port ${port}`);
  }).catch((error) => {
    console.error("Could not start private room server:", error);
    process.exitCode = 1;
  });
}
