import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer } from "./index.mjs";
import { RoomClient } from "../shared/RoomClient.mjs";

let service;
let baseUrl;

before(async () => {
  service = await startServer({ port: 0 });
  baseUrl = `http://127.0.0.1:${service.port}`;
});

after(async () => {
  await service.close();
});

async function createInvite() {
  const response = await fetch(`${baseUrl}/api/rooms`, { method: "POST" });
  assert.equal(response.status, 201);
  return response.json();
}

function waitForMessage(room, type, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let unsubscribe;
    const timeout = setTimeout(() => {
      unsubscribe?.();
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);
    unsubscribe = room.onMessage(type, (message) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(message);
    });
  });
}

test("private invites use six-character codes and reject unknown codes", async () => {
  const invite = await createInvite();
  assert.match(invite.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const lookup = await fetch(`${baseUrl}/api/rooms/${invite.code}`);
  assert.equal(lookup.status, 200);
  assert.equal((await lookup.json()).roomId, invite.roomId);

  const missing = await fetch(`${baseUrl}/api/rooms/ZZZZZZ`);
  assert.equal(missing.status, 404);
});

test("room API rejects origins not explicitly allowed", async () => {
  const response = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(response.status, 403);
});

test("private room supports four players and rejects a fifth", async () => {
  const invite = await createInvite();
  const client = new RoomClient(baseUrl);
  const players = [];
  try {
    for (let index = 0; index < 4; index++) {
      const room = await client.joinById(invite.roomId, { name: `Ranger ${index}` });
      room.onMessage("players", () => {});
      room.onMessage("mission", () => {});
      players.push(room);
    }
    await assert.rejects(client.joinById(invite.roomId, { name: "Fifth Ranger" }));
  } finally {
    await Promise.all(players.map((room) => room.leave()));
  }
});

test("the surveyor repairs the beacon before rendezvous, then the full team extracts", async () => {
  const invite = await createInvite();
  const client = new RoomClient(baseUrl);
  const first = await client.joinById(invite.roomId, { name: "Scout" });
  first.onMessage("mission", () => {});
  first.onMessage("identity", () => {});
  first.onMessage("players", () => {});
  first.onMessage("move", () => {});
  const second = await client.joinById(invite.roomId, { name: "Medic" });
  second.onMessage("players", () => {});
  second.onMessage("move", () => {});
  second.onMessage("mission", () => {});
  second.onMessage("identity", () => {});
  second.onMessage("move-rejected", () => {});
  second.onMessage("interaction-blocked", () => {});
  try {
    const playersSync = waitForMessage(first, "players");
    first.send("sync");
    const roster = await playersSync;
    assert.equal(roster.length, 2);
    assert.equal(roster.find((player) => player.sessionId === first.sessionId).role, "ranger");
    assert.equal(roster.find((player) => player.sessionId === second.sessionId).role, "surveyor");
    const rangerIdentity = waitForMessage(first, "identity");
    const surveyorIdentity = waitForMessage(second, "identity");
    first.send("sync");
    second.send("sync");
    assert.equal((await rangerIdentity).role, "ranger");
    assert.equal((await surveyorIdentity).role, "surveyor");

    for (let step = 1; step <= 7; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      second.send("move", {
        x: -2.3 + (3.2 + 2.3) * step / 7,
        y: 1.05,
        z: -22 - 3 * step / 7,
      });
    }
    const repairStarted = waitForMessage(second, "mission");
    second.send("activate-beacon");
    const initialRepair = await repairStarted;
    assert.equal(initialRepair.surveyorSignalReady, false);
    assert.ok(initialRepair.surveyorRepairStartedAt > 0);

    const cancelledRepair = waitForMessage(second, "mission");
    for (let step = 1; step <= 4; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      second.send("move", { x: 3.2 + (6.5 - 3.2) * step / 4, y: 1.05, z: -25 });
    }
    const interrupted = await cancelledRepair;
    assert.equal(interrupted.surveyorSignalReady, false);
    assert.equal(interrupted.surveyorRepairStartedAt, 0);

    for (let step = 1; step <= 4; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      second.send("move", {
        x: 6.5 + (3.2 - 6.5) * step / 4,
        y: 1.05,
        z: -25,
      });
    }
    const restartedRepair = waitForMessage(second, "mission");
    second.send("activate-beacon");
    assert.ok((await restartedRepair).surveyorRepairStartedAt > 0);
    const beaconOnline = waitForMessage(second, "mission", 6000);
    assert.equal((await beaconOnline).surveyorSignalReady, true);

    for (let step = 1; step <= 40; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      first.send("move", {
        x: -1.35 + (3.2 + 1.35) * step / 40,
        y: 1.05,
        z: 23 - 38.5 * step / 40,
      });
    }
    const recovered = waitForMessage(first, "mission");
    first.send("recover-case");
    assert.equal((await recovered).phase, "seeking-survivor");

    for (let step = 1; step <= 7; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      second.send("move", {
        x: 3.2 + (-2.3 - 3.2) * step / 7,
        y: 1.05,
        z: -25 + 3 * step / 7,
      });
    }
    for (let step = 1; step <= 8; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      first.send("move", {
        x: 3.2 + (-2.3 - 3.2) * step / 8,
        y: 1.05,
        z: -15.5 + (-22 + 15.5) * step / 8,
      });
    }

    const extractionPhase = waitForMessage(second, "mission");
    first.send("rescue");
    assert.equal((await extractionPhase).phase, "extracting");

    const blocked = waitForMessage(first, "extraction-blocked");
    first.send("extract");
    assert.match((await blocked).message, /marked extraction pad/);

    for (let step = 1; step <= 40; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      const x = -2.3 + 2.3 * step / 40;
      const z = -22 + 46 * step / 40;
      first.send("move", { x, y: 1.05, z });
      second.send("move", { x, y: 1.05, z });
    }

    const finalPlayers = waitForMessage(first, "players");
    first.send("sync");
    const syncedPlayers = await finalPlayers;
    assert.ok(syncedPlayers.every((player) => Math.hypot(player.x, player.z - 24) <= 4));

    const complete = waitForMessage(second, "mission");
    first.send("extract");
    assert.equal((await complete).phase, "complete");
  } finally {
    await Promise.all([first.leave(), second.leave()]);
  }
});

test("the surveyor cannot recover the ranger's tide case", async () => {
  const invite = await createInvite();
  const client = new RoomClient(baseUrl);
  const ranger = await client.joinById(invite.roomId, { name: "Ranger" });
  ranger.onMessage("players", () => {});
  ranger.onMessage("mission", () => {});
  ranger.onMessage("move", () => {});
  ranger.onMessage("identity", () => {});
  const surveyor = await client.joinById(invite.roomId, { name: "Surveyor" });
  surveyor.onMessage("players", () => {});
  surveyor.onMessage("mission", () => {});
  surveyor.onMessage("move", () => {});
  surveyor.onMessage("identity", () => {});
  surveyor.onMessage("interaction-blocked", () => {});
  try {
    for (let step = 1; step <= 10; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      surveyor.send("move", {
        x: -2.3 + (3.2 + 2.3) * step / 10,
        y: 1.05,
        z: -22 + (-15.5 + 22) * step / 10,
      });
    }
    const denied = waitForMessage(surveyor, "interaction-blocked");
    surveyor.send("recover-case");
    assert.match((await denied).message, /ranger must recover/i);
    const mission = waitForMessage(ranger, "mission");
    ranger.send("sync");
    assert.equal((await mission).phase, "seeking-case");
  } finally {
    await Promise.all([ranger.leave(), surveyor.leave()]);
  }
});

test("reaching the surveyor before the beacon is online closes the rescue window", async () => {
  const invite = await createInvite();
  const client = new RoomClient(baseUrl);
  const ranger = await client.joinById(invite.roomId, { name: "Ranger" });
  const surveyor = await client.joinById(invite.roomId, { name: "Surveyor" });
  ranger.onMessage("mission", () => {});
  ranger.onMessage("players", () => {});
  ranger.onMessage("move", () => {});
  ranger.onMessage("interaction-blocked", () => {});
  surveyor.onMessage("players", () => {});
  surveyor.onMessage("move", () => {});
  surveyor.onMessage("mission", () => {});
  try {
    const failed = waitForMessage(ranger, "mission");
    for (let step = 1; step <= 42; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      ranger.send("move", {
        x: -1.35 + (-2.3 + 1.35) * step / 42,
        y: 1.05,
        z: 23 - 45 * step / 42,
      });
    }
    const result = await failed;
    assert.equal(result.phase, "failed");
    assert.match(result.failureReason, /before the surveyor repaired the beacon/i);
  } finally {
    await Promise.all([ranger.leave(), surveyor.leave()]);
  }
});

test("losing either role during the rescue fails the co-op room", async () => {
  const invite = await createInvite();
  const client = new RoomClient(baseUrl);
  const ranger = await client.joinById(invite.roomId, { name: "Ranger" });
  ranger.onMessage("mission", () => {});
  ranger.onMessage("players", () => {});
  const surveyor = await client.joinById(invite.roomId, { name: "Surveyor" });
  surveyor.onMessage("mission", () => {});
  surveyor.onMessage("players", () => {});
  try {
    const failed = waitForMessage(ranger, "mission");
    await surveyor.leave();
    const result = await failed;
    assert.equal(result.phase, "failed");
    assert.match(result.failureReason, /surveyor lost connection/i);
  } finally {
    await ranger.leave();
  }
});

test("a player falling into the ravine fails the whole mission", async () => {
  const invite = await createInvite();
  const client = new RoomClient(baseUrl);
  const player = await client.joinById(invite.roomId, { name: "Ranger" });
  player.onMessage("mission", () => {});
  player.onMessage("players", () => {});
  player.onMessage("move", () => {});
  player.onMessage("move-rejected", () => {});
  try {
    for (let step = 1; step <= 19; step++) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      player.send("move", {
        x: -1.95,
        y: step === 19 ? 0.2 : 1.05,
        z: 19 - step,
      });
    }
    const failed = waitForMessage(player, "mission");
    player.send("fall");
    assert.equal((await failed).phase, "failed");
    const restarted = waitForMessage(player, "mission", 8000);
    assert.equal((await restarted).phase, "seeking-case");
  } finally {
    await player.leave();
  }
});
