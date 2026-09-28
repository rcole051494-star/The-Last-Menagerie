import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXTRACTION_POINT,
  EXTRACTION_RADIUS,
  FAILURE_RESET_MS,
  getTidePhase,
  hasMissedTideDeadline,
  isAtExtraction,
  isTeamExtracted,
  MISSION_DEADLINE_MS,
  canRecoverFieldCase,
  canActivateSurveyorBeacon,
  canMaintainBeaconRepair,
  canRescueSurvivor,
  FIELD_CASE_POINT,
  SURVEYOR_BEACON_POINT,
  SURVIVOR_POINT,
  TIDE_SURGE_MS,
  TIDE_WARNING_MS,
} from "./mission.mjs";

test("tide warning, rise, and high-water deadline are distinct", () => {
  const startedAt = 1_000;
  assert.equal(getTidePhase(startedAt, startedAt + TIDE_WARNING_MS - 1), "warning");
  assert.equal(getTidePhase(startedAt, startedAt + TIDE_WARNING_MS), "rising");
  assert.equal(getTidePhase(startedAt, startedAt + MISSION_DEADLINE_MS - 1), "rising");
  assert.equal(getTidePhase(startedAt, startedAt + MISSION_DEADLINE_MS), "high");
  assert.equal(hasMissedTideDeadline(startedAt, startedAt + MISSION_DEADLINE_MS - 1), false);
  assert.equal(hasMissedTideDeadline(startedAt, startedAt + MISSION_DEADLINE_MS), true);
  assert.equal(MISSION_DEADLINE_MS, TIDE_WARNING_MS + TIDE_SURGE_MS);
});

test("field case must be recovered in range before surveyor rescue", () => {
  const atCase = { x: FIELD_CASE_POINT.x, z: FIELD_CASE_POINT.z, role: "ranger" };
  assert.equal(canRecoverFieldCase("seeking-case", atCase), true);
  assert.equal(canRecoverFieldCase("seeking-survivor", atCase), false);
  assert.equal(canRecoverFieldCase("seeking-case", { x: 0, z: 19 }), false);
  assert.equal(canRecoverFieldCase("seeking-case", { ...atCase, role: "surveyor" }), false);
});

test("only the surveyor can activate the beacon from its marked location", () => {
  assert.equal(canActivateSurveyorBeacon({
    x: SURVEYOR_BEACON_POINT.x,
    z: SURVEYOR_BEACON_POINT.z,
    role: "surveyor",
  }), true);
  assert.equal(canActivateSurveyorBeacon({ x: 0, z: 19, role: "surveyor" }), false);
  assert.equal(canActivateSurveyorBeacon({
    x: SURVEYOR_BEACON_POINT.x,
    z: SURVEYOR_BEACON_POINT.z,
    role: "ranger",
  }), false);
});

test("beacon repair is only safe while the surveyor stays beside the baby creature", () => {
  const withCreature = { x: SURVEYOR_BEACON_POINT.x, z: SURVEYOR_BEACON_POINT.z, role: "surveyor" };
  assert.equal(canMaintainBeaconRepair(withCreature), true);
  assert.equal(canMaintainBeaconRepair({ ...withCreature, x: 7, z: -25 }), false);
  assert.equal(canMaintainBeaconRepair({ ...withCreature, role: "ranger" }), false);
});

test("the second online player is the surveyor and must rendezvous before rescue", () => {
  const scout = { sessionId: "scout", role: "ranger", x: SURVIVOR_POINT.x, z: SURVIVOR_POINT.z };
  const surveyor = {
    sessionId: "surveyor",
    role: "surveyor",
    signalReady: true,
    x: SURVIVOR_POINT.x + 1,
    z: SURVIVOR_POINT.z,
  };
  const distantSurveyor = { ...surveyor, x: 0, z: 19 };
  const unreadySurveyor = { ...surveyor, signalReady: false };
  assert.equal(canRescueSurvivor([scout], scout.sessionId), true);
  assert.equal(canRescueSurvivor([scout, distantSurveyor], scout.sessionId), false);
  assert.equal(canRescueSurvivor([scout, unreadySurveyor], scout.sessionId), false);
  assert.equal(canRescueSurvivor([scout, surveyor], scout.sessionId), true);
  assert.equal(canRescueSurvivor([scout, surveyor], surveyor.sessionId), true);
  assert.equal(canRescueSurvivor([surveyor], surveyor.sessionId), false);
});

test("extraction requires every connected player to reach the marked pad", () => {
  const atPad = { x: EXTRACTION_POINT.x, z: EXTRACTION_POINT.z };
  assert.equal(isAtExtraction(atPad), true);
  assert.equal(isAtExtraction({ x: EXTRACTION_RADIUS + 0.1, z: EXTRACTION_POINT.z }), false);
  assert.equal(isTeamExtracted([atPad, { x: 1, z: EXTRACTION_POINT.z }]), true);
  assert.equal(isTeamExtracted([atPad, { x: 1, z: EXTRACTION_POINT.z - EXTRACTION_RADIUS - 1 }]), false);
  assert.equal(isTeamExtracted([]), false);
  assert.ok(FAILURE_RESET_MS > 0);
});
