export const TIDE_WARNING_MS = 28_000;
export const TIDE_SURGE_MS = 8_000;
export const MISSION_DEADLINE_MS = TIDE_WARNING_MS + TIDE_SURGE_MS;
export const FAILURE_RESET_MS = 6_000;
export const BEACH_MIN_X = -48;
export const BEACH_MAX_X = 12;
export const SPAWN_POINT = { x: 0, y: 1.05, z: 23 };
export const FIELD_CASE_POINT = { x: 3.2, z: -15.5 };
export const FIELD_CASE_RADIUS = 2.8;
export const SURVIVOR_POINT = { x: -2.3, z: -22 };
export const SURVIVOR_RADIUS = 4.2;
export const SURVEYOR_SPAWN_POINT = { ...SURVIVOR_POINT, y: 1.05 };
export const SURVEYOR_BEACON_POINT = { x: 3.2, z: -25 };
export const SURVEYOR_BEACON_RADIUS = 2.5;
export const BABY_CREATURE_POINT = { x: 1.4, z: -23.9 };
export const BABY_CREATURE_SAFE_RADIUS = 3.2;
export const SURVEYOR_BEACON_REPAIR_MS = 4_000;
export const EXTRACTION_POINT = { x: 0, z: 24 };
export const EXTRACTION_RADIUS = 4;

export function getTidePhase(startedAt, now = Date.now()) {
  const elapsed = Math.max(0, now - startedAt);
  if (elapsed < TIDE_WARNING_MS) return "warning";
  if (elapsed < MISSION_DEADLINE_MS) return "rising";
  return "high";
}

export function hasMissedTideDeadline(startedAt, now = Date.now()) {
  return now - startedAt >= MISSION_DEADLINE_MS;
}

export function isAtExtraction(player, radius = EXTRACTION_RADIUS) {
  return Math.hypot(player.x - EXTRACTION_POINT.x, player.z - EXTRACTION_POINT.z) <= radius;
}

export function isNearFieldCase(player, radius = FIELD_CASE_RADIUS) {
  return Math.hypot(player.x - FIELD_CASE_POINT.x, player.z - FIELD_CASE_POINT.z) <= radius;
}

export function canRecoverFieldCase(phase, player) {
  return phase === "seeking-case" &&
    (player.role === "ranger" || player.role === undefined) &&
    isNearFieldCase(player);
}

export function canActivateSurveyorBeacon(player) {
  return player.role === "surveyor" &&
    Math.hypot(player.x - SURVEYOR_BEACON_POINT.x, player.z - SURVEYOR_BEACON_POINT.z) <= SURVEYOR_BEACON_RADIUS;
}

export function canMaintainBeaconRepair(player) {
  return canActivateSurveyorBeacon(player) &&
    Math.hypot(player.x - BABY_CREATURE_POINT.x, player.z - BABY_CREATURE_POINT.z) <= BABY_CREATURE_SAFE_RADIUS;
}

export function canRescueSurvivor(players, rescuerSessionId) {
  const rescuer = players.find((player) => player.sessionId === rescuerSessionId);
  if (!rescuer || !isNearSurvivor(rescuer)) return false;
  const surveyor = players.find((player) => player.role === "surveyor");
  if (surveyor) {
    return surveyor.signalReady === true &&
      isNearSurvivor(surveyor) &&
      players.some((player) => player.role !== "surveyor" && isNearSurvivor(player));
  }
  const nearbyRangers = players.filter((player) => player.role !== "surveyor" && isNearSurvivor(player));
  return players.length === 1 || nearbyRangers.length >= 2;
}

export function isNearSurvivor(player, radius = SURVIVOR_RADIUS) {
  return Math.hypot(player.x - SURVIVOR_POINT.x, player.z - SURVIVOR_POINT.z) <= radius;
}

export function isTeamExtracted(players) {
  return players.length > 0 && players.every((player) => isAtExtraction(player));
}
