export function getSwingPosition(anchor, length, angle) {
  return {
    x: anchor.x,
    y: anchor.y - length * Math.cos(angle),
    z: anchor.z + length * Math.sin(angle),
  };
}

export function stepSwing(angle, velocity, input, gravity, length, deltaTime) {
  const nextVelocity = (velocity + (-(gravity / length) * Math.sin(angle) + input * 2.9) * deltaTime) *
    Math.pow(0.996, deltaTime * 60);
  const nextAngle = Math.max(-1.35, Math.min(1.35, angle + nextVelocity * deltaTime));
  return {
    angle: nextAngle,
    velocity: nextVelocity,
    position: getSwingPosition({ x: 0, y: 0, z: 0 }, length, nextAngle),
  };
}

export function getSwingReleaseVelocity(length, angle, angularVelocity, maximumSpeed = 10) {
  const velocity = {
    x: 0,
    y: length * Math.sin(angle) * angularVelocity,
    z: length * Math.cos(angle) * angularVelocity,
  };
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const scale = speed > maximumSpeed ? maximumSpeed / speed : 1;
  return {
    x: velocity.x * scale,
    y: velocity.y * scale,
    z: velocity.z * scale,
  };
}
