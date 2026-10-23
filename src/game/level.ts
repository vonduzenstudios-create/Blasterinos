import * as THREE from 'three';
import { Gfx, Parallax, tex, VW, VH } from '../engine/gfx';
import { World } from './world';
import { T, TS } from '../art/tiles';
import type { Assets } from './assets';
import type { Sprite } from '../engine/gfx';

// Stage 1: "Venom Falls". A jungle run to a fortress gate, then a climb up a
// waterfall to the lake where the hydra lives.

export const MAP_W = 256, MAP_H = 100;
export const GROUND = 96;
export const SHAFT_X = 232 * TS;        // camera x once the climb starts
export const GATE_CAM_X = 176 * TS;      // camera locks here for the mid-boss
export const JUNGLE_CAM_Y = MAP_H * TS - VH;
export const ARENA_FLOOR = 12 * TS;
export const LAKE_Y = 150;

export type SpawnKind = 'runners' | 'rifle' | 'rifleBag' | 'sniper' | 'turret' | 'leaper' | 'drone' | 'capsule' | 'crawler'
  | 'biker' | 'tower' | 'burrower'
  | 'crab' | 'fish'
  | 'brood' | 'pustule';
export interface Spawn { kind: SpawnKind; x: number; y: number; arg?: any; done?: boolean; }

export function buildWorld(): World {
  const w = new World(MAP_W, MAP_H);
  const ground = (x0: number, x1: number, top = GROUND) => w.fill(x0, top, x1, MAP_H - 1, T.GROUND);
  const plank = (x0: number, x1: number, row: number) => w.fill(x0, row, x1, row, T.PLANK);
  const ledge = (x0: number, x1: number, row: number) => w.fill(x0, row, x1, row, T.LEDGE);

  // ---- jungle ----
  ground(0, 19);
  ground(23, 43);
  plank(28, 33, 92); plank(37, 42, 89);
  ground(44, 56, 94);
  ground(53, 56, 91);
  w.fill(57, GROUND, 68, GROUND, T.BRIDGE);
  ground(69, 90);
  ground(78, 81, 93);
  plank(92, 95, 93);
  ground(97, 118);
  plank(100, 104, 92); plank(106, 110, 88);
  ground(116, 118, 93);
  ground(119, 140, 90);
  ground(141, 160);
  plank(162, 164, 93);
  ground(166, 231);
  plank(205, 209, 92); plank(214, 218, 89);
  // fortress gate (removed when destroyed)
  w.fill(197, 80, 199, GROUND - 1, T.METAL);

  // ---- waterfall shaft ----
  ground(232, 253);
  w.fill(232, 8, 233, 89, T.ROCK);
  w.fill(254, 8, 255, MAP_H - 1, T.ROCK);
  const climb: [number, number, number][] = [
    [93, 236, 241], [90, 245, 250], [87, 239, 244], [84, 247, 252], [81, 240, 245], [78, 234, 238],
    [75, 242, 247], [72, 248, 252], [66, 242, 247], [63, 235, 239], [60, 245, 251], [57, 238, 243],
    [54, 246, 251], [48, 240, 246], [45, 234, 238], [42, 244, 249], [39, 237, 242], [36, 246, 252],
    [33, 239, 244], [30, 234, 237], [30, 248, 252], [27, 241, 246], [24, 235, 240], [21, 245, 251],
    [18, 238, 244], [15, 234, 241], [15, 247, 253],
  ];
  for (const [r, a, b] of climb) ledge(a, b, r);
  // small rock outcrops on the walls for texture
  w.fill(234, 69, 234, 70, T.ROCK); w.fill(253, 51, 253, 52, T.ROCK); w.fill(234, 27, 234, 28, T.ROCK);
  // ---- boss arena ----
  ledge(234, 253, 12);
  ledge(234, 237, 8); ledge(250, 253, 8);
  return w;
}

export function buildSpawns(): Spawn[] {
  const px = (t: number) => t * TS + 8;
  const py = (r: number) => r * TS;
  const s: Spawn[] = [
    { kind: 'runners', x: px(10), y: py(GROUND), arg: [px(8), px(170), 95] },
    { kind: 'capsule', x: px(26), y: py(87), arg: 'M' },
    { kind: 'rifleBag', x: px(40), y: py(89) },
    { kind: 'rifle', x: px(50), y: py(94) },
    { kind: 'sniper', x: px(55), y: py(91) },
    { kind: 'leaper', x: px(72), y: py(GROUND) },
    { kind: 'leaper', x: px(76), y: py(GROUND) },
    { kind: 'turret', x: px(80) - 8, y: py(93) },
    { kind: 'capsule', x: px(84), y: py(88), arg: 'S' },
    { kind: 'rifle', x: px(99), y: py(GROUND) },
    { kind: 'sniper', x: px(108), y: py(88) },
    { kind: 'turret', x: px(112), y: py(GROUND) },
    { kind: 'drone', x: px(124), y: py(88), arg: -1 },
    { kind: 'rifleBag', x: px(130), y: py(90) },
    { kind: 'sniper', x: px(138), y: py(90) },
    { kind: 'leaper', x: px(146), y: py(GROUND) },
    { kind: 'capsule', x: px(146), y: py(87), arg: 'L' },
    { kind: 'drone', x: px(152), y: py(88), arg: -1 },
    { kind: 'leaper', x: px(156), y: py(GROUND) },
    { kind: 'drone', x: px(158), y: py(90), arg: -1 },
    { kind: 'rifle', x: px(168), y: py(GROUND) },
    { kind: 'capsule', x: px(178), y: py(88), arg: 'B' },
    // basin before the falls
    { kind: 'capsule', x: px(204), y: py(87), arg: 'H' },
    { kind: 'leaper', x: px(212), y: py(GROUND) },
    { kind: 'rifle', x: px(216), y: py(89) },
    { kind: 'drone', x: px(222), y: py(88), arg: -1 },
    { kind: 'leaper', x: px(226), y: py(GROUND) },
    { kind: 'runners', x: px(205), y: py(GROUND), arg: [px(203), px(228), 120] },
    // the climb
    { kind: 'crawler', x: 234 * TS + 8, y: py(82), arg: -1 },
    { kind: 'sniper', x: px(250), y: py(84) },
    { kind: 'drone', x: px(244), y: py(74), arg: 1 },
    { kind: 'crawler', x: 254 * TS - 8, y: py(68), arg: 1 },
    { kind: 'capsule', x: px(236), y: py(62), arg: 'F' },
    { kind: 'rifle', x: px(248), y: py(60) },
    { kind: 'crawler', x: 234 * TS + 8, y: py(52), arg: -1 },
    { kind: 'leaper', x: px(243), y: py(48) },
    { kind: 'sniper', x: px(247), y: py(42) },
    { kind: 'crawler', x: 254 * TS - 8, y: py(38), arg: 1 },
    { kind: 'drone', x: px(236), y: py(34), arg: 1 },
    { kind: 'rifle', x: px(250), y: py(30) },
    { kind: 'capsule', x: px(236), y: py(26), arg: 'S' },
    { kind: 'crawler', x: 234 * TS + 8, y: py(22), arg: -1 },
    { kind: 'sniper', x: px(248), y: py(21) },
    { kind: 'drone', x: px(250), y: py(19), arg: -1 },
  ];
  return s;
}

// ---------------------------------------------------------------- shaders

const waterfallFrag = /* glsl */`
  uniform float time;
  varying vec2 vWorld;
  float h(float n) { return fract(sin(n * 91.345) * 47453.5453); }
  void main() {
    vec2 p = floor(vWorld);
    float col = floor(p.x / 4.0);
    float sp = 2.2 + h(col) * 1.0;
    float y = p.y - time * 60.0 * sp;
    float streak = fract(y / (70.0 + h(col + 7.0) * 90.0) + h(col + 3.0));
    float edge = smoothstep(0.0, 26.0, p.x - uLeft) * smoothstep(0.0, 26.0, uRight - p.x);
    vec3 deep = vec3(0.07, 0.2, 0.36), mid = vec3(0.13, 0.36, 0.56), light = vec3(0.36, 0.64, 0.82), foam = vec3(0.78, 0.92, 0.98);
    vec3 c = mid;
    if (streak < 0.06) c = foam; else if (streak < 0.2) c = light; else if (streak > 0.72) c = deep;
    // sparse pixel spray
    float d = fract(sin(dot(vec2(p.x, floor(y / 2.0)), vec2(12.9898, 78.233))) * 43758.5453);
    if (d > 0.985) c = foam;
    c = mix(vec3(0.06, 0.12, 0.2), c, 0.35 + 0.65 * edge);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;
const waterVert = /* glsl */`
  varying vec2 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = vec2(w.x, -w.y);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const poolFrag = /* glsl */`
  uniform float time;
  uniform float top;
  varying vec2 vWorld;
  void main() {
    vec2 p = floor(vWorld);
    float depth = p.y - top;
    float wave = floor(sin(p.x / 9.0 + time * 2.0) * 1.5 + sin(p.x / 23.0 - time * 1.3) * 1.5);
    if (depth < wave) discard;
    vec3 c = vec3(0.12, 0.36, 0.55);
    if (depth < wave + 2.0) c = vec3(0.75, 0.92, 1.0);
    else if (depth < wave + 5.0) c = vec3(0.3, 0.6, 0.8);
    else {
      float band = fract((p.x + sin(p.y / 3.0 + time) * 4.0) / 31.0 + p.y / 57.0);
      if (band < 0.05) c = vec3(0.35, 0.65, 0.85);
      c = mix(c, vec3(0.04, 0.12, 0.24), clamp(depth / 70.0, 0.0, 0.7));
    }
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface Scenery {
  update(camX: number, camY: number, t: number): void;
}

export function buildScenery(gfx: Gfx, a: Assets): Scenery {
  const layers: Parallax[] = [];
  // sky and distant layers: tuned so they sit right at the jungle camera height,
  // then slide away below as the camera climbs the falls
  const cy0 = JUNGLE_CAM_Y;
  const sky = new Parallax(gfx, a.bg.sky, 0, 0.04, 0.25, -440 + cy0 * 0.25);
  const mtn = new Parallax(gfx, a.bg.mountains, 1, 0.12, 0.35, 30 + cy0 * 0.35);
  const canopy = new Parallax(gfx, a.bg.canopy, 2, 0.3, 0.55, 40 + cy0 * 0.55);
  const near = new Parallax(gfx, a.bg.near, 3, 0.55, 0.8, -10 + cy0 * 0.8);
  layers.push(sky, mtn, canopy, near);

  // wet cliff wall behind the falls (world space)
  const cliffT = tex(a.bg.cliff, true).clone();
  cliffT.needsUpdate = true;
  cliffT.wrapS = cliffT.wrapT = THREE.RepeatWrapping;
  const cliffH = 1600, cliffW = VW;
  cliffT.repeat.set(cliffW / a.bg.cliff.width, cliffH / a.bg.cliff.height);
  const cliff = new THREE.Mesh(new THREE.PlaneGeometry(cliffW, cliffH), new THREE.MeshBasicMaterial({ map: cliffT, depthTest: false, depthWrite: false, transparent: true }));
  cliff.position.set(SHAFT_X + cliffW / 2, -(cliffH / 2 + 130), 0);
  cliff.renderOrder = 4;
  gfx.scene.add(cliff);

  // the waterfall itself
  const fallX0 = SHAFT_X + 72, fallX1 = SHAFT_X + VW - 56, fallY0 = LAKE_Y + 20, fallY1 = MAP_H * TS;
  const wfMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: waterVert,
    fragmentShader: waterfallFrag.replace('uLeft', fallX0.toFixed(1)).replace('uRight', fallX1.toFixed(1)),
    depthTest: false, depthWrite: false, transparent: true,
  });
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(fallX1 - fallX0, fallY1 - fallY0), wfMat);
  wf.position.set((fallX0 + fallX1) / 2, -(fallY0 + fallY1) / 2, 0);
  wf.renderOrder = 4.5;
  gfx.scene.add(wf);

  // river water at the bottom of the jungle pits + plunge pool, and the lake at the top
  const mkPool = (x0: number, x1: number, y0: number, y1: number, z: number) => {
    const m = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, top: { value: y0 } }, vertexShader: waterVert, fragmentShader: poolFrag, depthTest: false, depthWrite: false, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0 + 4), m);
    mesh.position.set((x0 + x1) / 2, -(y0 + y1) / 2, 0);
    mesh.renderOrder = z;
    gfx.scene.add(mesh);
    return m;
  };
  const river = mkPool(0, SHAFT_X, MAP_H * TS - 22, MAP_H * TS, 11);
  const lake = mkPool(SHAFT_X, SHAFT_X + VW, LAKE_Y, 216, 6);
  return {
    update(camX, camY, t) {
      for (const l of layers) l.update(camX, camY);
      wfMat.uniforms.time.value = t;
      river.uniforms.time.value = t;
      lake.uniforms.time.value = t;
    },
  };
}

/** Static set dressing: trees, bushes, ruins, foreground ferns. */
export function buildDecor(gfx: Gfx, a: Assets): Sprite[] {
  const out: Sprite[] = [];
  const put = (f: any, x: number, y: number, z: number, flip = false, tint = 1) => {
    const s = gfx.sprite(f, z);
    s.x = x; s.y = y; s.flip = flip;
    if (tint !== 1) s.setTint(tint, tint, tint * 1.05);
    s.sync(); out.push(s);
    return s;
  };
  const gy = GROUND * TS;
  const trees: [number, number][] = [[6, gy], [34, gy], [62, gy + 2], [88, gy], [102, gy], [126, 90 * TS], [150, gy], [172, gy], [210, gy], [224, gy]];
  trees.forEach(([tx, y], i) => put(a.props.tree[i % 3], tx * TS, y + 2, 10, i % 2 === 1, 0.8));
  const bushes: [number, number][] = [[3, gy], [15, gy], [27, gy], [47, 94 * TS], [71, gy], [86, gy], [98, gy], [121, 90 * TS], [133, 90 * TS], [143, gy], [155, gy], [168, gy], [186, gy], [202, gy], [219, gy], [229, gy]];
  bushes.forEach(([tx, y], i) => put(a.props.bush[i % 3], tx * TS, y + 3, 14, i % 2 === 0));
  put(a.props.pillar, 12 * TS, gy + 2, 13);
  put(a.props.pillar, 74 * TS, gy + 2, 13);
  put(a.props.statue, 92 * TS + 40, gy + 2, 11, false, 0.85);
  put(a.props.statue, 228 * TS, gy + 2, 11, true, 0.85);
  put(a.props.skulls, 180 * TS, gy + 1, 14);
  put(a.props.skulls, 46 * TS, 94 * TS + 1, 14);
  for (const vx of [30, 31, 101, 109, 162, 206, 216]) put(a.props.vine, vx * TS + 6, 86 * TS, 13);
  // foreground ferns along the bottom edge of the jungle
  const fernFrames = a.bg.ferns.map((c) => ({ canvas: c, w: c.width, h: c.height, ax: c.width / 2, ay: c.height }));
  for (let x = 20; x < SHAFT_X; x += 150 + ((x * 7) % 90)) put(fernFrames[(x >> 4) % 3], x, MAP_H * TS + 6, 55, (x >> 5) % 2 === 0);
  return out;
}

export { VW, VH };
