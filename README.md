# The Last Menagerie

A browser-playable co-op rescue on an open, low-poly beach: cross a cut in the sand on a fallen tree, protect a rescued youngling, restore the surveyor's beacon, and reach extraction before the incoming tide. The prototype pairs a Three.js/Rapier game loop with private four-seat Colyseus rooms.

## Run locally

Requires Node.js 20 or newer.

1. Run `npm install`.
2. In one terminal, run `npm run dev:server` to start the room server on port `2567`.
3. In another, run `npm run dev` and open `http://127.0.0.1:5173`.
4. Create a private room, then enter its six-character code in another browser window to join. Rooms accept up to four players.

The room server listens on all interfaces; the browser connects to `127.0.0.1:2567` by default and Vite binds explicitly to IPv4 loopback so the documented `127.0.0.1` URL works consistently on Windows. For same-network play from another device, set `ALLOWED_ORIGINS` on the server to the exact LAN game origin and set `VITE_ROOM_SERVER_URL` on the Vite process to the host machine's LAN address, then start Vite with `npm run dev -- --host 0.0.0.0`. Both clients must use the same reachable game and room-server addresses.

## Play

- **W A S D** or **arrow keys** — move
- **Space** — jump
- **Shift** — sprint
- **E** — recover the tide case, repair the beacon, rescue, or extract
- **Space** — jump onto the fallen tree and walk carefully across the ravine

The objective compass under the mission briefing shows the active task, its compass bearing, and straight-line distance. In online rooms, the crew-status panel tracks role objectives and the shared return to extraction. The scene is an open dusk-lit beach: ocean and a narrow stream outlet on the left, open sand through the center, one high cliff on the right, and a cut ravine crossed by a whole fallen tree with exposed roots and branches. Waves, foam, and the rising tide animate from the ocean side. During beacon repair, the surveyor must remain beside both the mast and the rescued youngling inside the marked safety ring; leaving the ring interrupts the repair. Use **LEAVE ROOM** in the top bar to return to the lobby and join another invite without reloading.

In a two-player room, the first player is the ranger and the second is the stranded surveyor protecting a baby creature. The ranger recovers the surveyor's tide case; the surveyor reaches the beacon, stays with the youngling, and holds **E** for its four-second repair. Leaving the safety ring interrupts the repair; reaching the surveyor before the signal is ready closes the rescue window. Once the beacon is online, both players rendezvous at the flare and either can signal the rescue. Solo practice uses the ranger role with an NPC surveyor. The fallen tree provides the ravine crossing; marked beach logs can be jumped or run around. Everyone must reach the green extraction pad and press **E**. The tide warning begins 28 seconds after the first player joins and reaches high water eight seconds later. If the team misses extraction or a player falls into the ravine, the room fails and restarts everyone after a short pause. The server synchronizes the tide, validates case recovery, beacon repair, rescue and extraction, bounds and speed-checks movement, and enforces room capacity.

## Checks

- `npm test` — starts a real Colyseus room server and checks invite-code lookup, role assignment and role-gated case recovery, interrupted/timed beacon repair, the arrival deadline, disconnect failure, rescue and full-team extraction; pure mission-rule tests cover the tide deadline and extraction radius.
- `npm run build` — TypeScript check and Vite production build.
- `npm audit --audit-level=moderate` — dependency audit.

`shared/RoomClient.mjs` bridges the flat room-seat response in Colyseus 0.18 to the currently published 0.16 browser SDK shape; the integration test exercises room creation and joins through this adapter.

## Deploying private online rooms

The repo includes a portable Node 20 `Dockerfile` for the room service. Deploy it to a host that supports long-lived WebSocket upgrades and a persistent single Node process, and configure `ALLOWED_ORIGINS` to the exact HTTPS origin(s) serving the game. Build the static client with `VITE_ROOM_SERVER_URL` set to the room service's public HTTPS URL; Colyseus negotiates secure WebSockets from that URL. `.env.example` shows the two values. The invite-code registry is in memory, so this MVP server is intentionally single-instance; use a shared presence/driver store before horizontal scaling.

**Hosting boundary:** the repo now has a working, tested invite-code client/server path and a container build recipe, but no public room-server URL is deployed. This environment has no hosting account, domain, or deployment credentials, so cross-internet play must wait for a host to be selected and configured. The local two-browser end-to-end path is implemented and verified.

## 30-day MVP scope

The deadline is **October 27, 2026**. Keep the showcase intentionally small: one readable mission loop, private 2–4 player invite-code co-op, stable movement/rescue synchronization, and a deployable public service. The current visual target is a cohesive stylized low-poly scene rather than hyperrealistic content. Reconnect recovery, accounts, persistent progression, more missions, and horizontal room-server scaling are out of scope for this slice.
