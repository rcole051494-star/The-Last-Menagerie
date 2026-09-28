import assert from "node:assert/strict";
import { test } from "node:test";
import { getSwingPosition, getSwingReleaseVelocity, stepSwing } from "./swing.mjs";

test("forward pumping carries a hanging player across the ravine", () => {
  const anchor = { x: 1.3, y: 4.8, z: -1.5 };
  let angle = Math.asin((1.3 - anchor.z) / 4.3);
  let velocity = 0;
  for (let frame = 0; frame < 60; frame++) {
    ({ angle, velocity } = stepSwing(angle, velocity, -1, 9.81, 4.3, 1 / 60));
  }
  const position = getSwingPosition(anchor, 4.3, angle);
  assert.ok(position.z < -4, `swing should clear the far ledge; reached z=${position.z.toFixed(2)}`);
  assert.ok(position.y > 0, "swing arc remains above the canyon floor");

  const releaseVelocity = getSwingReleaseVelocity(4.3, angle, velocity);
  assert.ok(Math.hypot(releaseVelocity.x, releaseVelocity.y, releaseVelocity.z) <= 10.001);
  assert.ok(releaseVelocity.z < 0, "release velocity carries the player toward the far bank");
});
