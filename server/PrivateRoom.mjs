import { Room } from "@colyseus/core";
import {
  canRecoverFieldCase,
  canActivateSurveyorBeacon,
  canMaintainBeaconRepair,
  BEACH_MAX_X,
  BEACH_MIN_X,
  EXTRACTION_POINT,
  FAILURE_RESET_MS,
  canRescueSurvivor,
  hasMissedTideDeadline,
  isAtExtraction,
  isTeamExtracted,
  SPAWN_POINT,
  SURVEYOR_SPAWN_POINT,
  SURVEYOR_BEACON_REPAIR_MS,
} from "../shared/mission.mjs";

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
let roomDisposed = () => {};

export function setRoomDisposedCallback(callback) {
  roomDisposed = callback;
}

export class PrivateRoom extends Room {
  onCreate() {
    this.maxClients = 4;
    this.autoDispose = true;
    this.players = new Map();
    this.missionPhase = "seeking-case";
    this.rescueName = "";
    this.failureReason = "";
    this.failedAt = 0;
    this.startedAt = 0;
    this.clock.setTimeout(() => this.disconnect(), ROOM_TTL_MS);
    this.clock.setInterval(() => this.checkTideDeadline(), 250);

    this.onMessage("sync", (client) => {
      client.send("mission", this.missionState());
      const player = this.players.get(client.sessionId);
      if (player) {
        client.send("identity", {
          sessionId: player.sessionId,
          role: player.role,
          x: player.x,
          y: player.y,
          z: player.z,
        });
      }
      client.send("players", this.playerList());
    });
    this.onMessage("move", (client, data) => this.updatePosition(client, data));
    this.onMessage("recover-case", (client) => this.recoverFieldCase(client));
    this.onMessage("activate-beacon", (client) => this.activateSurveyorBeacon(client));
    this.onMessage("rescue", (client) => this.attemptRescue(client));
    this.onMessage("extract", (client) => this.attemptExtraction(client));
    this.onMessage("restart", () => this.restartMission());
    this.onMessage("fall", (client) => this.reportFall(client));
  }

  onJoin(client, options = {}) {
    const slot = this.players.size;
    if (slot === 0) this.startedAt = Date.now();
    const role = slot > 0 && ![...this.players.values()].some((player) => player.role === "surveyor")
      ? "surveyor"
      : "ranger";
    const spawn = role === "surveyor" ? SURVEYOR_SPAWN_POINT : SPAWN_POINT;
    const player = {
      sessionId: client.sessionId,
      name: cleanName(options.name),
      role,
      signalReady: false,
      repairStartedAt: 0,
      x: role === "surveyor" ? spawn.x : (slot - 1.5) * 0.9,
      y: spawn.y,
      z: spawn.z,
      lastMoveAt: Date.now(),
    };
    this.players.set(client.sessionId, player);
    this.broadcast("players", this.playerList(), { except: client });
  }

  onLeave(client) {
    const leavingPlayer = this.players.get(client.sessionId);
    this.players.delete(client.sessionId);
    if (
      this.players.size > 0 &&
      this.missionPhase !== "complete" &&
      this.missionPhase !== "failed"
    ) {
      const playerName = leavingPlayer?.role === "surveyor" ? "The surveyor" : "A ranger";
      this.failMission(Date.now(), `${playerName} lost connection. Re-form the team to continue.`);
    }
    this.broadcast("players", this.playerList());
  }

  onDispose() {
    roomDisposed(this.roomId);
  }

  playerList() {
    return [...this.players.values()].map(({ lastMoveAt, ...player }) => player);
  }

  missionState() {
    return {
      phase: this.missionPhase,
      startedAt: this.startedAt,
      rescueName: this.rescueName,
      surveyorSignalReady: [...this.players.values()].some((player) => player.role === "surveyor" && player.signalReady),
      surveyorRepairStartedAt: [...this.players.values()].find((player) => player.role === "surveyor")?.repairStartedAt || 0,
      failureReason: this.failureReason,
      failedAt: this.failedAt,
    };
  }

  publishMission() {
    this.broadcast("mission", this.missionState());
  }

  checkTideDeadline(now = Date.now()) {
    if (!this.startedAt || this.missionPhase === "complete" || this.missionPhase === "failed") return;
    if (hasMissedTideDeadline(this.startedAt, now)) {
      this.failMission(now);
      return;
    }
    const surveyor = [...this.players.values()].find((player) => player.role === "surveyor");
    if (!surveyor?.repairStartedAt || surveyor.signalReady) return;
    if (!canMaintainBeaconRepair(surveyor)) {
      surveyor.repairStartedAt = 0;
      this.publishMission();
      return;
    }
    if (now - surveyor.repairStartedAt >= SURVEYOR_BEACON_REPAIR_MS) {
      surveyor.signalReady = true;
      surveyor.repairStartedAt = 0;
      this.publishMission();
    }
  }

  failMission(now = Date.now(), reason = "The tide overwhelmed the canyon.") {
    if (this.missionPhase === "complete" || this.missionPhase === "failed") return;
    this.missionPhase = "failed";
    this.failedAt = now;
    this.failureReason = reason;
    this.publishMission();
    this.clock.setTimeout(() => this.restartMission(), FAILURE_RESET_MS);
  }

  restartMission() {
    if (this.missionPhase !== "failed" && this.missionPhase !== "complete") return;
    this.missionPhase = "seeking-case";
    this.rescueName = "";
    this.failureReason = "";
    this.failedAt = 0;
    this.startedAt = Date.now();
    for (const [index, player] of [...this.players.values()].entries()) {
      const spawn = player.role === "surveyor" ? SURVEYOR_SPAWN_POINT : SPAWN_POINT;
      player.x = player.role === "surveyor" ? spawn.x : (index - 1.5) * 0.9;
      player.y = spawn.y;
      player.z = spawn.z;
      player.signalReady = false;
      player.repairStartedAt = 0;
      player.lastMoveAt = this.startedAt;
    }
    this.publishMission();
    this.broadcast("players", this.playerList());
  }

  updatePosition(client, data) {
    const player = this.players.get(client.sessionId);
    const now = Date.now();
    if (!player || now - player.lastMoveAt < 90 || !isPosition(data)) return;
    const next = {
      x: clamp(data.x, BEACH_MIN_X, BEACH_MAX_X),
      y: clamp(data.y, 0, 18),
      z: clamp(data.z, -47, 27),
    };
    const elapsedSeconds = (now - player.lastMoveAt) / 1000;
    const maximumTravel = 12 * elapsedSeconds + 0.5;
    if (Math.hypot(next.x - player.x, next.y - player.y, next.z - player.z) > maximumTravel) {
      client.send("move-rejected", { x: player.x, y: player.y, z: player.z });
      return;
    }
    player.lastMoveAt = now;
    player.x = next.x;
    player.y = next.y;
    player.z = next.z;
    if (
      player.role === "ranger" &&
      ![...this.players.values()].some((candidate) => candidate.role === "surveyor" && candidate.signalReady) &&
      Math.hypot(player.x - SURVEYOR_SPAWN_POINT.x, player.z - SURVEYOR_SPAWN_POINT.z) <= 4.2
    ) {
      this.failMission(now, "The ranger reached the far bank before the surveyor repaired the beacon.");
      return;
    }
    this.broadcast("move", {
      sessionId: player.sessionId,
      x: player.x,
      y: player.y,
      z: player.z,
    }, { except: client });
  }

  recoverFieldCase(client) {
    this.checkTideDeadline();
    const player = this.players.get(client.sessionId);
    if (!player || !canRecoverFieldCase(this.missionPhase, player)) {
      const message = player?.role === "surveyor"
        ? "The ranger must recover the tide case."
        : "Get closer to the field case.";
      client.send("interaction-blocked", { message });
      return;
    }
    this.missionPhase = "seeking-survivor";
    this.publishMission();
  }

  activateSurveyorBeacon(client) {
    this.checkTideDeadline();
    const player = this.players.get(client.sessionId);
    if (!player || !["seeking-case", "seeking-survivor"].includes(this.missionPhase)) return;
    if (!canMaintainBeaconRepair(player)) {
      client.send("interaction-blocked", { message: "Stay beside the emergency beacon and keep the baby creature safe." });
      return;
    }
    if (player.signalReady || player.repairStartedAt) return;
    player.repairStartedAt = Date.now();
    this.publishMission();
  }

  attemptRescue(client) {
    this.checkTideDeadline();
    const player = this.players.get(client.sessionId);
    if (!player || this.missionPhase !== "seeking-survivor") return;
    if (!canRescueSurvivor(this.playerList(), client.sessionId)) {
      const nearbyPlayers = this.playerList().filter((candidate) =>
        canRescueSurvivor([candidate], candidate.sessionId),
      ).length;
      const message = nearbyPlayers === 0
        ? "Rendezvous with the surveyor at the far-side flare."
        : "Restore the surveyor's beacon, then meet at the far-side flare.";
      client.send("interaction-blocked", { message });
      return;
    }
    this.missionPhase = "extracting";
    this.rescueName = player.name;
    this.publishMission();
  }

  reportFall(client) {
    const player = this.players.get(client.sessionId);
    if (!player || this.missionPhase === "complete" || this.missionPhase === "failed") return;
    if (player.y > 0.35 || player.z < -7 || player.z > 3) return;
    this.failMission(Date.now(), "A player fell into the ravine. The mission is lost.");
  }

  attemptExtraction(client) {
    this.checkTideDeadline();
    const player = this.players.get(client.sessionId);
    if (!player || this.missionPhase !== "extracting") return;
    if (!isAtExtraction(player)) {
      client.send("extraction-blocked", { message: "Reach the marked extraction pad." });
      return;
    }
    if (!isTeamExtracted(this.playerList())) {
      client.send("extraction-blocked", { message: "Rally the whole team on the pad." });
      return;
    }
    this.missionPhase = "complete";
    this.publishMission();
  }
}

function cleanName(value) {
  if (typeof value !== "string") return "Ranger";
  const name = value.trim().replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 18);
  return name || "Ranger";
}

function isPosition(value) {
  return value !== null && typeof value === "object" &&
    Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
