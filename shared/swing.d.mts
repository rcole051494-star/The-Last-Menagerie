export function getSwingPosition(
  anchor: { x: number; y: number; z: number },
  length: number,
  angle: number,
): { x: number; y: number; z: number };

export function stepSwing(
  angle: number,
  velocity: number,
  input: number,
  gravity: number,
  length: number,
  deltaTime: number,
): {
  angle: number;
  velocity: number;
  position: { x: number; y: number; z: number };
};

export function getSwingReleaseVelocity(
  length: number,
  angle: number,
  angularVelocity: number,
  maximumSpeed?: number,
): { x: number; y: number; z: number };
