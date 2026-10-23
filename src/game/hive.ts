import type { Sprite } from '../engine/gfx';
import { VH } from '../engine/gfx';
import type { Game } from './game';
import type { Hittable } from './weapons';
import { Enemy, EnemyBullet } from './enemies';
import { makeBody, type Body } from './world';
import { explode, Anim } from './effects';
import { buildHive, type HiveArt } from '../art/hive';

// Stage 5's residents: the armored brood pods grown into the walls, the hatchlings
// that burst out of them, acid pustules, and the boss at the heart of it all, the Hive Queen.

const art = (): HiveArt => buildHive();
const MAX_HATCHLINGS = 6;
const hatchlings = (g: Game) => g.enemies.filter((e) => e instanceof Hatchling && !e.dead).length;

function splat(g: Game, x: number, y: number) {
  g.addFx(new Anim(g, art().splat, x, y, 4, 40));
}

/** A sprite left behind after its owner is gone (a dead brood pod). */
class Remains {
  dead = false;
  constructor(public sprite: Sprite) {}
  update() {}
  destroy() { this.sprite.remove(); }
}

export type PodDir = 'up' | 'down' | 'left';
const NORMAL: Record<PodDir, [number, number, number]> = { up: [0, -1, 0], down: [0, 1, Math.PI], left: [-1, 0, -Math.PI / 2] };

/** An armored pod in the hive wall. Every so often its seams light up and a hatchling bursts out. */
export class BroodPod extends Enemy {
  nx: number; ny: number;
  phase: 'wait' | 'charge' | 'open' = 'wait';
  phaseT = 0;
  wait: number;
  constructor(g: Game, x: number, y: number, public dir: PodDir) {
    super(g, x, y, art().broodPod[0], 21);
    [this.nx, this.ny] = NORMAL[dir];
    this.sprite.rot = NORMAL[dir][2];
    this.hp = 12; this.score = 800;
    this.touch = false;
    this.cullMargin = 120;
    this.wait = 30 + Math.random() * 50;
  }
  /** The top of the pod, where the hatchlings come out. */
  mouth(): [number, number] { return [this.x + this.nx * 26, this.y + this.ny * 26]; }
  box(): [number, number, number, number] {
    const cx = this.x + this.nx * 18, cy = this.y + this.ny * 18;
    return this.dir === 'left' ? [cx - 14, cy - 12, cx + 14, cy + 12] : [cx - 12, cy - 14, cx + 12, cy + 14];
  }
  update() {
    const g = this.g;
    this.phaseT++;
    const active = this.onScreen(-6) && !g.bossActive;
    let k = 0, jig = 0;
    switch (this.phase) {
      case 'wait':
        if (active && --this.wait <= 0) {
          if (hatchlings(g) < MAX_HATCHLINGS) { this.phase = 'charge'; this.phaseT = 0; g.audio.sfx('charge', 0.6); }
          else this.wait = 40;
        }
        break;
      case 'charge':
        k = 1; jig = this.phaseT % 4 < 2 ? 1 : -1;
        if (this.phaseT > 34) { this.phase = 'open'; this.phaseT = 0; }
        break;
      case 'open':
        k = 2;
        if (this.phaseT === 3) this.burst();
        if (this.phaseT > 24) { this.phase = 'wait'; this.phaseT = 0; this.wait = 90 + Math.random() * 80; }
        break;
    }
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(art().broodPod[k]);
    s.x = this.x + (this.dir === 'left' ? 0 : jig); s.y = this.y + (this.dir === 'left' ? jig : 0);
    s.sync();
  }
  private burst() {
    const g = this.g;
    const [mx, my] = this.mouth();
    const [px] = g.player.center();
    const toward = Math.sign(px - mx) || -1;
    let vx = 0, vy = 0;
    if (this.dir === 'up') { vx = toward * (0.8 + Math.random() * 0.8); vy = -3.6; }
    else if (this.dir === 'down') { vx = toward * 0.4; vy = 0.5; }
    else { vx = -2 - Math.random(); vy = -1.6; }
    g.enemies.push(new Hatchling(g, mx - this.nx * 8, my - this.ny * 8, vx, vy, this.nx, this.ny));
    splat(g, mx, my);
    g.audio.sfx('hatch');
  }
  die() {
    const g = this.g;
    this.dead = true;
    g.addScore(this.score);
    const [mx, my] = this.mouth();
    explode(g, mx, my, 'M');
    splat(g, mx, my);
    // the cracked, dead shell stays put
    const s = g.gfx.sprite(art().broodPod[3], 21);
    s.x = this.x; s.y = this.y; s.rot = this.sprite.rot; s.sync();
    g.misc.push(new Remains(s));
  }
}

/** An armored hatchling. It scuttles toward you and pounces when it gets close. */
export class Hatchling extends Enemy {
  body: Body;
  phase: 'out' | 'air' | 'crawl' = 'out';
  dir = -1;
  hopT: number;
  spin = 0;
  constructor(g: Game, x: number, y: number, public vx0: number, public vy0: number, public ox = 0, public oy = -1) {
    super(g, x, y, art().hatchlingCurl, 19);
    this.body = makeBody(x, y + 6, 14, 10);
    this.hp = 2; this.score = 100;
    this.boomSize = 'S';
    this.hopT = 40 + Math.random() * 40;
    this.cullMargin = 60;
    this.dir = Math.sign(vx0) || -1;
    // eggs hatch straight into scuttling
    if (ox === 0 && oy === 0) { this.phase = 'crawl'; this.body.y = y; }
  }
  box(): [number, number, number, number] {
    const b = this.body;
    if (this.phase === 'out') return [this.x - 6, this.y - 6, this.x + 6, this.y + 6];
    return [b.x - 10, b.y - 12, b.x + 10, b.y];
  }
  update() {
    const g = this.g, b = this.body;
    const s = this.sprite;
    const [px] = g.player.center();
    this.touch = this.phase !== 'out' || this.t > 6;
    if (this.phase === 'out') {
      // bursting out of the pod
      this.x += this.ox * 1.6; this.y += this.oy * 1.6;
      b.x = this.x; b.y = this.y + 6;
      if (this.t >= 7) { this.phase = 'air'; b.vx = this.vx0; b.vy = this.vy0; }
      s.setFrame(art().hatchlingCurl); s.rot = 0;
    } else {
      if (this.phase === 'crawl') {
        if (b.onGround) {
          if (this.t % 30 === 0) this.dir = Math.sign(px - b.x) || this.dir;
          b.vx = this.dir * 0.9;
          // don't run off ledges into the acid unless it is chasing you there
          if (!g.world.groundBelow(b.x + this.dir * 9, b.y + 1, 3) && Math.abs(px - b.x) > 40) { this.dir = -this.dir; b.vx = this.dir * 0.9; }
          if (--this.hopT <= 0 && Math.abs(px - b.x) < 90) {
            b.vy = -3.6; b.vx = Math.max(-2.2, Math.min(2.2, (px - b.x) / 26));
            this.hopT = 60 + Math.random() * 60;
            this.phase = 'air';
            g.audio.sfx('hiss', 0.25);
          }
        } else this.phase = 'air';
      }
      b.vy = Math.min(5, b.vy + 0.2);
      g.world.move(b);
      if (b.hitWall) { this.dir = -this.dir; b.vx = -b.vx; }
      if (this.phase === 'air' && b.onGround) { this.phase = 'crawl'; this.dir = Math.sign(px - b.x) || this.dir; }
      this.x = b.x; this.y = b.y - 6;
      if (b.y > g.gfx.camY + VH + 30) { this.dead = true; return; }
      if (this.phase === 'air') { s.setFrame(art().hatchlingCurl); this.spin += 0.3 * (b.vx >= 0 ? 1 : -1); s.rot = this.spin; s.flip = false; }
      else { s.setFrame(art().hatchling[Math.floor(this.t / 5) % 2]); s.rot = 0; s.flip = this.dir < 0; }
    }
    this.baseUpdate();
    if (this.phase === 'crawl') { s.x = b.x; s.y = b.y; }
    else { s.x = this.x; s.y = this.y; }
    s.sync();
  }
  die() {
    this.dead = true;
    this.g.addScore(this.score);
    const [x0, y0, x1, y1] = this.box();
    splat(this.g, (x0 + x1) / 2, (y0 + y1) / 2);
    explode(this.g, (x0 + x1) / 2, (y0 + y1) / 2, 'S', false);
    this.g.audio.sfx('smallBoom', 0.6);
  }
}

/** A swollen sac of acid. It fills up, then bursts in a spray of globs. */
export class Pustule extends Enemy {
  k = 0;
  phaseT: number;
  constructor(g: Game, x: number, y: number) {
    super(g, x, y, art().pustule[0], 20);
    this.hp = 5; this.score = 300;
    this.phaseT = -(30 + Math.random() * 60);
  }
  box(): [number, number, number, number] {
    const r = this.k === 3 ? 4 : 8 + this.k * 2;
    return [this.x - r, this.y - r * 2 - 2, this.x + r, this.y];
  }
  update() {
    const g = this.g;
    if (this.onScreen(-10) && g.player.alive) this.phaseT++;
    const T = this.phaseT;
    this.k = T < 60 ? 0 : T < 80 ? 1 : T < 100 ? 2 : 3;
    if (T === 100) this.burst();
    if (T > 150) this.phaseT = 0;
    this.touch = this.k !== 3;
    this.invulnerable = this.k === 3;
    this.baseUpdate();
    const s = this.sprite;
    s.setFrame(art().pustule[this.k]);
    s.x = this.x + (this.k === 2 && T % 4 < 2 ? 1 : 0); s.y = this.y; s.sync();
  }
  private burst() {
    const g = this.g;
    const [px] = g.player.center();
    const dir = Math.sign(px - this.x) || -1;
    for (let i = 0; i < 3; i++) {
      const vx = dir * (0.7 + i * 0.75), vy = -3.6 - (i === 1 ? 0.6 : 0);
      g.eBullets.push(new EnemyBullet(g, this.x, this.y - 20, vx, vy, g.assets.fx.spit, 3.5, 0.12));
    }
    splat(g, this.x, this.y - 16);
    g.audio.sfx('splash', 0.5);
  }
}

/** Fired by the Hive Queen. Lands, glows, splits open. */
export class Egg extends Enemy {
  body: Body;
  landedT = -1;
  constructor(g: Game, x: number, y: number, vx: number, vy: number) {
    super(g, x, y, art().egg[0], 19);
    this.body = makeBody(x, y, 12, 14);
    this.body.vx = vx; this.body.vy = vy;
    this.hp = 2; this.score = 100;
    this.boomSize = 'S';
  }
  box(): [number, number, number, number] { const b = this.body; return [b.x - 6, b.y - 15, b.x + 6, b.y]; }
  update() {
    const g = this.g, b = this.body;
    b.vy = Math.min(5, b.vy + 0.15);
    g.world.move(b);
    if (b.hitWall) b.vx = -b.vx * 0.5;
    if (b.onGround) {
      b.vx *= 0.8;
      if (this.landedT < 0) { this.landedT = 0; g.audio.sfx('land', 0.5); }
    }
    if (this.landedT >= 0 && ++this.landedT > 70) {
      this.dead = true;
      splat(g, b.x, b.y - 8);
      g.audio.sfx('hatch', 0.6);
      if (hatchlings(g) < MAX_HATCHLINGS + 2) g.enemies.push(new Hatchling(g, b.x, b.y, Math.sign(g.player.center()[0] - b.x) || -1, 0, 0, 0));
      return;
    }
    this.x = b.x; this.y = b.y;
    this.baseUpdate();
    const s = this.sprite;
    const glow = this.landedT > 30 ? (this.t % (this.landedT > 55 ? 4 : 8) < 2 ? 1 : 0) : 0;
    s.setFrame(art().egg[glow]);
    s.x = b.x + (glow ? 1 : 0); s.y = b.y - 9; s.sync();
  }
  die() {
    this.dead = true;
    this.g.addScore(this.score);
    splat(this.g, this.body.x, this.body.y - 8);
    explode(this.g, this.body.x, this.body.y - 8, 'S');
  }
}

/** A wall of green plasma racing along the floor. Jump it or hang from the roof. */
export class Shockwave {
  dead = false;
  sprite: Sprite;
  t = 0;
  constructor(public g: Game, public x: number, public y: number, public vx: number, public limitX: number) {
    this.sprite = g.gfx.sprite(art().plasma[0], 38, true);
  }
  update() {
    const g = this.g;
    this.t++;
    this.x += this.vx;
    const s = this.sprite;
    s.setFrame(art().plasma[Math.floor(this.t / 3) % 3]);
    s.flip = Math.floor(this.t / 9) % 2 === 1;
    s.x = this.x; s.y = this.y; s.sync();
    if (this.t % 4 === 0) g.addFx(new Anim(g, g.assets.fx.spark, this.x + 12, this.y - 4 - Math.random() * 10, 2, 42, true));
    if (this.x < this.limitX) { this.dead = true; return; }
    for (const p of g.livePlayers()) {
      if (!p.alive) continue;
      const b = p.box();
      if (b[2] > this.x - 18 && b[0] < this.x + 18 && b[3] > this.y - 28 && b[1] < this.y) p.hurt();
    }
  }
  destroy() { this.sprite.remove(); }
}

// ---------------------------------------------------------------- the Hive Queen

/** A hittable region of the boss. */
class Part implements Hittable {
  dead = false;
  invulnerable = false;
  deflect = false;
  b: [number, number, number, number] = [0, 0, 0, 0];
  constructor(public onHit: (d: number) => void) {}
  box() { return this.b; }
  hit(d: number) { this.onHit(d); }
}

type Mode = 'intro' | 'idle' | 'eggs' | 'quake' | 'spit' | 'brood' | 'dying';
const CORE_DMG = 2.4, HEAD_DMG = 1;

/**
 * The queen of the hive: a towering armored xeno with a crested skull, scythe forelimbs
 * and a vast egg sac trailing behind her. The core in her chest is sealed under armor
 * plates; they part when she fires eggs and after she slams the floor. Her head can be hit
 * from the ribs whenever she isn't shielding it.
 */
export class HiveQueen {
  dead = false;
  hp = 240;
  maxHp = 240;
  mode: Mode = 'intro';
  modeT = 0;
  t = 0;
  x: number;           // middle of the torso
  rise = 0;            // how far she has reared up
  coreK = 0;
  headK = 0;
  armLift = 0;
  flashT = 0;
  cooldown = 60;
  attacks = 0;
  enraged = false;
  sink = 0;
  abdomenS: Sprite; torsoS: Sprite; coreS: Sprite; headS: Sprite;
  arms: Sprite[];
  legs: Sprite[] = [];
  holes: Sprite[] = [];
  core: Part; head: Part; shell: Part;
  constructor(public g: Game, public homeX: number, public floor: number, public arenaX: number, public ceil: number) {
    const a = art(), gx = g.gfx;
    this.x = homeX + 260;
    for (let i = 0; i < 6; i++) { const s = gx.sprite(a.leg, 9); s.setFlashColor(1, 1, 1); this.legs.push(s); }
    this.abdomenS = gx.sprite(a.abdomen, 8.5);
    this.torsoS = gx.sprite(a.torso, 11);
    this.coreS = gx.sprite(a.core[0], 11.3);
    this.headS = gx.sprite(a.head[0], 11.5);
    this.arms = [gx.sprite(a.arm, 10.5), gx.sprite(a.arm, 11.6)];
    for (const s of [this.abdomenS, this.torsoS, this.coreS, this.headS, ...this.arms]) s.setFlashColor(1, 1, 1);
    // two pods in the chamber roof that she can call hatchlings down from
    for (const hx of [arenaX + 110, arenaX + 180]) {
      const s = gx.sprite(a.broodPod[0], 21);
      s.x = hx; s.y = ceil; s.rot = Math.PI; s.sync();
      this.holes.push(s);
    }
    this.core = new Part((d) => this.damage(d * CORE_DMG, true));
    this.core.deflect = true;
    this.head = new Part((d) => this.damage(d * HEAD_DMG, false));
    this.shell = new Part(() => {});
    this.shell.invulnerable = true; this.shell.deflect = true;
    g.audio.sfx('rumble');
    this.draw();
  }
  get corePos(): [number, number] { return [this.x - 4, this.floor - 38 - this.rise * 0.5 + this.sink]; }
  get headPos(): [number, number] {
    const sway = Math.sin(this.t / 45) * 5;
    return [this.x - 22 + sway, this.floor - 104 - this.rise + this.sink];
  }
  parts(): Hittable[] { return [this.core, this.head, this.shell]; }
  set(m: Mode) { this.mode = m; this.modeT = 0; }

  private damage(d: number, core: boolean) {
    const g = this.g;
    if (this.mode === 'dying' || this.mode === 'intro') return;
    this.hp -= d;
    this.flashT = core ? 4 : 3;
    g.audio.sfx('hit');
    if (!this.enraged && this.hp > 0 && this.hp < this.maxHp * 0.35) {
      this.enraged = true;
      g.audio.sfx('roar'); g.gfx.shake = 5;
      g.banner = { text: 'ENRAGED!', t: 120 };
    }
    if (this.hp <= 0) this.die();
  }
  private die() {
    const g = this.g;
    this.hp = 0;
    this.set('dying');
    g.addScore(30000);
    g.audio.sfx('roar');
    g.eBullets.forEach((b) => (b.dead = true));
    for (const e of g.enemies) if (e instanceof Hatchling || e instanceof Egg) e.die();
    for (const m of g.misc) if (m instanceof Shockwave) m.dead = true;
  }

  update() {
    const g = this.g;
    this.t++; this.modeT++;
    if (this.flashT > 0) this.flashT--;
    const k = this.enraged ? 0.7 : 1;
    const T = this.modeT;
    this.coreK = 0; this.headK = 0;
    let rise = 0, lift = 0;
    for (const h of this.holes) h.setFrame(art().broodPod[0]);
    switch (this.mode) {
      case 'intro':
        // stalking into the chamber
        this.x += (this.homeX - this.x) * 0.03;
        if (T % 12 === 0) g.gfx.shake = Math.max(g.gfx.shake, 1.5);
        if (T > 90 && T < 140) { this.headK = 1; rise = 8; lift = 0.6; }
        if (T === 92) { g.audio.sfx('roar'); g.gfx.shake = 5; }
        if (T > 150) { this.x = this.homeX; this.set('idle'); this.cooldown = 40; }
        break;
      case 'idle':
        rise = Math.sin(this.t / 30) * 2;
        if (--this.cooldown <= 0 && g.player.alive) {
          this.attacks++;
          const a = this.attacks % 6;
          const next: Mode = a === 1 ? 'eggs' : a === 2 ? 'spit' : a === 3 ? 'quake' : a === 4 ? 'brood' : a === 5 ? 'spit' : 'quake';
          this.set(next);
          if (next === 'quake') g.audio.sfx('charge');
        }
        break;
      case 'eggs': {
        // the armor plates part and she fires eggs from her core
        this.coreK = T < 26 * k ? 1 : 2;
        const shots = this.enraged ? [30, 44, 58, 72] : [36, 60, 84];
        for (const at of shots) if (T === Math.round(at * k) + 4) this.fireEgg();
        if (T > 130 * k) { this.set('idle'); this.cooldown = 50 * k; }
        break;
      }
      case 'quake': {
        // rear up with the scythes raised, then drive them into the floor
        const slams = this.enraged ? [40, 80] : [44];
        const next = slams.find((at) => T <= Math.round(at * k));
        if (next !== undefined) {
          const left = Math.round(next * k) - T;
          const wind = Math.min(1, (30 - Math.min(30, left)) / 30);
          rise = 14 * wind; lift = wind; this.headK = 1;
          if (left === 0) this.slam();
        } else { this.coreK = 2; rise = -4; } // the slam leaves her core open
        if (T > Math.round(slams[slams.length - 1] * k) + 70) { this.set('idle'); this.cooldown = 50 * k; }
        break;
      }
      case 'spit': {
        this.headK = T > 14 ? 1 : 0;
        rise = T > 14 ? 4 : 0;
        const shots = this.enraged ? [20, 30, 40, 50, 60] : [22, 40, 58];
        for (const at of shots) if (T === Math.round(at * k)) this.spit();
        if (T === 16) g.audio.sfx('hiss');
        if (T > 90 * k) { this.set('idle'); this.cooldown = 40 * k; }
        break;
      }
      case 'brood': {
        this.headK = T < 40 ? 1 : 0;
        rise = T < 40 ? 10 : 0; lift = T < 40 ? 0.4 : 0;
        if (T === 6) { g.audio.sfx('roar', 0.6); g.gfx.shake = 3; }
        const drops = this.enraged ? [40, 60, 80, 100] : [44, 80, 116];
        drops.forEach((at, i) => {
          const h = this.holes[i % 2];
          const dt = Math.round(at * k) - T;
          if (dt > 0 && dt < 24) h.setFrame(art().broodPod[1]);
          else if (dt <= 0 && dt > -16) h.setFrame(art().broodPod[2]);
          if (dt === 0 && hatchlings(g) < MAX_HATCHLINGS) {
            g.enemies.push(new Hatchling(g, h.x, h.y + 16, (i % 2 ? -1 : 1) * 0.5, 0.5, 0, 1));
            g.audio.sfx('hatch');
          }
        });
        if (T > 140 * k) { this.set('idle'); this.cooldown = 50 * k; }
        break;
      }
      case 'dying': {
        // the core overloads and tears her apart
        this.headK = 1;
        this.coreK = T % 6 < 3 ? 2 : 1;
        rise = T < 60 ? 16 : 16 - (T - 60) * 0.2;
        lift = T < 120 ? 1 : 0;
        if (T % 7 === 0 && T < 230) explode(g, this.x + (Math.random() - 0.6) * 170, this.floor - 10 - Math.random() * 120, Math.random() < 0.3 ? 'L' : 'M', T % 14 === 0);
        if (T === 40) { g.audio.sfx('bigBoom'); g.gfx.shake = 8; }
        if (T > 150) this.sink += 0.8;
        if (T > 300) { this.dead = true; g.onBossDefeated(); return; }
        break;
      }
    }
    this.rise += (rise - this.rise) * 0.2;
    this.armLift += (lift - this.armLift) * 0.2;
    // the core takes real damage only while it is laid open
    this.core.invulnerable = this.coreK < 2 || this.mode === 'dying' || this.mode === 'intro';
    this.head.invulnerable = this.mode === 'dying' || this.mode === 'intro';
    this.collideBody();
    this.draw();
  }

  /** Walking into her is fatal. */
  private collideBody() {
    if (this.mode === 'dying') return;
    for (const p of this.g.livePlayers()) {
      if (!p.alive) continue;
      const b = p.box();
      const torso = b[2] > this.x - 38 && b[0] < this.x + 120 && b[3] > this.floor - 96 - this.rise;
      if (torso) p.hurt();
    }
  }

  private fireEgg() {
    const g = this.g;
    const [cx, cy] = this.corePos;
    g.enemies.push(new Egg(g, cx - 10, cy, -1.4 - Math.random() * 2.2, -2.6 - Math.random() * 1.4));
    g.addFx(new Anim(g, g.assets.fx.flash, cx - 10, cy, 2, 36, true));
    g.audio.sfx('hatch', 0.7);
  }
  private slam() {
    const g = this.g;
    g.misc.push(new Shockwave(g, this.x - 60, this.floor + 4, -3, this.arenaX - 40));
    g.audio.sfx('quake');
    g.gfx.shake = Math.max(g.gfx.shake, 7);
    for (let i = 0; i < 4; i++) g.addFx(new Anim(g, g.assets.fx.boomS, this.x - 56 + i * 8, this.floor - 4, 3, 40));
  }
  private spit() {
    const g = this.g;
    const [hx, hy] = this.headPos;
    const mx = hx - 26, my = hy + 3;
    const [px, py] = g.player.center();
    const dx = px - mx;
    const tFly = Math.max(36, Math.abs(dx) / 2.4);
    const vx = dx / tFly, vy = (py - my) / tFly - 0.08 * tFly / 2;
    const n = this.enraged ? 2 : 1;
    for (let i = 0; i < n; i++) g.eBullets.push(new EnemyBullet(g, mx, my, vx * (1 - i * 0.25), Math.max(-5, vy) - i * 0.5, g.assets.fx.spit, 3.5, 0.08));
    g.addFx(new Anim(g, g.assets.fx.flash, mx, my, 2, 36, true));
    g.audio.sfx('hiss', 0.6);
  }

  private draw() {
    const a = art();
    const fl = this.flashT > 0 ? 0.6 : this.mode === 'dying' && this.modeT % 6 < 3 ? 0.4 : 0;
    const base = this.floor + this.sink;
    const moving = this.mode === 'intro';
    // the egg sac trails out behind her to the right
    const ab = this.abdomenS;
    ab.x = this.x + 92; ab.y = base - 40 + Math.sin(this.t / 25) * 1.5; ab.flash = fl * 0.5; ab.sync();
    // legs under the egg sac and torso
    this.legs.forEach((s, i) => {
      const j = i % 3, side = i < 3 ? -1 : 1;
      const ph = Math.sin(this.t / (moving ? 3 : 16) + i * 2.1) * (moving ? 0.35 : 0.08);
      s.x = this.x + 10 + j * 46 + (side > 0 ? 24 : 0); s.y = base - 34;
      s.flip = side < 0;
      s.rot = side * (0.55 + ph);
      s.flash = fl * 0.6;
      s.sync();
    });
    const t = this.torsoS;
    t.x = this.x; t.y = base - 52 - this.rise * 0.5; t.flash = fl * 0.6; t.sync();
    const c = this.coreS;
    const [cx, cy] = this.corePos;
    c.setFrame(a.core[this.coreK]);
    c.x = cx; c.y = cy; c.flash = fl; c.sync();
    const h = this.headS;
    const [hx, hy] = this.headPos;
    h.setFrame(a.head[this.headK]);
    h.x = hx + 26; h.y = hy;   // the frame is anchored at the back of the skull
    h.rot = this.mode === 'dying' ? -Math.min(0.6, this.modeT / 200) : (this.headK ? -0.12 : 0) + Math.sin(this.t / 45) * 0.04;
    h.flash = fl; h.sync();
    // scythe arms: hang forward at rest, swing up as she winds up a slam
    this.arms.forEach((s, i) => {
      s.x = this.x - 38 + i * 12; s.y = base - 90 - this.rise * 0.8;
      s.rot = 0.45 + i * 0.15 + this.armLift * (2 - i * 0.3) + Math.sin(this.t / 20 + i) * 0.05;
      s.flash = fl * 0.6; s.sync();
    });
    // hit boxes follow the art
    this.core.b = [cx - 15, cy - 22, cx + 15, cy + 22];
    this.head.b = [hx - 38, hy - 14, hx + 34, hy + 14];
    this.shell.b = this.mode === 'intro' || this.mode === 'dying' ? [0, 0, 0, 0] : [this.x - 44, base - 104 - this.rise, this.x + 140, base];
  }
  destroy() {
    for (const s of [...this.legs, this.abdomenS, this.torsoS, this.coreS, this.headS, ...this.arms, ...this.holes]) s.remove();
  }
}
