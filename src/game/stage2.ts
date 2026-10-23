import * as THREE from 'three';
import { Parallax, VW, VH, type Sprite } from '../engine/gfx';
import type { Frame } from '../engine/pixel';
import { T, TS } from '../art/tiles';
import type { Game } from './game';
import type { Stage, Deck } from './stage';
import type { Hittable } from './weapons';
import { World } from './world';
import type { Spawn, Scenery } from './level';
import { Jeep, Biker, Gunship } from './vehicles';
import { SandWorm, Burrower, WormCameo } from './worm';
import { DESERT_SONG, WORM_SONG } from './music';

// Stage 2: "Scorched Dunes". An autoscrolling jeep ride across the desert with a
// gunship in pursuit, until something enormous comes up out of the road. Then a
// run on foot through dunes, mesas and quicksand to the sandworm's nest.

export const MAP_W = 714, MAP_H = 32;
export const GROUND = 28;
const FLOOR = GROUND * TS;
const CAM_Y = 270;                  // ground line sits low on screen: lots of sky
const SPEED = 3.5;                  // jeep speed, px per frame
const JEEP_SX = 112;                // jeep's starting place on screen
const JEEP_MIN = 50, JEEP_MAX = 280; // how far you can push the driver forward or back
const HELI_CAM = 3840;
const CRASH_CAM = 7680;
const CP1_CAM = 7880;               // where the view comes to rest after the crash
const ARENA_X = 690 * TS;
const WORM_HOME = ARENA_X + VW / 2;
const PITS: [number, number][] = [[541, 544], [576, 578], [613, 616]];

type State = 'ride' | 'crash' | 'foot' | 'boss';

export class Stage2 implements Stage {
  readonly num = 2;
  readonly name = 'SCORCHED DUNES';
  readonly song = DESERT_SONG;
  readonly bossSong = WORM_SONG;
  readonly villain = 'THE GREAT DUNE WORM';
  readonly clearLines = ['THE DUNE WORM HAS BEEN CUT DOWN TO SIZE.'];
  state: State = 'ride';
  jeep: Jeep | null = null;
  heli: Gunship | null = null;
  heliDone = false;
  cameo: WormCameo | null = null;
  worm: SandWorm | null = null;
  eruptX = 0;
  crashed = false;
  lockT = 0;
  /** Where the jeep sits on screen. Leaning on either end of the bed nudges the driver to speed up or ease off. */
  jeepSX = JEEP_SX;

  constructor(public g: Game) {}

  get inBoss() { return !!this.worm; }
  get bossActive() { return this.state === 'boss' || !!this.heli?.alive; }

  // ---------------------------------------------------------------- building
  build(cp: number) {
    const g = this.g;
    this.jeepSX = JEEP_SX;
    this.heli = null; this.heliDone = cp > 0; this.cameo = null; this.worm = null; this.crashed = cp > 0; this.lockT = 0;
    g.world = buildWorld();
    g.world.build(g.gfx);
    g.scenery = buildScenery(g);
    buildDecor(g);
    g.spawns = buildSpawns();
    g.gfx.camY = CAM_Y;
    if (cp === 0) {
      this.state = 'ride';
      g.gfx.camX = 0;
      this.jeep = new Jeep(g, JEEP_SX, FLOOR);
    } else {
      this.state = 'foot';
      g.gfx.camX = cp === 1 ? CP1_CAM : ARENA_X - 60;
      // the burnt-out jeep marks where the ride ended
      this.jeep = new Jeep(g, CP1_CAM + 230, FLOOR);
      this.jeep.wreck();
      for (const s of g.spawns) if (s.x < g.gfx.camX + VW) s.done = true;
    }
  }

  start(cp: number) {
    const g = this.g;
    if (cp === 0) return { x: JEEP_SX - 8, y: FLOOR - 60 };
    return { x: g.gfx.camX + 70, y: FLOOR - 50 };
  }

  // ---------------------------------------------------------------- per frame
  updateCamera() {
    const g = this.g, gx = g.gfx;
    gx.camY = CAM_Y;
    switch (this.state) {
      case 'ride':
        g.scrollVx = SPEED;
        gx.camX += SPEED;
        if (!this.heli && !this.heliDone && gx.camX >= HELI_CAM) this.heli = new Gunship(g, FLOOR);
        if (gx.camX >= CRASH_CAM) {
          this.state = 'crash';
          // just ahead of the jeep, wherever the player has steered it
          this.eruptX = gx.camX + Math.min(340, this.jeepSX + 190);
          const h = this.heli && this.heli.alive ? this.heli : null;
          this.cameo = new WormCameo(g, this.eruptX, FLOOR, h);
          g.texts.push({ text: '!!', x: this.eruptX, y: FLOOR - 30, t: 0 });
        }
        break;
      case 'crash': {
        const j = this.jeep!;
        if (!this.crashed && (this.cameo?.t ?? 99) >= 22 && j.x + 40 >= this.eruptX - 16) {
          this.crashed = true;
          j.crash();
          // any bikers still riding along peel off ahead
          for (const e of g.enemies) if (e instanceof Biker) e.phase = 'leave';
          // launched out of the bed
          for (const p of g.livePlayers()) if (p.alive) { p.body.vy = -6.5; p.curl = true; p.jumpHeld = false; p.invuln = Math.max(p.invuln, 100); }
        }
        if (this.crashed) g.scrollVx *= 0.95;
        gx.camX += g.scrollVx;
        if (this.crashed && g.scrollVx < 0.05) {
          g.scrollVx = 0;
          this.state = 'foot';
          g.checkpoint = Math.max(g.checkpoint, 1);
          g.banner = { text: 'ON FOOT', sub: 'FOLLOW THE TRACKS TO THE NEST', t: 0 };
        }
        break;
      }
      case 'foot': {
        const target = Math.min(g.player.body.x - 150, ARENA_X);
        if (target > gx.camX) gx.camX = Math.min(target, gx.camX + 4);
        if (gx.camX >= ARENA_X) {
          gx.camX = ARENA_X; this.state = 'boss'; this.lockT = 0; g.checkpoint = 2;
          g.audio.sfx('alarm');
          g.banner = { text: 'WARNING', sub: 'THE GREAT DUNE WORM', t: 60 };
          for (const e of g.enemies) e.dead = true;
        }
        break;
      }
      case 'boss':
        gx.camX = ARENA_X;
        if (++this.lockT === 70 && !this.worm) {
          this.worm = new SandWorm(g, WORM_HOME, FLOOR, ARENA_X, ARENA_X + VW);
          g.audio.play(WORM_SONG);
        }
        break;
    }
  }

  update() {
    const g = this.g;
    const j = this.jeep;
    if (j) {
      if (j.state === 'drive') {
        const d = this.deck();
        for (const p of g.livePlayers()) {
          const inp = g.padOf(p);
          if (this.state === 'ride' && p.alive && d && !inp.held('lock')) {
            if (inp.held('right') && p.body.x >= d.x1 - 0.5) this.jeepSX = Math.min(JEEP_MAX, this.jeepSX + 1.5);
            if (inp.held('left') && p.body.x <= d.x0 + 0.5) this.jeepSX = Math.max(JEEP_MIN, this.jeepSX - 1.5);
          }
        }
        const nx = g.gfx.camX + this.jeepSX;
        // the players ride along with the jeep's shift
        for (const p of g.livePlayers()) if (p.alive && d && p.state === 'play') p.body.x += nx - j.x - g.scrollVx;
        j.x = nx;
      }
      j.update();
    }
    if (this.heli) {
      this.heli.update();
      if (this.heli.dead) { this.heli.destroy(); this.heli = null; this.heliDone = true; }
    }
    if (this.cameo) {
      this.cameo.update();
      if (this.cameo.dead) { this.cameo.destroy(); this.cameo = null; }
    }
    this.worm?.update();
  }

  parts(): Hittable[] {
    const out: Hittable[] = [];
    if (this.heli) out.push(this.heli);
    if (this.worm) out.push(this.worm);
    return out;
  }
  bossBar(): [number, number, string] | null {
    if (this.worm) return this.worm.mode === 'emerge' && this.worm.attacks === 0 ? null : [this.worm.hp, this.worm.maxHp, 'DUNE WORM'];
    if (this.heli && this.heli.alive) return [this.heli.hp, this.heli.maxHp, 'GUNSHIP'];
    return null;
  }
  spawn(s: Spawn) {
    const g = this.g;
    switch (s.kind) {
      case 'biker': g.enemies.push(new Biker(g, s.arg < 0, FLOOR)); return true;
      case 'burrower': g.enemies.push(new Burrower(g, s.x, s.y)); return true;
    }
    return false;
  }
  deck(): Deck | null {
    const j = this.jeep;
    if (!j || j.state !== 'drive') return null;
    return { x0: j.x - 22, x1: j.x + 8, y: j.deckY };
  }
  respawn() {
    const j = this.jeep, d = this.deck();
    if (!j || !d) return false;
    this.g.player.respawn(j.x - 8, d.y - 50);
    return true;
  }
  onMidBossDefeated() {}
  onBossDefeated() { this.worm?.destroy(); this.worm = null; }
  destroy() {
    this.jeep?.destroy(); this.jeep = null;
    this.heli?.destroy(); this.heli = null;
    this.cameo?.destroy(); this.cameo = null;
    this.worm?.destroy(); this.worm = null;
  }
}

// ---------------------------------------------------------------- map

function buildWorld(): World {
  const w = new World(MAP_W, MAP_H);
  const sand = (x0: number, x1: number, top = GROUND) => w.fill(x0, top, x1, MAP_H - 1, T.SAND);
  const mesa = (x0: number, x1: number, top: number) => w.fill(x0, top, x1, GROUND - 1, T.SANDSTONE);
  const scaffold = (x0: number, x1: number, row: number) => w.fill(x0, row, x1, row, T.SCAFFOLD);
  // the road: flat all the way to the crash site
  sand(0, MAP_W - 1);
  for (const [a, b] of PITS) w.fill(a, GROUND, b, MAP_H - 1, T.E);
  // dunes
  sand(524, 538, GROUND - 1); sand(527, 535, GROUND - 2);
  // first mesa
  scaffold(548, 551, GROUND - 3);
  mesa(553, 563, GROUND - 6);
  // bunker
  w.fill(596, GROUND - 4, 600, GROUND - 1, T.METAL);
  scaffold(593, 595, GROUND - 2);
  // over the third pit
  scaffold(614, 615, GROUND - 1);
  // mesa steps
  mesa(622, 628, GROUND - 3);
  mesa(629, 640, GROUND - 7);
  mesa(641, 644, GROUND - 4);
  scaffold(633, 637, GROUND - 11);
  sand(660, 668, GROUND - 1);
  // cargo rails left over the pits
  w.rail(538, 547, 23);
  w.rail(573, 581, 23);
  // the nest: two scaffold perches over open sand
  scaffold(692, 696, GROUND - 5);
  scaffold(707, 711, GROUND - 5);
  return w;
}

function buildSpawns(): Spawn[] {
  const px = (t: number) => t * TS + 8;
  const py = (r: number) => r * TS;
  // jeep ride spawns trigger by camera position (s.x appears at the right edge)
  const cam = (c: number) => c + VW + 20;
  const s: Spawn[] = [
    { kind: 'biker', x: cam(600), y: FLOOR, arg: -1 },
    { kind: 'drone', x: cam(1000), y: FLOOR - 70, arg: -1 },
    { kind: 'biker', x: cam(1500), y: FLOOR, arg: 1 },
    { kind: 'capsule', x: cam(1800), y: FLOOR - 110, arg: 'S' },
    { kind: 'biker', x: cam(2100), y: FLOOR, arg: -1 },
    { kind: 'drone', x: cam(2700), y: FLOOR - 70, arg: -1 },
    { kind: 'biker', x: cam(3100), y: FLOOR, arg: 1 },
    { kind: 'capsule', x: cam(3400), y: FLOOR - 120, arg: 'M' },
    // while the gunship is up
    { kind: 'biker', x: cam(4700), y: FLOOR, arg: -1 },
    { kind: 'capsule', x: cam(5300), y: FLOOR - 110, arg: 'B' },
    { kind: 'biker', x: cam(5900), y: FLOOR, arg: 1 },
    { kind: 'capsule', x: cam(6300), y: FLOOR - 120, arg: 'L' },
    { kind: 'biker', x: cam(6800), y: FLOOR, arg: -1 },
    { kind: 'drone', x: cam(7100), y: FLOOR - 60, arg: -1 },
    // on foot
    { kind: 'capsule', x: px(522), y: py(GROUND - 7), arg: 'H' },
    { kind: 'runners', x: px(518), y: FLOOR, arg: [px(518), px(612), 90] },
    { kind: 'rifleBag', x: px(532), y: py(GROUND - 2) },
    { kind: 'burrower', x: px(547), y: FLOOR },
    { kind: 'sniper', x: px(559), y: py(GROUND - 6) },
    { kind: 'turret', x: px(570), y: FLOOR },
    { kind: 'drone', x: px(584), y: py(GROUND - 6), arg: -1 },
    { kind: 'rifleBag', x: px(589), y: FLOOR },
    { kind: 'turret', x: px(598), y: py(GROUND - 4) },
    { kind: 'capsule', x: px(602), y: py(GROUND - 8), arg: 'C' },
    { kind: 'burrower', x: px(620), y: FLOOR },
    { kind: 'rifle', x: px(625), y: py(GROUND - 3) },
    { kind: 'sniper', x: px(635), y: py(GROUND - 11) },
    { kind: 'rifle', x: px(639), y: py(GROUND - 7) },
    { kind: 'drone', x: px(646), y: py(GROUND - 6), arg: -1 },
    { kind: 'capsule', x: px(650), y: py(GROUND - 8), arg: 'F' },
    { kind: 'burrower', x: px(654), y: FLOOR },
    { kind: 'runners', x: px(640), y: FLOOR, arg: [px(640), px(688), 80] },
    { kind: 'rifle', x: px(664), y: py(GROUND - 1) },
    { kind: 'burrower', x: px(672), y: FLOOR },
    { kind: 'drone', x: px(680), y: py(GROUND - 6), arg: -1 },
    { kind: 'burrower', x: px(684), y: FLOOR },
  ];
  return s;
}

// ---------------------------------------------------------------- backdrops

const waterVert = /* glsl */`
  varying vec2 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = vec2(w.x, -w.y);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
/** Churning quicksand: slow swirls, dark sinkholes, a bright rim. */
const quicksandFrag = /* glsl */`
  uniform float time;
  uniform float top;
  varying vec2 vWorld;
  void main() {
    vec2 p = floor(vWorld);
    float depth = p.y - top;
    float wave = floor(sin(p.x / 7.0 + time * 1.3) * 1.2);
    if (depth < wave) discard;
    vec3 c = vec3(0.42, 0.2, 0.07);
    if (depth < wave + 1.0) c = vec3(0.92, 0.66, 0.3);
    else if (depth < wave + 3.0) c = vec3(0.62, 0.34, 0.12);
    else {
      float sw = sin(p.x / 6.0 + sin(p.y / 4.0 + time * 0.8) * 2.0 - time * 1.1) + sin(p.y / 3.0 + time);
      if (sw > 1.2) c = vec3(0.6, 0.33, 0.12);
      else if (sw < -1.2) c = vec3(0.2, 0.08, 0.03);
      c = mix(c, vec3(0.12, 0.05, 0.02), clamp(depth / 50.0, 0.0, 0.7));
    }
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

function buildScenery(g: Game): Scenery {
  const a = g.assets.desert, gfx = g.gfx;
  // the camera height never changes in this stage, so layers sit at fixed screen heights
  const layers = [
    new Parallax(gfx, a.sky, 0, 0.02, 0, 0),
    new Parallax(gfx, a.mesas, 1, 0.06, 0, 46),
    new Parallax(gfx, a.dunes, 2, 0.2, 0, 92),
    new Parallax(gfx, a.near, 3, 0.5, 0, 104),
  ];
  const mats: THREE.ShaderMaterial[] = [];
  for (const [p0, p1] of PITS) {
    const x0 = p0 * TS, x1 = (p1 + 1) * TS, y0 = FLOOR + 8, y1 = MAP_H * TS + 40;
    const m = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, top: { value: y0 } }, vertexShader: waterVert, fragmentShader: quicksandFrag, depthTest: false, depthWrite: false, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), m);
    mesh.position.set((x0 + x1) / 2, -(y0 + y1) / 2, 0);
    mesh.renderOrder = 33; // in front of the player, so you sink into it
    gfx.scene.add(mesh);
    mats.push(m);
  }
  return {
    update(camX, camY, t) {
      for (const l of layers) l.update(camX, camY);
      for (const m of mats) m.uniforms.time.value = t;
    },
  };
}

function buildDecor(g: Game): Sprite[] {
  const a = g.assets.desert, gfx = g.gfx;
  const out: Sprite[] = [];
  const put = (f: Frame, x: number, y: number, z: number, flip = false, tint = 1) => {
    const s = gfx.sprite(f, z);
    s.x = x; s.y = y; s.flip = flip;
    if (tint !== 1) s.setTint(tint, tint * 0.97, tint * 0.95);
    s.sync(); out.push(s);
    return s;
  };
  const gy = FLOOR + 2;
  // roadside: cacti, bones, wrecks, signs. Whizzing by during the ride.
  for (let x = 160, i = 0; x < 8400; x += 170 + ((x * 13) % 150), i++) {
    const k = i % 7;
    if (k === 0 || k === 3 || k === 5) put(a.cactus[i % 3], x, gy, 10, i % 2 === 0, 0.85);
    else if (k === 1) put(a.skull, x, gy, 13, i % 2 === 0);
    else if (k === 2) put(a.barrel, x, gy, 13);
    else if (k === 4) put(a.boulder[i % 2], x, gy + 4, 10, false, 0.75);
    else put(a.cactus[(i + 1) % 3], x, gy, 10, true, 0.7);
  }
  put(a.wreck, 1300, gy, 10, false, 0.85);
  put(a.wreck, 4400, gy, 10, true, 0.85);
  put(a.ribs, 2400, gy + 4, 10, false, 0.85);
  put(a.ribs, 6100, gy + 4, 10, true, 0.85);
  for (const x of [900, 3000, 5600, 7400]) put(a.sign, x, gy, 13);
  // big foreground cacti at the bottom edge sell the speed of the ride
  for (let x = 300; x < 8200; x += 420 + ((x * 7) % 260)) put(a.cactus[(x >> 5) % 3], x, FLOOR + 74, 55, (x >> 6) % 2 === 0, 0.35);
  // on foot
  put(a.sign, 8150, gy, 13);
  put(a.ribs, 645 * TS, gy + 4, 10, false, 0.85);
  put(a.cactus[0], 520 * TS, gy - TS, 10, false, 0.85);
  put(a.cactus[1], 566 * TS, gy, 10, true, 0.85);
  put(a.barrel, 572 * TS, gy, 13); put(a.barrel, 573 * TS + 4, gy, 13);
  put(a.skull, 606 * TS, gy, 13);
  put(a.cactus[2], 650 * TS, gy, 10, false, 0.85);
  put(a.wreck, 676 * TS, gy, 10, true, 0.8);
  put(a.skull, 688 * TS, gy, 13, true);
  // the nest: a pair of round boulders flank the spot where it rises
  put(a.boulder[0], WORM_HOME - 46, gy + 6, 13);
  put(a.boulder[1], WORM_HOME + 46, gy + 6, 13, true);
  put(a.ribs, ARENA_X + 40, gy + 4, 10, false, 0.75);
  put(a.ribs, ARENA_X + VW - 40, gy + 4, 10, true, 0.75);
  for (let x = ARENA_X + 10; x < ARENA_X + VW; x += 90) put(a.skull, x, gy, 13, x % 2 === 0);
  return out;
}

export { VH };
