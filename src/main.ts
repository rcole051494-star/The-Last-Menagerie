import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { Room } from "colyseus.js";
import {
  EXTRACTION_POINT,
  EXTRACTION_RADIUS,
  BEACH_MAX_X,
  BEACH_MIN_X,
  BABY_CREATURE_POINT,
  BABY_CREATURE_SAFE_RADIUS,
  FIELD_CASE_POINT,
  FAILURE_RESET_MS,
  getTidePhase,
  isAtExtraction,
  isNearFieldCase,
  isNearSurvivor,
  SURVEYOR_BEACON_POINT,
  SURVEYOR_BEACON_RADIUS,
  SURVEYOR_BEACON_REPAIR_MS,
  SURVEYOR_SPAWN_POINT,
  MISSION_DEADLINE_MS,
  SPAWN_POINT,
  TIDE_SURGE_MS,
  TIDE_WARNING_MS,
} from "../shared/mission.mjs";
import "./style.css";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const LOW_WATER_LEVEL = -0.48;
const HIGH_WATER_LEVEL = 1.05;

const objective = $("#objective");
const missionCopy = $("#mission-copy");
const eventCard = $("#event-card");
const eventLabel = $("#event-label");
const eventState = $("#event-state");
const countdown = $("#countdown");
const objectiveGuide = $("#objective-guide");
const objectiveNeedle = $("#objective-needle");
const objectiveTarget = $("#objective-target");
const objectiveDirection = $("#objective-direction");
const objectiveDistance = $("#objective-distance");
const teamStatus = $("#team-status");
const rangerName = $("#ranger-name");
const rangerStatus = $("#ranger-status");
const surveyorName = $("#surveyor-name");
const surveyorStatus = $("#surveyor-status");
const message = $("#center-message");
const interactPrompt = $("#interact");
const interactionLabel = $("#interaction-label");
const lobby = $("#lobby");
const lobbyStatus = $("#lobby-status");
const roomBanner = $("#room-banner");
const leaveRoomButton = $("#leave-room") as HTMLButtonElement;
const createRoomButton = $("#create-room");
const joinForm = $("#join-form");
const soloButton = $("#solo-button");
const playerNameInput = $("#player-name") as HTMLInputElement;
const inviteCodeInput = $("#invite-code") as HTMLInputElement;
const missionOverlay = $("#mission-overlay");
const overlayEyebrow = $("#overlay-eyebrow");
const overlayTitle = $("#overlay-title");
const overlayCopy = $("#overlay-copy");
const replayButton = $("#replay-button");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#9c8175");
scene.fog = new THREE.FogExp2("#9c8175", 0.009);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 7, 27);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.querySelector("#game")!.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight("#f6d6b5", "#34464a", 2.1));
const sun = new THREE.DirectionalLight("#ffd19a", 3.15);
sun.position.set(-22, 36, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.radius = 4;
sun.shadow.bias = -0.00012;
scene.add(sun);
const canyonBounce = new THREE.DirectionalLight("#81aeb0", 0.75);
canyonBounce.position.set(12, 9, -18);
scene.add(canyonBounce);
const warmRim = new THREE.DirectionalLight("#e79a68", 1.05);
warmRim.position.set(-8, 14, -38);
scene.add(warmRim);

const mat = (color: string, roughness = 0.9, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const rockNoise = new Uint8Array(192 * 192 * 4);
let textureSeed = 4181;
const textureRandom = () => {
  textureSeed = (textureSeed * 1664525 + 1013904223) >>> 0;
  return textureSeed / 4294967296;
};
const noiseGrid = Array.from({ length: 25 }, () =>
  Array.from({ length: 25 }, () => textureRandom()),
);
for (let y = 0; y < 192; y++) {
  for (let x = 0; x < 192; x++) {
    const gx = x / 8;
    const gy = y / 8;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const smoothX = fx * fx * (3 - 2 * fx);
    const smoothY = fy * fy * (3 - 2 * fy);
    const top = THREE.MathUtils.lerp(noiseGrid[iy][ix], noiseGrid[iy][ix + 1], smoothX);
    const bottom = THREE.MathUtils.lerp(noiseGrid[iy + 1][ix], noiseGrid[iy + 1][ix + 1], smoothX);
    const broadNoise = THREE.MathUtils.lerp(top, bottom, smoothY);
    const grain = textureRandom();
    const value = Math.round(190 + (broadNoise - 0.5) * 34 + (grain - 0.5) * 16);
    const offset = (y * 192 + x) * 4;
    rockNoise[offset] = value;
    rockNoise[offset + 1] = value;
    rockNoise[offset + 2] = value;
    rockNoise[offset + 3] = 255;
  }
}
const rockTexture = new THREE.DataTexture(rockNoise, 192, 192, THREE.RGBAFormat);
rockTexture.wrapS = THREE.RepeatWrapping;
rockTexture.wrapT = THREE.RepeatWrapping;
rockTexture.repeat.set(1, 1);
rockTexture.colorSpace = THREE.SRGBColorSpace;
rockTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
rockTexture.needsUpdate = true;
const makeRockMaterial = (color: string, roughness = 0.96) =>
  mat(color, roughness, { map: rockTexture, roughnessMap: rockTexture, bumpMap: rockTexture, bumpScale: 0.045 });
const groundTexture = rockTexture.clone();
groundTexture.repeat.set(0.075, 0.075);
groundTexture.needsUpdate = true;
const groundMat = mat("#766f64", 0.96, {
  map: groundTexture,
  roughnessMap: groundTexture,
  bumpMap: groundTexture,
  bumpScale: 0.025,
});
const cliffMaterials = ["#a08d7a", "#8d8174", "#a89279", "#777870", "#948376"]
  .map((color) => makeRockMaterial(color));
const waterMat = new THREE.MeshStandardMaterial({
  color: "#34787c", roughness: 0.46, metalness: 0.04, transparent: true, opacity: 0.8,
  emissive: "#123b3e", emissiveIntensity: 0.28, depthWrite: false,
});
let waterTimeUniform: { value: number } | null = null;
let tideFrontUniform: { value: number } | null = null;
let tideHeightUniform: { value: number } | null = null;
let tideFrontX = -10000;
let tideHeight = 0;
waterMat.onBeforeCompile = (shader) => {
  shader.uniforms.uWaterTime = { value: 0 };
  shader.uniforms.uTideFrontX = { value: -10000 };
  shader.uniforms.uTideHeight = { value: 0 };
  waterTimeUniform = shader.uniforms.uWaterTime;
  tideFrontUniform = shader.uniforms.uTideFrontX;
  tideHeightUniform = shader.uniforms.uTideHeight;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform float uWaterTime;\nuniform float uTideFrontX;\nuniform float uTideHeight;\nvarying vec2 vWaterPosition;\nvarying float vWaterWorldX;",
    )
    .replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>
      float normalWaveA = sin(position.x * 0.16 + uWaterTime * 0.75);
      float normalWaveB = sin(position.y * 0.23 - uWaterTime * 0.55);
      float normalDiagonal = cos(position.x * 0.38 + position.y * 0.17 + uWaterTime * 1.1);
      float normalCrossX = cos(position.x * 0.55 + uWaterTime * 0.6) *
        sin(position.y * 0.38 - uWaterTime * 0.8);
      float normalCrossY = sin(position.x * 0.55 + uWaterTime * 0.6) *
        cos(position.y * 0.38 - uWaterTime * 0.8);
      objectNormal = normalize(vec3(
        -(0.075 * 0.16 * cos(position.x * 0.16 + uWaterTime * 0.75) * normalWaveB +
          0.022 * 0.38 * normalDiagonal +
          0.05 * 0.55 * cos(position.x * 0.55 + uWaterTime * 0.6) *
            sin(position.y * 0.38 - uWaterTime * 0.8)),
        -(0.075 * 0.23 * normalWaveA * cos(position.y * 0.23 - uWaterTime * 0.55) +
          0.022 * 0.17 * normalDiagonal +
          0.05 * 0.38 * normalCrossY),
        1.0
      ));`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vWaterPosition = position.xy;
      vWaterWorldX = (modelMatrix * vec4(position, 1.0)).x;
      float floodCoverage = smoothstep(uTideFrontX - 2.5, uTideFrontX + 2.5, vWaterWorldX);
      transformed.z += uTideHeight * floodCoverage;
      float longWave = sin(position.x * 0.16 + uWaterTime * 0.75);
      float crossWave = sin(position.y * 0.23 - uWaterTime * 0.55);
      transformed.z += longWave * crossWave * 0.075 +
        sin(position.x * 0.38 + position.y * 0.17 + uWaterTime * 1.1) * 0.022 +
        sin(position.x * 0.55 + uWaterTime * 0.6) *
        sin(position.y * 0.38 - uWaterTime * 0.8) * 0.05;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform float uWaterTime;\nuniform float uTideFrontX;\nuniform float uTideHeight;\nvarying vec2 vWaterPosition;\nvarying float vWaterWorldX;",
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float shimmer = sin(vWaterPosition.x * 0.38 + vWaterPosition.y * 0.17 + uWaterTime * 1.1);
      float longRipple = sin(vWaterPosition.x * 0.13 - vWaterPosition.y * 0.19 + uWaterTime * 0.8);
      float crossRipple = sin(vWaterPosition.x * 0.31 + vWaterPosition.y * 0.49 - uWaterTime * 0.58);
      float fineRipple = sin(vWaterPosition.x * 1.75 + vWaterPosition.y * 0.82 + uWaterTime * 1.25) *
        cos(vWaterPosition.x * 0.55 - vWaterPosition.y * 1.46 - uWaterTime * 0.9);
      float riverCurrent = sin(vWaterWorldX * 0.78 - uWaterTime * 2.15 +
        sin(vWaterPosition.y * 0.48) * 0.7);
      float currentGlint = smoothstep(0.86, 0.99, riverCurrent);
      float waterHighlight = smoothstep(0.55, 0.98, shimmer * longRipple + fineRipple * 0.12);
      float foamCrest = smoothstep(1.05, 1.55, longRipple + crossRipple * 0.4 + fineRipple * 0.18);
      float foamFleck = smoothstep(0.74, 0.98,
        sin(vWaterPosition.x * 0.72 + vWaterPosition.y * 0.43 + uWaterTime * 0.62) *
        cos(vWaterPosition.x * 0.24 - vWaterPosition.y * 0.58 - uWaterTime * 0.9));
      float incomingBreak = (1.0 - smoothstep(0.25, 2.0, abs(vWaterWorldX - uTideFrontX))) *
        smoothstep(0.01, 0.25, uTideHeight);
      diffuseColor.rgb *= 0.95 + longRipple * 0.03 + fineRipple * 0.015;
      diffuseColor.rgb += vec3(0.12, 0.24, 0.23) * waterHighlight * 0.34;
      diffuseColor.rgb += vec3(0.31, 0.39, 0.34) * foamCrest * 0.18;
      diffuseColor.rgb += vec3(0.48, 0.56, 0.48) * foamFleck * 0.055;
      diffuseColor.rgb += vec3(0.3, 0.42, 0.38) * currentGlint * 0.1;
      diffuseColor.rgb += vec3(0.68, 0.74, 0.67) * incomingBreak * 0.62;`,
    );
};
waterMat.customProgramCacheKey = () => "menagerie-open-sea-surge-v1";
const creekGeometry = new THREE.PlaneGeometry(38, 1.35, 152, 8);
const creekPositions = creekGeometry.attributes.position;
for (let index = 0; index < creekPositions.count; index++) {
  const worldX = creekPositions.getX(index) - 3;
  const creekMeander = Math.sin(worldX * 0.16) * 0.28;
  creekPositions.setY(index, creekMeander - creekPositions.getY(index));
  creekPositions.setZ(index, -Math.max(0, worldX + 20) * 0.075);
}
creekGeometry.computeVertexNormals();
const water = new THREE.Mesh(creekGeometry, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(-3, LOW_WATER_LEVEL, -1.15);
water.receiveShadow = true;
scene.add(water);
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(150, 210, 96, 112), waterMat);
ocean.rotation.x = -Math.PI / 2;
ocean.position.set(-88, LOW_WATER_LEVEL, -8);
ocean.receiveShadow = true;
scene.add(ocean);

const skyCanvas = document.createElement("canvas");
skyCanvas.width = 512;
skyCanvas.height = 256;
const skyContext = skyCanvas.getContext("2d")!;
const skyGradient = skyContext.createLinearGradient(0, 0, 0, skyCanvas.height);
skyGradient.addColorStop(0, "#526b77");
skyGradient.addColorStop(0.48, "#8e8b83");
skyGradient.addColorStop(0.78, "#dfae83");
skyGradient.addColorStop(1, "#f1c18f");
skyContext.fillStyle = skyGradient;
skyContext.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
for (let i = 0; i < 46; i++) {
  const x = textureRandom() * skyCanvas.width;
  const y = 28 + textureRandom() * 132;
  const width = 18 + textureRandom() * 82;
  const height = 2 + textureRandom() * 9;
  const cloud = skyContext.createRadialGradient(x, y, 1, x, y, width);
  cloud.addColorStop(0, `rgba(246, 215, 180, ${0.035 + textureRandom() * 0.07})`);
  cloud.addColorStop(1, "rgba(246, 215, 180, 0)");
  skyContext.fillStyle = cloud;
  skyContext.save();
  skyContext.translate(x, y);
  skyContext.scale(1, height / width);
  skyContext.translate(-x, -y);
  skyContext.fillRect(x - width, y - width, width * 2, width * 2);
  skyContext.restore();
}
const skyTexture = new THREE.CanvasTexture(skyCanvas);
skyTexture.colorSpace = THREE.SRGBColorSpace;
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(145, 32, 24),
  new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, depthWrite: false, fog: false }),
);
skyDome.renderOrder = -10;
scene.add(skyDome);
const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
  map: (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const glow = context.createRadialGradient(64, 64, 4, 64, 64, 62);
    glow.addColorStop(0, "rgba(255, 224, 174, 0.95)");
    glow.addColorStop(0.15, "rgba(255, 196, 139, 0.72)");
    glow.addColorStop(0.55, "rgba(255, 175, 120, 0.17)");
    glow.addColorStop(1, "rgba(255, 175, 120, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })(),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
sunDisc.position.set(-9, 17, -74);
sunDisc.scale.set(18, 18, 1);
sunDisc.renderOrder = -9;
scene.add(sunDisc);

const physics = await RAPIER.init().then(() => new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
physics.timestep = 1 / 60;
const addFixedBox = (position: THREE.Vector3, halfSize: THREE.Vector3, material: THREE.Material) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(halfSize.x * 2, halfSize.y * 2, halfSize.z * 2), material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  physics.createCollider(
    RAPIER.ColliderDesc.cuboid(halfSize.x, halfSize.y, halfSize.z),
    physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z)),
  );
  return mesh;
};

const RAVINE_NEAR_LIP_Z = 2;
const RAVINE_FAR_LIP_Z = -4;
const RAVINE_FLOOR_Y = -3.3;
const addBeachBank = (centerZ: number, halfLength: number, ravineLipZ: number, wallDirection: number) => {
  const collision = addFixedBox(
    new THREE.Vector3((BEACH_MIN_X + BEACH_MAX_X) / 2, -0.65, centerZ),
    new THREE.Vector3((BEACH_MAX_X - BEACH_MIN_X) / 2, 0.65, halfLength),
    groundMat,
  );
  collision.visible = false;

  const columns = 60;
  const rows = Math.ceil(halfLength * 2 / 1.5);
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= rows; row++) {
    const z = centerZ - halfLength + (row / rows) * halfLength * 2;
    for (let column = 0; column <= columns; column++) {
      const x = BEACH_MIN_X + (column / columns) * (BEACH_MAX_X - BEACH_MIN_X);
      const seaSlope = THREE.MathUtils.smoothstep(-x, 0, 20) * 0.035;
      const sandRipples = (Math.sin(x * 0.22 + z * 0.17) + Math.sin(x * 0.57 - z * 0.13)) * 0.009;
      positions.push(x, 0.015 + seaSlope + sandRipples, z);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const bankGeometry = new THREE.BufferGeometry();
  bankGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  bankGeometry.setIndex(indices);
  bankGeometry.computeVertexNormals();
  const bank = new THREE.Mesh(bankGeometry, groundMat);
  bank.receiveShadow = true;
  scene.add(bank);

  const ravineWallMaterial = makeRockMaterial("#64584d");
  const wallSegments = 60;
  const lowerY = RAVINE_FLOOR_Y;
  {
    const z = ravineLipZ;
    const wallPositions: number[] = [];
    const wallIndices: number[] = [];
    const lipNoise = Array.from({ length: wallSegments + 1 }, () => (random() - 0.5) * 0.38);
    for (let column = 0; column <= wallSegments; column++) {
      const x = BEACH_MIN_X + (column / wallSegments) * (BEACH_MAX_X - BEACH_MIN_X);
      const top = 0.02 + lipNoise[column];
      const bottom = lowerY + (random() - 0.5) * 0.25;
      wallPositions.push(x, top, z + wallDirection * 0.08, x, bottom, z - wallDirection * 0.08);
      if (column < wallSegments) {
        const a = column * 2;
        const b = a + 2;
        wallIndices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const wallGeometry = new THREE.BufferGeometry();
    wallGeometry.setAttribute("position", new THREE.Float32BufferAttribute(wallPositions, 3));
    wallGeometry.setIndex(wallIndices);
    wallGeometry.computeVertexNormals();
    const wall = new THREE.Mesh(wallGeometry, ravineWallMaterial);
    wall.material.side = THREE.DoubleSide;
    wall.receiveShadow = true;
    scene.add(wall);
  }
};

addBeachBank(15, 13, RAVINE_NEAR_LIP_Z, -1);
addBeachBank(-26, 22, RAVINE_FAR_LIP_Z, 1);
const ravineFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(BEACH_MAX_X - BEACH_MIN_X, RAVINE_NEAR_LIP_Z - RAVINE_FAR_LIP_Z, 60, 8),
  makeRockMaterial("#514a42"),
);
ravineFloor.rotation.x = -Math.PI / 2;
ravineFloor.position.set((BEACH_MIN_X + BEACH_MAX_X) / 2, RAVINE_FLOOR_Y, (RAVINE_NEAR_LIP_Z + RAVINE_FAR_LIP_Z) / 2);
ravineFloor.receiveShadow = true;
scene.add(ravineFloor);
const rightCliffBoundary = physics.createRigidBody(
  RAPIER.RigidBodyDesc.fixed().setTranslation(12.8, 5, -10),
);
physics.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 6, 38), rightCliffBoundary);
const leftShoreBoundary = physics.createRigidBody(
  RAPIER.RigidBodyDesc.fixed().setTranslation(BEACH_MIN_X - 0.5, 5, -10),
);
physics.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 6, 38), leftShoreBoundary);
let seed = 24571;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const cliffPalette = ["#978777", "#8b8175", "#a18a74", "#77776e", "#948373"];
const cliffMeshes: THREE.Mesh[] = [];
for (const side of [1]) {
  for (let segment = 0; segment < 13; segment++) {
    const centerZ = 33 - segment * 7.1;
    const rows = 7;
    const columns = 8;
    const height = 13 + random() * 10;
    const length = 8.2 + random() * 1.4;
    const innerEdge = 12.2 + random() * 0.9;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      const ridge = height + (random() - 0.5) * 1.7;
      for (let column = 0; column <= columns; column++) {
        const u = column / columns;
        const jaggedness = Math.sin(u * Math.PI * 5 + segment * 0.9) * 0.78 +
          (random() - 0.5) * 0.7;
        const y = row === 0 ? -0.3 : v * ridge + jaggedness * Math.sin(v * Math.PI * 0.85);
        const x = side * (innerEdge + Math.sin(v * 2.8 + u * 7) * 0.95 + random() * 0.4);
        const z = centerZ + (u - 0.5) * length + Math.sin(v * 4 + segment) * 0.5;
        positions.push(x, y, z);
        uvs.push(u * 2.2, v * 1.8);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = row * (columns + 1) + column;
        const b = a + 1;
        const c = a + columns + 1;
        const d = c + 1;
        const triangles = side === 1 ? [a, b, c, b, d, c] : [a, c, b, b, c, d];
        indices.push(...triangles);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const facetedGeometry = geometry.toNonIndexed();
    facetedGeometry.computeVertexNormals();
    const rock = new THREE.Mesh(facetedGeometry, cliffMaterials[Math.floor(random() * cliffMaterials.length)]);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    cliffMeshes.push(rock);

    const strataPositions: number[] = [];
    const striationY = [0.16, 0.31, 0.48, 0.65, 0.82].map((fraction) => fraction * height);
    for (const y of striationY) {
      const wobble = (random() - 0.5) * 0.5;
      for (let point = 0; point <= 10; point++) {
        const u = point / 10;
        const z = centerZ + (u - 0.5) * length;
        const bandY = y + Math.sin(u * Math.PI * 4 + segment) * 0.16 + wobble;
        const x = side * (innerEdge - 0.035 + Math.sin(u * 9 + bandY) * 0.12);
        strataPositions.push(x, bandY, z);
      }
    }
    const visibleBands = new THREE.Group();
    for (let band = 0; band < striationY.length; band++) {
      const points = strataPositions.slice(band * 33, band * 33 + 33);
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      visibleBands.add(new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: band % 2 ? "#b58e70" : "#e0b48b", transparent: true, opacity: 0.22 }),
      ));
    }
    scene.add(visibleBands);
  }
}

const hazardMaterial = mat("#644d3f");
const hazardStripeMaterial = mat("#d49552", 0.7);
const fallenLogMaterial = mat("#66503d", 0.93, { bumpMap: rockTexture, bumpScale: 0.08 });
const logEndMaterial = mat("#9b7a55", 0.96);
for (const obstacle of [
  { x: 6, z: 9, halfWidth: 1.5 },
  { x: 0.8, z: -13, halfWidth: 2.8 },
  { x: -0.8, z: -19, halfWidth: 2.8 },
]) {
  const { x, z, halfWidth } = obstacle;
  const colliderVisual = addFixedBox(new THREE.Vector3(x, 0.32, z), new THREE.Vector3(halfWidth, 0.32, 0.45), hazardMaterial);
  colliderVisual.visible = false;
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, halfWidth * 2, 9), fallenLogMaterial);
  log.position.set(x, 0.42, z);
  log.rotation.z = Math.PI / 2;
  log.rotation.x = 0.035;
  log.castShadow = true;
  log.receiveShadow = true;
  scene.add(log);
  for (const end of [-1, 1]) {
    const cutEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.035, 9), logEndMaterial);
    cutEnd.position.set(x + end * (halfWidth + 0.015), 0.42, z);
    cutEnd.rotation.z = Math.PI / 2;
    scene.add(cutEnd);
  }
  for (let stripe = -1; stripe <= 1; stripe++) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.04), hazardStripeMaterial);
    mark.position.set(x + stripe * halfWidth * 0.62, 0.43, z - 0.39);
    mark.rotation.x = -0.6;
    scene.add(mark);
  }
}

const springPool = new THREE.Mesh(
  new THREE.CircleGeometry(1.25, 18),
  new THREE.MeshStandardMaterial({ color: "#405e58", roughness: 0.86, transparent: true, opacity: 0.92 }),
);
springPool.rotation.x = -Math.PI / 2;
springPool.position.set(10.1, RAVINE_FLOOR_Y + 0.13, -1.2);
scene.add(springPool);
const springCascade = new THREE.Mesh(
  new THREE.PlaneGeometry(1.5, Math.abs(RAVINE_FLOOR_Y) - LOW_WATER_LEVEL, 12, 10),
  new THREE.MeshBasicMaterial({ color: "#72aaa2", transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
);
springCascade.position.set(11.85, (RAVINE_FLOOR_Y + LOW_WATER_LEVEL) / 2, -1.2);
springCascade.rotation.y = Math.PI / 2;
scene.add(springCascade);
for (let i = 0; i < 7; i++) {
  const boulder = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.35 + random() * 0.45, 0),
    makeRockMaterial(cliffPalette[i % cliffPalette.length]),
  );
  boulder.position.set(10.1 + (random() - 0.5) * 1.5, RAVINE_FLOOR_Y + 0.3, -1.2 + (random() - 0.5) * 2.1);
  boulder.castShadow = true;
  boulder.receiveShadow = true;
  scene.add(boulder);
}

const reedGeometry = new THREE.CylinderGeometry(0.025, 0.072, 1, 5);
const reedMaterial = mat("#a0ad78", 0.94, { vertexColors: true, emissive: "#34422b", emissiveIntensity: 0.18 });
const reeds = new THREE.InstancedMesh(reedGeometry, reedMaterial, 112);
const reedMatrix = new THREE.Matrix4();
const reedPosition = new THREE.Vector3();
const reedRotation = new THREE.Quaternion();
const reedScale = new THREE.Vector3();
const reedEuler = new THREE.Euler();
for (let i = 0; i < reeds.count; i++) {
  const side = i % 2 ? 1 : -1;
  const height = 0.45 + random() * 1.05;
  reedPosition.set(side < 0 ? -45.8 - random() * 1.2 : 7.8 + random() * 1.45, height * 0.48, 33 - random() * 81);
  reedEuler.set((random() - 0.5) * 0.14, random() * Math.PI, side * (random() - 0.5) * 0.26);
  reedRotation.setFromEuler(reedEuler);
  reedScale.set(0.72 + random() * 0.62, height, 0.72 + random() * 0.62);
  reedMatrix.compose(reedPosition, reedRotation, reedScale);
  reeds.setMatrixAt(i, reedMatrix);
  reeds.setColorAt(i, new THREE.Color().setHSL(0.19 + random() * 0.05, 0.16 + random() * 0.19, 0.48 + random() * 0.16));
}
reeds.instanceMatrix.needsUpdate = true;
reeds.castShadow = false;
reeds.receiveShadow = true;
scene.add(reeds);

const bankStoneGeometry = new THREE.DodecahedronGeometry(1, 0);
const bankStones = new THREE.InstancedMesh(bankStoneGeometry, makeRockMaterial("#ffffff"), 42);
for (let i = 0; i < bankStones.count; i++) {
  const side = i % 2 ? 1 : -1;
  const size = 0.32 + random() * 0.78;
  reedPosition.set(side < 0 ? -44.5 - random() * 1.4 : 8.1 + random() * 1.35, size * 0.55, 31 - random() * 78);
  reedEuler.set(random() * 2.4, random() * Math.PI, random() * 2.4);
  reedRotation.setFromEuler(reedEuler);
  reedScale.set(size * (0.8 + random() * 0.6), size * (0.45 + random() * 0.35), size);
  reedMatrix.compose(reedPosition, reedRotation, reedScale);
  bankStones.setMatrixAt(i, reedMatrix);
  bankStones.setColorAt(i, new THREE.Color(cliffPalette[Math.floor(random() * cliffPalette.length)]));
}
bankStones.instanceMatrix.needsUpdate = true;
bankStones.castShadow = true;
bankStones.receiveShadow = true;
scene.add(bankStones);

const extractionPad = new THREE.Group();
extractionPad.position.set(EXTRACTION_POINT.x, 0, EXTRACTION_POINT.z);
scene.add(extractionPad);
const padInset = new THREE.Mesh(
  new THREE.CircleGeometry(3.15, 48),
  new THREE.MeshStandardMaterial({ color: "#395e54", roughness: 0.72, metalness: 0.12, transparent: true, opacity: 0.7 }),
);
padInset.rotation.x = -Math.PI / 2;
padInset.position.y = 0.012;
extractionPad.add(padInset);
const padRing = new THREE.Mesh(
  new THREE.CylinderGeometry(3.8, 3.8, 0.08, 48, 1, true),
  new THREE.MeshStandardMaterial({ color: "#71c4a0", emissive: "#285c4b", emissiveIntensity: 0.6, transparent: true, opacity: 0.76, side: THREE.DoubleSide }),
);
padRing.position.y = 0.05;
extractionPad.add(padRing);
const padInlay = new THREE.Mesh(
  new THREE.TorusGeometry(2.65, 0.045, 5, 48),
  new THREE.MeshBasicMaterial({ color: "#b2e4bd", transparent: true, opacity: 0.8 }),
);
padInlay.rotation.x = Math.PI / 2;
padInlay.position.y = 0.07;
extractionPad.add(padInlay);
for (let marker = 0; marker < 12; marker++) {
  const angle = (marker / 12) * Math.PI * 2;
  const radial = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.035, 0.5),
    new THREE.MeshBasicMaterial({ color: "#d0e7b4", transparent: true, opacity: 0.72 }),
  );
  radial.position.set(Math.sin(angle) * 3.32, 0.08, Math.cos(angle) * 3.32);
  radial.rotation.y = angle;
  extractionPad.add(radial);
}
const padBeacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.08, 0.75, 5.5, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: "#8ce0b8", transparent: true, opacity: 0.055, side: THREE.DoubleSide }),
);
padBeacon.position.y = 2.4;
padBeacon.visible = false;
extractionPad.add(padBeacon);
const padLight = new THREE.PointLight("#8ce0b8", 14, 12, 2);
padLight.position.y = 1.2;
extractionPad.add(padLight);

const barkMaterial = mat("#5d4837", 0.94, { map: rockTexture, bumpMap: rockTexture, bumpScale: 0.085 });
const barkLightMaterial = mat("#846548", 0.92, { map: rockTexture, bumpMap: rockTexture, bumpScale: 0.06 });
const leafMaterial = mat("#66704a", 0.92, { emissive: "#242d1b", emissiveIntensity: 0.1 });
const createTreeLimb = (start: THREE.Vector3, end: THREE.Vector3, startRadius: number, endRadius: number, material: THREE.Material) => {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(endRadius, startRadius, direction.length(), 7),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
};

const treeNearRoot = new THREE.Vector3(10.9, 0.48, 3.45);
const treeFarTip = new THREE.Vector3(1.9, 0.48, -5.65);
const treeVector = treeFarTip.clone().sub(treeNearRoot);
const treeLength = treeVector.length();
const treeYaw = Math.atan2(treeVector.x, treeVector.z);
const fallenTree = new THREE.Group();
fallenTree.position.copy(treeNearRoot).add(treeFarTip).multiplyScalar(0.5);
scene.add(fallenTree);
const treeTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.58, treeLength, 12, 3), barkMaterial);
treeTrunk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), treeVector.clone().normalize());
treeTrunk.castShadow = true;
treeTrunk.receiveShadow = true;
fallenTree.add(treeTrunk);
const trunkHighlight = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.14, treeLength * 0.91, 6), barkLightMaterial);
trunkHighlight.position.set(0.03, 0.31, -0.02);
trunkHighlight.quaternion.copy(treeTrunk.quaternion);
fallenTree.add(trunkHighlight);
const treeColliderBody = physics.createRigidBody(
  RAPIER.RigidBodyDesc.fixed()
    .setTranslation(fallenTree.position.x, fallenTree.position.y, fallenTree.position.z)
    .setRotation({ x: 0, y: treeYaw, z: 0, w: 1 }),
);
physics.createCollider(
  RAPIER.ColliderDesc.cuboid(0.46, 0.58, treeLength * 0.47).setFriction(0.92),
  treeColliderBody,
);

const trunkDirection = treeVector.clone().normalize();
const rootSpreadX = new THREE.Vector3(1, 0, 0);
for (const index of [-2, -1, 0, 1, 2]) {
  const direction = rootSpreadX.clone().multiplyScalar(index * 0.43)
    .add(new THREE.Vector3(0.12, 0.52 + (2 - Math.abs(index)) * 0.12, 0.45))
    .normalize();
  const rootLength = 1.35 + (2 - Math.abs(index)) * 0.38;
  createTreeLimb(
    treeNearRoot.clone().add(trunkDirection.clone().multiplyScalar(0.42)),
    treeNearRoot.clone().add(direction.multiplyScalar(rootLength)),
    0.3 - Math.abs(index) * 0.025,
    0.045,
    index % 2 ? barkMaterial : barkLightMaterial,
  );
}

for (const [index, t] of [0.18, 0.34, 0.52, 0.7, 0.84].entries()) {
  const trunkPoint = treeNearRoot.clone().lerp(treeFarTip, t);
  const side = index % 2 ? -1 : 1;
  const branchTip = trunkPoint.clone().add(new THREE.Vector3(side * (0.8 + (index % 3) * 0.16), 0.95 + (index % 2) * 0.2, side * 0.18));
  const branchMid = trunkPoint.clone().lerp(branchTip, 0.72);
  createTreeLimb(trunkPoint, branchMid, 0.2, 0.1, barkMaterial);
  createTreeLimb(branchMid, branchTip, 0.105, 0.035, barkLightMaterial);
  for (let leaf = 0; leaf < 3; leaf++) {
    const cluster = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.25 + leaf * 0.025, 0),
      leafMaterial,
    );
    cluster.position.copy(branchTip).add(new THREE.Vector3((leaf - 1) * 0.19, leaf % 2 ? 0.1 : 0, (1 - leaf) * 0.13));
    cluster.scale.set(1.15, 0.78, 0.9);
    cluster.castShadow = true;
    scene.add(cluster);
  }
}

const strataMat = mat("#c09370", 1, { transparent: true, opacity: 0.35 });
for (const side of [1]) {
  for (let i = 0; i < 11; i++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 5.7), strataMat);
    band.position.set(side * (13.3 + (i % 3) * 0.5), 1.6 + (i % 4) * 2.1, 27 - i * 6.2);
    band.rotation.z = side * (random() * 0.13);
    scene.add(band);
  }
}

const debris: THREE.Mesh[] = [];
const debrisSurfaceY: number[] = [];
for (let i = 0; i < 20; i++) {
  const size = 0.35 + random() * 1.15;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(size, 0),
    makeRockMaterial(cliffPalette[Math.floor(random() * cliffPalette.length)]),
  );
  const side = i % 2 ? 1 : -1;
  rock.position.set(side * (6.9 + random() * 1.3), size * 0.42, 8 - random() * 57);
  rock.userData.restingY = rock.position.y;
  debrisSurfaceY.push(rock.position.y);
  rock.rotation.set(random() * 2, random() * 2, random() * 2);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  debris.push(rock);
}

const rangerMaterial = mat("#34484d", 0.7, { emissive: "#17262b", emissiveIntensity: 0.3 });
const surveyorMaterial = mat("#c57445", 0.7, { emissive: "#6b3522", emissiveIntensity: 0.3 });
const player = new THREE.Group();
const playerRig = new THREE.Group();
player.add(playerRig);
scene.add(player);
const localSuit = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.48, 4, 8), rangerMaterial);
localSuit.position.y = 0.02;
localSuit.scale.set(1, 1.12, 0.82);
localSuit.castShadow = true;
playerRig.add(localSuit);
const agentDark = mat("#27383a", 0.72, { metalness: 0.12 });
const agentWebbing = mat("#c3a477", 0.82);
const agentHelmet = mat("#c4a166", 0.54, { metalness: 0.12 });
const agentHead = mat("#bd997a", 0.92);
const agentLimbGeometry = new THREE.CapsuleGeometry(0.09, 0.25, 3, 6);
const agentLegGeometry = new THREE.CapsuleGeometry(0.105, 0.25, 3, 6);
const agentBootGeometry = new THREE.BoxGeometry(0.2, 0.14, 0.32);
const agentArmMeshes: THREE.Mesh[] = [];
for (const side of [-1, 1]) {
  const arm = new THREE.Mesh(agentLimbGeometry, rangerMaterial);
  arm.position.set(side * 0.3, 0.02, 0);
  arm.rotation.z = side * -0.13;
  arm.castShadow = true;
  playerRig.add(arm);
  agentArmMeshes.push(arm);

  const leg = new THREE.Mesh(agentLegGeometry, agentDark);
  leg.position.set(side * 0.13, -0.47, 0.015);
  leg.castShadow = true;
  playerRig.add(leg);
  const boot = new THREE.Mesh(agentBootGeometry, agentDark);
  boot.position.set(side * 0.13, -0.71, -0.035);
  boot.castShadow = true;
  playerRig.add(boot);
}
const agentPack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.26), agentDark);
agentPack.position.set(0, 0.08, 0.27);
agentPack.castShadow = true;
playerRig.add(agentPack);
const packRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.38, 7), agentWebbing);
packRoll.rotation.z = Math.PI / 2;
packRoll.position.set(0, 0.36, 0.31);
playerRig.add(packRoll);
const chestWebbing = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.07, 0.035), agentWebbing);
chestWebbing.position.set(0, 0.2, -0.27);
playerRig.add(chestWebbing);
const agentHeadMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), agentHead);
agentHeadMesh.position.y = 0.55;
agentHeadMesh.castShadow = true;
playerRig.add(agentHeadMesh);
const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.225, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.57), agentHelmet);
helmet.position.y = 0.67;
helmet.castShadow = true;
playerRig.add(helmet);
const helmetBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.045, 10), agentHelmet);
helmetBrim.position.y = 0.65;
playerRig.add(helmetBrim);
const helmetLamp = new THREE.Mesh(
  new THREE.BoxGeometry(0.13, 0.085, 0.05),
  new THREE.MeshBasicMaterial({ color: "#f5d69a" }),
);
helmetLamp.position.set(0, 0.65, -0.22);
playerRig.add(helmetLamp);
for (const strapSide of [-1, 1]) {
  const packStrap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.58, 0.05), agentWebbing);
  packStrap.position.set(strapSide * 0.15, 0.09, -0.27);
  packStrap.rotation.z = strapSide * -0.16;
  playerRig.add(packStrap);
}
const roleLamp = new THREE.Mesh(
  new THREE.SphereGeometry(0.075, 8, 6),
  new THREE.MeshBasicMaterial({ color: "#7fd0c6" }),
);
roleLamp.position.set(0.25, 0.34, -0.08);
playerRig.add(roleLamp);
const playerBodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(SPAWN_POINT.x, SPAWN_POINT.y, SPAWN_POINT.z)
  .lockRotations()
  .setLinearDamping(2);
const playerBody = physics.createRigidBody(playerBodyDesc);
physics.createCollider(RAPIER.ColliderDesc.capsule(0.46, 0.36).setFriction(0.8), playerBody);
const remotePlayers = new Map<string, {
  mesh: THREE.Group;
  target: THREE.Vector3;
  role: "ranger" | "surveyor";
}>();
const playerColors = ["#d9a16e", "#77b2a8", "#9a91c2", "#d48670"];

function makeNameTag(name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#111923cc";
  context.beginPath();
  context.roundRect(12, 12, 296, 48, 8);
  context.fill();
  context.fillStyle = "#f3efe8";
  context.font = "600 24px Segoe UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(name.slice(0, 18), 160, 36);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(2.2, 0.5, 1);
  sprite.position.y = 1.55;
  return sprite;
}

function makeRemotePlayer(name: string, index: number, role: "ranger" | "surveyor") {
  const group = new THREE.Group();
  const color = role === "surveyor" ? "#cf7d47" : playerColors[index % playerColors.length];
  const material = mat(color, 0.75, {
    emissive: color,
    emissiveIntensity: 0.12,
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.48, 4, 8), material);
  torso.position.y = 0.02;
  torso.scale.set(1, 1.12, 0.82);
  torso.castShadow = true;
  const helmetMaterial = mat(role === "surveyor" ? "#db905d" : "#c4a166", 0.54);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6), helmetMaterial);
  helmet.position.y = 0.67;
  helmet.castShadow = true;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.26), agentDark);
  pack.position.set(0, 0.08, 0.27);
  pack.castShadow = true;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.08, 0.05),
    new THREE.MeshBasicMaterial({ color: role === "surveyor" ? "#ffb36f" : "#e1d2a7" }),
  );
  visor.position.set(0, 0.65, -0.21);
  group.add(torso, helmet, pack, visor, makeNameTag(role === "surveyor" ? "SURVEYOR" : name));
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(agentLimbGeometry, material);
    arm.position.set(side * 0.3, 0.02, 0);
    arm.rotation.z = side * -0.13;
    arm.castShadow = true;
    const leg = new THREE.Mesh(agentLegGeometry, agentDark);
    leg.position.set(side * 0.13, -0.47, 0.015);
    leg.castShadow = true;
    const boot = new THREE.Mesh(agentBootGeometry, agentDark);
    boot.position.set(side * 0.13, -0.71, -0.035);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.58, 0.05), agentWebbing);
    strap.position.set(side * 0.15, 0.09, -0.27);
    strap.rotation.z = side * -0.16;
    group.add(arm, leg, boot, strap);
  }
  const harness = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.07, 0.035), agentWebbing);
  harness.position.set(0, 0.2, -0.27);
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 8, 6),
    new THREE.MeshBasicMaterial({ color: role === "surveyor" ? "#ffae6a" : playerColors[index % playerColors.length] }),
  );
  marker.position.set(0.25, 0.34, -0.08);
  group.add(harness, marker);
  scene.add(group);
  return group;
}

const survivor = new THREE.Group();
survivor.position.set(-2.3, 0, -22);
scene.add(survivor);
const raft = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.22, 1.8), mat("#76533e"));
raft.position.y = 0.35;
raft.castShadow = true;
survivor.add(raft);
const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.48, 4, 8), mat("#cf7d47"));
person.position.set(0, 0.83, 0);
person.rotation.z = -0.18;
person.castShadow = true;
survivor.add(person);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat("#d6b08d"));
head.position.set(0.08, 1.31, 0);
survivor.add(head);
const flare = new THREE.Mesh(
  new THREE.CylinderGeometry(0.08, 0.14, 9, 8, 1, true),
  new THREE.MeshBasicMaterial({ color: "#f5a254", transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
);
flare.position.y = 4.9;
survivor.add(flare);
const flareLight = new THREE.PointLight("#ffa65b", 22, 16, 2);
flareLight.position.set(0, 2.2, 0);
survivor.add(flareLight);

const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshBasicMaterial({ color: "#ffe2ac" }));
beacon.position.set(0, 1.85, 0);
survivor.add(beacon);

const babyCreature = new THREE.Group();
babyCreature.position.set(BABY_CREATURE_POINT.x, 0, BABY_CREATURE_POINT.z);
scene.add(babyCreature);
const babyFur = mat("#b9a28a", 0.94);
const babyPaleFur = mat("#e0c9a9", 0.91);
const babyInnerEar = mat("#d98569", 0.9, { emissive: "#6b2925", emissiveIntensity: 0.12 });
const babyEye = new THREE.MeshBasicMaterial({ color: "#f4c878" });
const babyBody = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 9), babyFur);
babyBody.scale.set(1.12, 0.77, 1.28);
babyBody.position.set(0, 0.38, 0.05);
babyBody.castShadow = true;
babyCreature.add(babyBody);
const babyHead = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), babyPaleFur);
babyHead.position.set(0, 0.58, -0.34);
babyHead.castShadow = true;
babyCreature.add(babyHead);
for (const side of [-1, 1]) {
  const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.44, 7), babyFur);
  ear.position.set(side * 0.22, 0.9, -0.33);
  ear.rotation.z = side * -0.28;
  ear.castShadow = true;
  babyCreature.add(ear);
  const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.27, 6), babyInnerEar);
  innerEar.position.set(side * 0.22, 0.89, -0.31);
  innerEar.rotation.z = side * -0.28;
  babyCreature.add(innerEar);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.047, 8, 6), babyEye);
  eye.position.set(side * 0.14, 0.62, -0.65);
  babyCreature.add(eye);
  const flipper = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), babyFur);
  flipper.scale.set(1.2, 0.45, 0.7);
  flipper.position.set(side * 0.39, 0.28, -0.12);
  flipper.rotation.z = side * -0.24;
  babyCreature.add(flipper);
}
const babyMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), babyPaleFur);
babyMuzzle.scale.set(1.15, 0.72, 0.82);
babyMuzzle.position.set(0, 0.45, -0.63);
babyCreature.add(babyMuzzle);
const babyNose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), babyInnerEar);
babyNose.position.set(0, 0.5, -0.73);
babyCreature.add(babyNose);
const safetyHalo = new THREE.Mesh(
  new THREE.TorusGeometry(BABY_CREATURE_SAFE_RADIUS, 0.035, 5, 56),
  new THREE.MeshBasicMaterial({ color: "#e4b783", transparent: true, opacity: 0.22 }),
);
safetyHalo.rotation.x = Math.PI / 2;
safetyHalo.position.set(BABY_CREATURE_POINT.x, 0.045, BABY_CREATURE_POINT.z);
scene.add(safetyHalo);

const fieldCase = new THREE.Group();
fieldCase.position.set(FIELD_CASE_POINT.x, 0, FIELD_CASE_POINT.z);
scene.add(fieldCase);
const caseBody = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.7, 0.62), mat("#435c50", 0.55));
caseBody.position.y = 0.4;
caseBody.castShadow = true;
fieldCase.add(caseBody);
const caseStrap = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.77, 0.66), mat("#c39a5c", 0.62, { metalness: 0.18 }));
caseStrap.position.y = 0.4;
caseStrap.castShadow = true;
fieldCase.add(caseStrap);
const caseLatch = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.055), mat("#d4c6a0", 0.38, { metalness: 0.72 }));
caseLatch.position.set(0, 0.43, 0.35);
fieldCase.add(caseLatch);
const caseMark = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.04), mat("#d2a468", 0.55, {
  emissive: "#96632f",
  emissiveIntensity: 0.6,
}));
caseMark.position.set(0, 0.42, 0.33);
fieldCase.add(caseMark);
const caseBeacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.06, 0.45, 4.2, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: "#efbf72", transparent: true, opacity: 0.1, side: THREE.DoubleSide }),
);
caseBeacon.position.y = 2.4;
fieldCase.add(caseBeacon);
const caseLight = new THREE.PointLight("#efbf72", 10, 9, 2);
caseLight.position.y = 1.2;
fieldCase.add(caseLight);

const surveyorBeacon = new THREE.Group();
surveyorBeacon.position.set(SURVEYOR_BEACON_POINT.x, 0, SURVEYOR_BEACON_POINT.z);
scene.add(surveyorBeacon);
const beaconMaterial = mat("#61483d", 0.6, { emissive: "#251813", emissiveIntensity: 0.2 });
const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.92, 0.28, 8), mat("#54473f", 0.72, { metalness: 0.35 }));
beaconBase.position.y = 0.14;
beaconBase.castShadow = true;
surveyorBeacon.add(beaconBase);
const beaconMast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 2.8, 8), beaconMaterial);
beaconMast.position.y = 1.4;
beaconMast.castShadow = true;
surveyorBeacon.add(beaconMast);
const beaconCrossarm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.16), mat("#86705a", 0.58, { metalness: 0.28 }));
beaconCrossarm.position.y = 2.5;
beaconCrossarm.rotation.y = 0.22;
surveyorBeacon.add(beaconCrossarm);
const beaconDish = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.17, 12, 1, true), mat("#a98a64", 0.54, { side: THREE.DoubleSide, metalness: 0.28 }));
beaconDish.position.set(0.27, 2.68, 0);
beaconDish.rotation.z = Math.PI;
surveyorBeacon.add(beaconDish);
const beaconLampMaterial = new THREE.MeshBasicMaterial({ color: "#8d5947" });
const beaconLamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), beaconLampMaterial);
beaconLamp.position.y = 2.95;
surveyorBeacon.add(beaconLamp);
const beaconHalo = new THREE.Mesh(
  new THREE.TorusGeometry(0.55, 0.035, 6, 24),
  new THREE.MeshBasicMaterial({ color: "#f2b27a", transparent: true, opacity: 0.62 }),
);
beaconHalo.position.y = 2.95;
surveyorBeacon.add(beaconHalo);
const beaconLight = new THREE.PointLight("#b7684f", 1.5, 7, 2);
beaconLight.position.y = 3;
surveyorBeacon.add(beaconLight);

const keys = new Set<string>();
const pressedKeys = new Set<string>();
window.addEventListener("keydown", (event) => {
  if (!lobby.classList.contains("hidden")) return;
  if (!keys.has(event.code)) pressedKeys.add(event.code);
  keys.add(event.code);
  if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  pressedKeys.delete(event.code);
});
window.addEventListener("blur", () => {
  keys.clear();
  pressedKeys.clear();
});

type MissionPhase = "lobby" | "seeking-case" | "seeking-survivor" | "extracting" | "complete" | "failed";
let missionPhase: MissionPhase = "lobby";
let rescuePending = false;
let localMission = false;
let failedAt = 0;
let onlineRoom: Room | null = null;
let leavingRoomIntentionally = false;
let localSessionId = "";
let localRole: "ranger" | "surveyor" = "ranger";
let surveyorSignalReady = false;
let surveyorRepairStartedAt = 0;
let lastRepairSeconds = -1;
let roomRoster: Array<{ sessionId: string; name: string; role: "ranger" | "surveyor" }> = [];
let lastTeamStatusUpdateAt = 0;
let lastGuideUpdateAt = 0;
let lastPositionSentAt = 0;
let surgeActive = false;
let elapsed = 0;
let noticeUntil = 0;
let cameraTarget = new THREE.Vector3(SPAWN_POINT.x, 0, SPAWN_POINT.z);
const clock = new THREE.Clock();
let fallReported = false;

const showMessage = (text: string, duration: number) => {
  message.textContent = text;
  message.classList.add("visible");
  noticeUntil = elapsed + duration;
};

const consumePress = (code: string) => {
  if (!pressedKeys.has(code)) return false;
  pressedKeys.delete(code);
  return true;
};

const showMissionOverlay = (title: string, copy: string, replay: boolean) => {
  overlayEyebrow.textContent = replay ? "FIELD LOG COMPLETE" : "TIDAL ANOMALY";
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  replayButton.classList.toggle("hidden", !replay);
  missionOverlay.classList.remove("hidden");
};

const resetMissionClient = (startedAt = Date.now()) => {
  missionPhase = "seeking-case";
  elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
  failedAt = 0;
  rescuePending = false;
  surveyorSignalReady = false;
  surveyorRepairStartedAt = 0;
  lastRepairSeconds = -1;
  beaconLampMaterial.color.set("#8d5947");
  beaconMaterial.emissive.set("#251813");
  beaconLight.color.set("#b7684f");
  beaconLight.intensity = 1.5;
  fallReported = false;
  const spawn = localRole === "surveyor" ? SURVEYOR_SPAWN_POINT : SPAWN_POINT;
  playerBody.setTranslation(spawn, true);
  playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  cameraTarget.set(spawn.x, 0, spawn.z);
  survivor.visible = true;
  babyCreature.visible = true;
  flare.visible = true;
  flareLight.intensity = 22;
  water.position.y = LOW_WATER_LEVEL;
  tideFrontX = -10000;
  tideHeight = 0;
  for (let index = 0; index < debris.length; index++) {
    debris[index].position.y = debrisSurfaceY[index];
  }
  missionOverlay.classList.add("hidden");
  interactPrompt.classList.remove("visible");
  fieldCase.visible = true;
  caseLight.intensity = 10;
  objective.textContent = localRole === "surveyor" ? "Restore the emergency beacon" : "Recover the surveyor's tide case";
  missionCopy.textContent = localRole === "surveyor"
    ? "Keep the rescued youngling close while you restart the far-bank transponder."
    : "Recover the tide readings that reveal a safe route out of the cut.";
  showMessage(localRole === "surveyor"
    ? "REPAIR YOUR BEACON BEFORE THE RANGER ARRIVES"
    : "RECOVER THE TIDE CASE — WATCH THE WATER", 4);
};

const setMissionPhase = (
  phase: MissionPhase,
  rescueName = "",
  serverFailedAt = 0,
  signalReady = surveyorSignalReady,
  failureReason = "",
  repairStartedAt = surveyorRepairStartedAt,
) => {
  const previous = missionPhase;
  missionPhase = phase;
  surveyorSignalReady = signalReady;
  surveyorRepairStartedAt = repairStartedAt;
  lastRepairSeconds = -1;
  beaconLampMaterial.color.set(signalReady ? "#f6c96d" : repairStartedAt ? "#e6a05b" : "#8d5947");
  beaconMaterial.emissive.set(signalReady ? "#745027" : repairStartedAt ? "#58351e" : "#251813");
  beaconLight.color.set(signalReady ? "#f3c66e" : repairStartedAt ? "#efaa68" : "#b7684f");
  beaconLight.intensity = signalReady ? 12 : repairStartedAt ? 7 : 1.5;
  rescuePending = false;
  if (phase === "seeking-case") {
    if (previous !== "seeking-case") resetMissionClient(Date.now());
    objective.textContent = localRole === "surveyor"
      ? surveyorSignalReady ? "Beacon online — hold position" : "Restore the emergency beacon"
      : "Recover the surveyor's tide case";
    missionCopy.textContent = localRole === "surveyor"
      ? surveyorSignalReady
        ? "The ranger can see your signal. Keep the youngling close until you rendezvous."
        : surveyorRepairStartedAt
          ? "Stay close to the youngling and mast. Signal restore in a few seconds."
          : "Keep the youngling safe beside the beacon while you restart it."
      : "Recover the tide readings that reveal a safe route out of the cut.";
    return;
  }
  if (phase === "seeking-survivor") {
    fieldCase.visible = false;
    caseLight.intensity = 0;
    if (localRole === "surveyor") {
      objective.textContent = surveyorSignalReady ? "Rendezvous with the ranger" : "Restore the emergency beacon";
      missionCopy.textContent = surveyorSignalReady
        ? "Beacon online. Keep the youngling close and meet the ranger at the flare."
        : surveyorRepairStartedAt
          ? "Stay close to the youngling and mast while the signal warms up."
          : "Keep the youngling close while you restart the beacon before the ranger arrives.";
    } else {
      objective.textContent = surveyorSignalReady ? "Rendezvous with the surveyor" : "Reach the surveyor";
      missionCopy.textContent = surveyorSignalReady
        ? "Beacon online. Meet the surveyor at the far-bank flare."
        : "The tide case is secured. Find the surveyor and wait for their beacon signal.";
    }
    if (previous === "seeking-case") {
      showMessage(
        localRole === "surveyor"
          ? "TIDE CASE SECURED — FINISH THE BEACON REPAIR"
          : "FIELD CASE SECURED — FIND THE SURVEYOR",
        4,
      );
    }
    return;
  }
  if (phase === "extracting") {
    if (previous !== "extracting") {
      playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      survivor.visible = false;
      babyCreature.visible = false;
      objective.textContent = "Get everyone to extraction";
      missionCopy.textContent = `${rescueName || "The surveyor"} is safe. Rally the whole team on the green extraction pad before high water.`;
      showMessage("SURVEYOR SECURED — MOVE TO EXTRACTION", 5);
    }
    return;
  }
  if (phase === "complete") {
    objective.textContent = "Team extracted";
    missionCopy.textContent = "Everyone made it out of the Sunken Cut.";
    showMissionOverlay("THE TEAM MADE IT OUT", "Field log complete. The whole crew reached extraction before the cut flooded.", true);
    return;
  }
  if (phase === "failed") {
    failedAt = serverFailedAt || Date.now();
    objective.textContent = "Rescue window closed";
    missionCopy.textContent = failureReason || "The extraction window closed.";
    showMissionOverlay("THE RESCUE WINDOW CLOSED", `${failureReason || "The tide overwhelmed the canyon."} The team is pulled back for another run.`, false);
  }
};

const handleMissionState = (state: {
  phase: MissionPhase;
  startedAt: number;
  rescueName?: string;
  failedAt?: number;
  surveyorSignalReady?: boolean;
  failureReason?: string;
  surveyorRepairStartedAt?: number;
}) => {
  const previous = missionPhase;
  elapsed = Math.max(0, (Date.now() - state.startedAt) / 1000);
  if (state.phase === "seeking-case" && previous !== "seeking-case") {
    resetMissionClient(state.startedAt);
    setMissionPhase(
      state.phase,
      state.rescueName,
      state.failedAt,
      state.surveyorSignalReady,
      state.failureReason,
      state.surveyorRepairStartedAt,
    );
    return;
  }
  setMissionPhase(
    state.phase,
    state.rescueName,
    state.failedAt,
    state.surveyorSignalReady,
    state.failureReason,
    state.surveyorRepairStartedAt,
  );
};

const setLobbyStatus = (text: string, isError = false) => {
  lobbyStatus.textContent = text;
  lobbyStatus.classList.toggle("error", isError);
};

const attachRoom = (room: Room, code: string) => {
  onlineRoom = room;
  leavingRoomIntentionally = false;
  leaveRoomButton.classList.remove("hidden");
  teamStatus.classList.remove("hidden");
  localSessionId = room.sessionId;
  roomBanner.textContent = `ROOM ${code} · 1 / 4 PLAYERS`;
  lobby.classList.add("hidden");
  room.onMessage("mission", (state: {
    phase: MissionPhase;
    startedAt: number;
    rescueName?: string;
    failedAt?: number;
    surveyorSignalReady?: boolean;
    failureReason?: string;
    surveyorRepairStartedAt?: number;
  }) => {
    handleMissionState(state);
  });

  room.onMessage("identity", (identity: {
    sessionId: string;
    role: "ranger" | "surveyor";
    x: number;
    y: number;
    z: number;
  }) => {
    localSessionId = identity.sessionId;
    localRole = identity.role;
    localSuit.material = localRole === "surveyor" ? surveyorMaterial : rangerMaterial;
    agentArmMeshes.forEach((arm) => { arm.material = localSuit.material; });
    if (roleLamp.material instanceof THREE.MeshBasicMaterial) {
      roleLamp.material.color.set(localRole === "surveyor" ? "#ffae6a" : "#7fd0c6");
    }
    playerBody.setTranslation({ x: identity.x, y: identity.y, z: identity.z }, true);
    cameraTarget.set(identity.x, identity.y, identity.z);
    setMissionPhase(missionPhase, "", 0, surveyorSignalReady);
    roomBanner.textContent = `ROOM ${code} · ${localRole.toUpperCase()} · 1 / 4`;
  });

  room.onMessage("players", (players: Array<{
    sessionId: string;
    name: string;
    role: "ranger" | "surveyor";
    x: number;
    y: number;
    z: number;
  }>) => {
    roomRoster = players.map(({ sessionId, name, role }) => ({ sessionId, name, role }));
    const activeIds = new Set(players.map((entry) => entry.sessionId));
    for (const [sessionId, remote] of remotePlayers) {
      if (!activeIds.has(sessionId)) {
        scene.remove(remote.mesh);
        remotePlayers.delete(sessionId);
      }
    }
    for (const entry of players) {
      if (entry.sessionId === localSessionId) {
        playerBody.setTranslation({ x: entry.x, y: entry.y, z: entry.z }, true);
        cameraTarget.set(entry.x, entry.y, entry.z);
        continue;
      }
      let remote = remotePlayers.get(entry.sessionId);
      if (!remote) {
        remote = {
          mesh: makeRemotePlayer(entry.name, remotePlayers.size + 1, entry.role),
          target: new THREE.Vector3(),
          role: entry.role,
        };
        remotePlayers.set(entry.sessionId, remote);
      }
      remote.target.set(entry.x, entry.y, entry.z);
    }
    survivor.visible = !players.some((entry) => entry.role === "surveyor") &&
      missionPhase !== "extracting" && missionPhase !== "complete";
    roomBanner.textContent = `ROOM ${code} · ${localRole.toUpperCase()} · ${players.length} / 4`;
  });
  room.onMessage("move", (position: { sessionId: string; x: number; y: number; z: number }) => {
    const remote = remotePlayers.get(position.sessionId);
    if (remote) remote.target.set(position.x, position.y, position.z);
  });
  room.onMessage("move-rejected", (position: { x: number; y: number; z: number }) => {
    playerBody.setTranslation(position, true);
    playerBody.setLinvel({ x: 0, y: playerBody.linvel().y, z: 0 }, true);
  });
  room.onMessage("interaction-blocked", (result: { message: string }) => {
    rescuePending = false;
    showMessage(result.message, 2);
  });
  room.onMessage("extraction-blocked", (result: { message: string }) => {
    showMessage(result.message, 2);
  });
  room.onLeave((code) => {
    if (onlineRoom !== room) return;
    const intentional = leavingRoomIntentionally;
    leavingRoomIntentionally = false;
    onlineRoom = null;
    leaveRoomButton.classList.add("hidden");
    localRole = "ranger";
    surveyorSignalReady = false;
    surveyorRepairStartedAt = 0;
    roomRoster = [];
    localSessionId = "";
    localMission = false;
    teamStatus.classList.add("hidden");
    localSuit.material = rangerMaterial;
    agentArmMeshes.forEach((arm) => { arm.material = rangerMaterial; });
    if (roleLamp.material instanceof THREE.MeshBasicMaterial) roleLamp.material.color.set("#7fd0c6");
    for (const remote of remotePlayers.values()) scene.remove(remote.mesh);
    remotePlayers.clear();
    resetMissionClient(Date.now());
    missionPhase = "lobby";
    roomBanner.textContent = intentional ? "FIELD LOG 01 / LOW WATER" : "CONNECTION LOST · RETURN TO LOBBY";
    lobby.classList.remove("hidden");
    setLobbyStatus(
      intentional ? "You left the room. Create a new room or join another invite." : `Room connection ended (${code}). You can start another room.`,
      !intentional,
    );
  });
  room.send("sync");
};

leaveRoomButton.addEventListener("click", async () => {
  if (!onlineRoom) return;
  const room = onlineRoom;
  leaveRoomButton.setAttribute("disabled", "");
  leavingRoomIntentionally = true;
  try {
    await room.leave();
  } catch (error) {
    leavingRoomIntentionally = false;
    const detail = error instanceof Error ? error.message : "Unknown connection error.";
    showMessage(`Could not leave room: ${detail}`, 4);
  } finally {
    leaveRoomButton.removeAttribute("disabled");
  }
});

const getCallsign = () => playerNameInput.value.trim() || `Ranger ${Math.floor(100 + Math.random() * 900)}`;

createRoomButton.addEventListener("click", async () => {
  createRoomButton.setAttribute("disabled", "");
  setLobbyStatus("Creating a private room...");
  try {
    const { createPrivateRoom } = await import("./multiplayer");
    const { room, code } = await createPrivateRoom(getCallsign());
    attachRoom(room, code);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown connection error.";
    setLobbyStatus(`Could not create room: ${detail}`, true);
  } finally {
    createRoomButton.removeAttribute("disabled");
  }
});

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = inviteCodeInput.value.trim().toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "");
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    setLobbyStatus("Enter the six-character invite code.", true);
    return;
  }
  const joinButton = joinForm.querySelector("button")!;
  joinButton.setAttribute("disabled", "");
  setLobbyStatus(`Joining room ${code}...`);
  try {
    const { joinPrivateRoom } = await import("./multiplayer");
    attachRoom(await joinPrivateRoom(code, getCallsign()), code);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown connection error.";
    setLobbyStatus(`Could not join room: ${detail}`, true);
  } finally {
    joinButton.removeAttribute("disabled");
  }
});

soloButton.addEventListener("click", () => {
  localMission = true;
  localRole = "ranger";
  teamStatus.classList.add("hidden");
  localSuit.material = rangerMaterial;
  agentArmMeshes.forEach((arm) => { arm.material = rangerMaterial; });
  if (roleLamp.material instanceof THREE.MeshBasicMaterial) roleLamp.material.color.set("#7fd0c6");
  lobby.classList.add("hidden");
  roomBanner.textContent = "SOLO PRACTICE · LOW WATER";
  resetMissionClient(Date.now());
  showMessage("SOLO PRACTICE — RECOVER THE FIELD CASE", 4);
});

replayButton.addEventListener("click", () => {
  if (onlineRoom) onlineRoom.send("restart");
  else if (localMission) resetMissionClient(Date.now());
});

const updateSurge = (dt: number) => {
  const tidePhase = getTidePhase(0, elapsed * 1000);
  const rising = tidePhase === "rising";
  if (rising !== surgeActive) {
    surgeActive = rising;
    physics.gravity = { x: 0, y: rising ? -2.1 : -9.81, z: 0 };
    eventCard.classList.toggle("active", rising);
    if (rising) showMessage("HIGH WATER — MOVE!", 4);
  }

  if (rising) {
    const floodPhase = Math.min((elapsed * 1000 - TIDE_WARNING_MS) / TIDE_SURGE_MS, 1);
    tideFrontX = THREE.MathUtils.lerp(-50, 18, floodPhase);
    tideHeight = HIGH_WATER_LEVEL - LOW_WATER_LEVEL;
    eventLabel.textContent = "GRAVITY TIDE";
    eventState.textContent = "WATER RISING";
    const seconds = Math.max(0, Math.ceil((MISSION_DEADLINE_MS - elapsed * 1000) / 1000));
    countdown.textContent = `00:${String(seconds).padStart(2, "0")}`;
    for (let i = 0; i < debris.length; i++) {
      debris[i].position.y += (water.position.y + 0.45 + debrisSurfaceY[i] * 0.14 - debris[i].position.y) * Math.min(dt * 0.8, 1);
      debris[i].rotation.x += dt * 0.22;
      debris[i].rotation.z += dt * 0.15;
    }
  } else {
    for (let index = 0; index < debris.length; index++) {
      debris[index].position.y += (debrisSurfaceY[index] - debris[index].position.y) * Math.min(dt * 0.8, 1);
    }
    if (tidePhase === "warning") {
      water.position.y = LOW_WATER_LEVEL;
      tideFrontX = -10000;
      tideHeight = 0;
      eventLabel.textContent = "GRAVITY TIDE";
      eventCard.classList.remove("active");
      eventState.textContent = "SURGE IN";
      const seconds = Math.max(0, Math.ceil((TIDE_WARNING_MS - elapsed * 1000) / 1000));
      countdown.textContent = `00:${String(seconds).padStart(2, "0")}`;
    } else {
      water.position.y = HIGH_WATER_LEVEL;
      tideFrontX = 10000;
      tideHeight = HIGH_WATER_LEVEL - LOW_WATER_LEVEL;
      eventCard.classList.add("active");
      eventLabel.textContent = "HIGH WATER";
      eventState.textContent = "CUT FLOODED";
      countdown.textContent = "";
    }
  }
};

const beginExtraction = (name = "") => {
  setMissionPhase("extracting", name);
};

const completeLocalMission = () => setMissionPhase("complete");

const getObjectiveTarget = (): { label: string; x: number; z: number } | null => {
  if (missionPhase === "seeking-case") {
    return localRole === "surveyor"
      ? surveyorSignalReady
        ? { label: "HOLD FAR BANK", x: SURVEYOR_SPAWN_POINT.x, z: SURVEYOR_SPAWN_POINT.z }
        : { label: "BEACON REPAIR", x: SURVEYOR_BEACON_POINT.x, z: SURVEYOR_BEACON_POINT.z }
      : { label: "TIDE CASE", x: FIELD_CASE_POINT.x, z: FIELD_CASE_POINT.z };
  }
  if (missionPhase === "seeking-survivor") {
    return localRole === "surveyor" && !surveyorSignalReady
      ? { label: "BEACON REPAIR", x: SURVEYOR_BEACON_POINT.x, z: SURVEYOR_BEACON_POINT.z }
      : { label: "FAR BANK RENDEZVOUS", x: SURVEYOR_SPAWN_POINT.x, z: SURVEYOR_SPAWN_POINT.z };
  }
  if (missionPhase === "extracting") {
    return { label: "EXTRACTION PAD", x: EXTRACTION_POINT.x, z: EXTRACTION_POINT.z };
  }
  return null;
};

const updateObjectiveGuide = (position: THREE.Vector3) => {
  const target = getObjectiveTarget();
  objectiveGuide.classList.toggle("active", Boolean(target));
  if (!target) return;
  const dx = target.x - position.x;
  const dz = target.z - position.z;
  const distance = Math.hypot(dx, dz);
  const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const direction = directions[Math.round(bearing / 45) % directions.length];
  objectiveNeedle.style.transform = `rotate(${bearing}deg)`;
  objectiveTarget.textContent = target.label;
  objectiveDirection.textContent = direction;
  objectiveDistance.textContent = `${Math.round(distance)}m`;
};

const updateTeamStatus = () => {
  teamStatus.classList.toggle("hidden", !onlineRoom);
  if (!onlineRoom) return;
  const ranger = roomRoster.find((player) => player.role === "ranger");
  const surveyor = roomRoster.find((player) => player.role === "surveyor");
  rangerName.textContent = ranger?.name || "RANGER";
  surveyorName.textContent = surveyor?.name || "SURVEYOR";

  if (missionPhase === "failed") {
    rangerStatus.textContent = "Run ended";
    surveyorStatus.textContent = "Run ended";
  } else if (missionPhase === "complete") {
    rangerStatus.textContent = "Extracted";
    surveyorStatus.textContent = "Extracted";
  } else if (missionPhase === "extracting") {
    rangerStatus.textContent = "Rally at extraction";
    surveyorStatus.textContent = "Rally at extraction";
  } else if (missionPhase === "seeking-survivor") {
    rangerStatus.textContent = surveyorSignalReady ? "Rendezvous at flare" : "Find surveyor";
    surveyorStatus.textContent = surveyorSignalReady ? "Rendezvous at flare" : "Waiting for ranger";
  } else {
    rangerStatus.textContent = "Recover tide case";
    surveyorStatus.textContent = surveyorSignalReady
      ? "Beacon online"
      : surveyorRepairStartedAt
        ? `Keeping youngling safe · ${Math.max(1, Math.ceil((surveyorRepairStartedAt + SURVEYOR_BEACON_REPAIR_MS - Date.now()) / 1000))}s`
        : "Repair beacon";
  }
};

const updateRepairCountdown = () => {
  if (localRole !== "surveyor" || !surveyorRepairStartedAt || surveyorSignalReady) return;
  const secondsRemaining = Math.max(
    0,
    Math.ceil((surveyorRepairStartedAt + SURVEYOR_BEACON_REPAIR_MS - Date.now()) / 1000),
  );
  if (secondsRemaining === lastRepairSeconds) return;
  lastRepairSeconds = secondsRemaining;
  missionCopy.textContent = secondsRemaining > 0
    ? `Stay inside the safety ring with the youngling. Signal restore in ${secondsRemaining} second${secondsRemaining === 1 ? "" : "s"}.`
    : "Beacon calibration complete. Waiting for the signal confirmation.";
};

const updateInteraction = (position: THREE.Vector3) => {
  let hint = "";
  if (onlineRoom && localRole === "surveyor" && !surveyorSignalReady && !surveyorRepairStartedAt &&
    (missionPhase === "seeking-case" || missionPhase === "seeking-survivor") &&
    Math.hypot(position.x - SURVEYOR_BEACON_POINT.x, position.z - SURVEYOR_BEACON_POINT.z) <= SURVEYOR_BEACON_RADIUS &&
    Math.hypot(position.x - BABY_CREATURE_POINT.x, position.z - BABY_CREATURE_POINT.z) <= BABY_CREATURE_SAFE_RADIUS) {
    hint = "REPAIR BEACON · KEEP YOUNGLING CLOSE";
  } else if (onlineRoom && localRole === "surveyor" && !surveyorSignalReady &&
    Math.hypot(position.x - SURVEYOR_BEACON_POINT.x, position.z - SURVEYOR_BEACON_POINT.z) <= SURVEYOR_BEACON_RADIUS &&
    Math.hypot(position.x - BABY_CREATURE_POINT.x, position.z - BABY_CREATURE_POINT.z) > BABY_CREATURE_SAFE_RADIUS) {
    hint = "STAY WITH THE YOUNGLING";
  } else if (missionPhase === "seeking-case" && !rescuePending &&
    isNearFieldCase({ x: position.x, z: position.z })) {
    hint = "RECOVER FIELD CASE";
  } else if (missionPhase === "seeking-survivor" && !rescuePending &&
    isNearSurvivor({ x: position.x, z: position.z })) {
    const partnersNearby = [...remotePlayers.values()].filter((remote) =>
      (localRole === "surveyor" ? remote.role === "ranger" : remote.role === "surveyor") &&
      isNearSurvivor({ x: remote.target.x, z: remote.target.z }),
    ).length;
    hint = !surveyorSignalReady
      ? "WAIT FOR SURVEYOR BEACON"
      : onlineRoom && partnersNearby === 0
        ? "WAIT FOR YOUR PARTNER"
        : localRole === "surveyor" ? "SIGNAL FOR RESCUE" : "RESCUE SURVEYOR";
  } else if (missionPhase === "extracting" &&
    isAtExtraction({ x: position.x, z: position.z }, EXTRACTION_RADIUS)) {
    hint = "EXTRACT TEAM";
  }
  interactionLabel.textContent = hint;
  interactPrompt.classList.toggle("visible", Boolean(hint));

  if (!consumePress("KeyE")) return;
  if (hint === "RECOVER FIELD CASE") {
    if (onlineRoom) {
      rescuePending = true;
      onlineRoom.send("recover-case");
    } else if (localMission) {
      fieldCase.visible = false;
      caseLight.intensity = 0;
      setMissionPhase("seeking-survivor");
    }
    return;
  }
  if (hint === "RESTORE EMERGENCY BEACON") {
    if (onlineRoom) {
      rescuePending = true;
      onlineRoom.send("activate-beacon");
    }
    return;
  }
  if (hint === "WAIT FOR SURVEYOR BEACON" || hint === "WAIT FOR YOUR PARTNER") {
    showMessage(hint === "WAIT FOR SURVEYOR BEACON"
      ? "THE SURVEYOR MUST REPAIR THE BEACON FIRST"
      : "RENDEZVOUS WITH YOUR PARTNER AT THE FLARE", 2);
    return;
  }
  if (hint === "RESCUE SURVEYOR" || hint === "SIGNAL FOR RESCUE") {
    if (onlineRoom) {
      rescuePending = true;
      onlineRoom.send("rescue");
    } else {
      beginExtraction("You rescued the surveyor");
    }
    return;
  }
  if (hint === "EXTRACT TEAM") {
    if (onlineRoom) onlineRoom.send("extract");
    else completeLocalMission();
  }
};

const handleFall = () => {
  if (onlineRoom) {
    onlineRoom.send("fall");
    return;
  }
  if (localMission) setMissionPhase("failed");
};

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const missionIsRunning = missionPhase === "seeking-case" ||
    missionPhase === "seeking-survivor" || missionPhase === "extracting";
  if (missionIsRunning) elapsed += dt;
  physics.timestep = dt;

  const inputX = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const inputZ = Number(keys.has("KeyS") || keys.has("ArrowDown")) - Number(keys.has("KeyW") || keys.has("ArrowUp"));
  const direction = new THREE.Vector2(inputX, inputZ);
  if (direction.lengthSq() > 1) direction.normalize();

  const bodyPosition = playerBody.translation();
  const velocity = playerBody.linvel();
  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 8 : 5.4;
  const moving = direction.lengthSq() > 0;
  if (missionIsRunning) {
    const nextX = moving ? direction.x * speed : velocity.x * 0.86;
    const nextZ = moving ? direction.y * speed : velocity.z * 0.86;
    const grounded = bodyPosition.y < 1.18 && velocity.y < 1.1;
    const jumping = consumePress("Space") && grounded;
    playerBody.setLinvel({ x: nextX, y: jumping ? (surgeActive ? 7 : 5.2) : velocity.y, z: nextZ }, true);
  } else {
    playerBody.setLinvel({ x: 0, y: velocity.y, z: 0 }, true);
  }

  physics.step();
  const position = playerBody.translation();
  player.position.set(position.x, position.y, position.z);
  if (moving) player.rotation.y = Math.atan2(direction.x, direction.y) + Math.PI;
  playerRig.position.y = moving ? Math.sin(elapsed * 13) * 0.035 : 0;
  playerRig.rotation.z = moving ? Math.sin(elapsed * 6.5) * 0.025 : 0;
  const playerPosition = new THREE.Vector3(position.x, position.y, position.z);
  updateInteraction(playerPosition);
  if (missionPhase === "lobby") {
    eventLabel.textContent = "GRAVITY TIDE";
    eventState.textContent = "SURGE IN";
    countdown.textContent = `00:${String(Math.ceil(TIDE_WARNING_MS / 1000)).padStart(2, "0")}`;
  } else {
    updateSurge(dt);
  }
  if (waterTimeUniform) waterTimeUniform.value = elapsed;
  if (tideFrontUniform) tideFrontUniform.value = tideFrontX;
  if (tideHeightUniform) tideHeightUniform.value = tideHeight;

  if (localMission && missionIsRunning && elapsed * 1000 >= MISSION_DEADLINE_MS) {
    setMissionPhase("failed");
  }
  if (localMission && missionPhase === "failed" && Date.now() - failedAt >= FAILURE_RESET_MS) {
    resetMissionClient(Date.now());
  }
  if (missionIsRunning && position.y < -1 && !fallReported) {
    fallReported = true;
    handleFall();
  } else if (position.y > -0.5) {
    fallReported = false;
  }

  const now = performance.now();
  if (onlineRoom && now - lastPositionSentAt >= 100) {
    lastPositionSentAt = now;
    onlineRoom.send("move", { x: position.x, y: position.y, z: position.z });
  }
  for (const remote of remotePlayers.values()) {
    remote.mesh.position.lerp(remote.target, 1 - Math.exp(-dt * 12));
  }

  cameraTarget.lerp(playerPosition, 1 - Math.exp(-dt * 4.5));
  const desiredCamera = new THREE.Vector3(cameraTarget.x, cameraTarget.y + 6.2, cameraTarget.z + 10.5);
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 2.8));
  camera.lookAt(cameraTarget.x, cameraTarget.y + 1.1, cameraTarget.z - 1.5);
  skyDome.position.copy(camera.position);

  survivor.position.y = Math.sin(elapsed * 1.4) * 0.08 + (surgeActive ? 0.3 : 0);
  babyCreature.position.y = Math.sin(elapsed * 2.3) * 0.045;
  safetyHalo.material instanceof THREE.MeshBasicMaterial &&
    (safetyHalo.material.opacity = 0.16 + Math.sin(elapsed * 2) * 0.04);
  updateRepairCountdown();
  if (now - lastGuideUpdateAt >= 150) {
    lastGuideUpdateAt = now;
    updateObjectiveGuide(playerPosition);
  }
  if (now - lastTeamStatusUpdateAt >= 250) {
    lastTeamStatusUpdateAt = now;
    updateTeamStatus();
  }
  if (surveyorRepairStartedAt && !surveyorSignalReady) {
    beaconLight.intensity = 5 + Math.sin(elapsed * 8) * 1.5;
  }
  flare.material instanceof THREE.MeshBasicMaterial && (flare.material.opacity = 0.11 + Math.sin(elapsed * 4) * 0.04);
  extractionPad.rotation.y = Math.sin(elapsed * 0.5) * 0.05;
  const atExtraction = missionPhase === "extracting" || missionPhase === "complete";
  padBeacon.visible = atExtraction;
  padLight.intensity = atExtraction ? 12 + Math.sin(elapsed * 2.5) * 2 : 3.5 + Math.sin(elapsed * 2.5) * 0.5;
  if (elapsed > noticeUntil) message.classList.remove("visible");
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
});

showMessage("FOLLOW THE FLARE DOWNSTREAM", 5);
frame();
