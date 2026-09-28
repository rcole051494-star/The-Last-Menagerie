export const TIDE_WARNING_MS: number;
export const TIDE_SURGE_MS: number;
export const MISSION_DEADLINE_MS: number;
export const FAILURE_RESET_MS: number;
export const BEACH_MIN_X: number;
export const BEACH_MAX_X: number;
export const SPAWN_POINT: { x: number; y: number; z: number };
export const FIELD_CASE_POINT: { x: number; z: number };
export const FIELD_CASE_RADIUS: number;
export const SURVIVOR_POINT: { x: number; z: number };
export const SURVIVOR_RADIUS: number;
export const SURVEYOR_SPAWN_POINT: { x: number; y: number; z: number };
export const SURVEYOR_BEACON_POINT: { x: number; z: number };
export const SURVEYOR_BEACON_RADIUS: number;
export const BABY_CREATURE_POINT: { x: number; z: number };
export const BABY_CREATURE_SAFE_RADIUS: number;
export const SURVEYOR_BEACON_REPAIR_MS: number;
export const EXTRACTION_POINT: { x: number; z: number };
export const EXTRACTION_RADIUS: number;

export type TidePhase = "warning" | "rising" | "high";

export function getTidePhase(startedAt: number, now?: number): TidePhase;
export function hasMissedTideDeadline(startedAt: number, now?: number): boolean;
export function isAtExtraction(player: { x: number; z: number }, radius?: number): boolean;
export function isNearFieldCase(player: { x: number; z: number }, radius?: number): boolean;
export function canRecoverFieldCase(
  phase: string,
  player: { x: number; z: number; role?: string },
): boolean;
export function canActivateSurveyorBeacon(player: {
  x: number;
  z: number;
  role?: string;
}): boolean;
export function canMaintainBeaconRepair(player: {
  x: number;
  z: number;
  role?: string;
}): boolean;
export function canRescueSurvivor(
  players: Array<{ sessionId: string; x: number; z: number; role?: string; signalReady?: boolean }>,
  rescuerSessionId: string,
): boolean;
export function isNearSurvivor(player: { x: number; z: number }, radius?: number): boolean;
export function isTeamExtracted(players: Array<{ x: number; z: number }>): boolean;
