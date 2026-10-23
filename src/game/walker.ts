import type { Sprite } from '../engine/gfx';
import type { Game } from './game';
import type { Hittable } from './weapons';
import { Enemy } from './enemies';
import { explode, Debris, Anim } from './effects';
import { snowBurst } from './snowfoes';

// The stage 4 boss: the Glacier Walker, a two-legged assault mech that guards the
// outpost. It swings a piston hammer, fires cluster mines from its back pod and
// jump-jets across the yard. Its reactor core is exposed while it vents.

type Mode = 'drop' | 'vent' | 'walk' | 'raise' | 'slam' | 'recover' | 'toss' | 'crouch' | 'leap' | 'dying';

const D = Math.PI / 180;
/** Arm angle while carrying the hammer upright (0 = forward, -90 = straight up). */
const CARRY = -60;
/** Which way the hammer points while carried: upright, leaning back a touch. */
const SHOULDER = -100;
/** Distance from the grip to the middle of the hammer head. */
const HEAD = 44;

/** The hammer head: solid armour that soaks up bullets, and it only hurts while it is being swung. */
class Hammer implements Hittable {
  dead = false;
  invulnerable = true;
  deflect = true;
  cx = 0; cy = 0;
  box(): [number, number, number, number] { return [this.cx - 17, this.cy - 14, this.cx + 17, this.cy + 14]; }
  hit() {}
}

export class Walker implements Hittable {
  dead = false;
  hp = 150;
  maxHp = 150;
  invulnerable = true;
  deflect = false;
  x: number; y: number;
  vx = 0; vy = 0;
  facing = -1;
  mode: Mode = 'drop';
  modeT = 0;
  t = 0;
  flashT = 0;
  enraged = false;
  intro = true;
  /** Arm angle in degrees (facing right) and the direction the hammer points. */
  arm = CARRY;
  hammerDir = SHOULDER;
  hammerFrame = 0;
  hammerBehind = true;
  nextAttack = 0;
  leapTx = 0;
  hammer = new Hammer();
  body: Sprite; armS: Sprite; hammerS: Sprite; shadow: Sprite;
  constructor(public g: Game, public left: number, public right: number, public floor: number) {
    const a = g.assets.snow;
    this.x = (left + right) / 2 + 60; this.y = floor - 260;
    this.body = g.gfx.sprite(a.walker.stand[0], 24);
    this.body.setFlashColor(1, 1, 1);
    this.armS = g.gfx.sprite(a.arm, 26);
    this.armS.setFlashColor(1, 1, 1);
    this.hammerS = g.gfx.sprite(a.hammer[0], 23);
    this.shadow = g.gfx.sprite(a.shadow, 13);
    this.shadow.x = this.x; this.shadow.y = floor;
    g.audio.sfx('rumble');
  }
  get alive() { return this.mode !== 'dying'; }
  set(m: Mode) { this.mode = m; this.modeT = 0; }
  box(): [number, number, number, number] {
    if (this.mode === 'dying') return [0, 0, 0, 0];
    return [this.x - 24, this.y - 84, this.x + 24, this.y - 20];
  }
  parts(): Hittable[] { return [this.hammer, this]; }
  hit(dmg: number) {
    if (this.dead || this.invulnerable || this.mode === 'dying') return;
    const g = this.g;
    // the reactor is wide open while it vents after a hammer strike
    this.hp -= this.mode === 'recover' ? dmg * 2 : dmg;
    this.flashT = 4;
    g.audio.sfx('hit');
    if (!this.enraged && this.hp > 0 && this.hp < this.maxHp * 0.4) {
      this.enraged = true;
      g.audio.sfx('roar'); g.gfx.shake = 5;
      g.banner = { text: 'OVERDRIVE', sub: 'REACTOR CRITICAL', t: 100 };
    }
    if (this.hp <= 0) this.die();
  }
  private die() {
    const g = this.g;
    this.hp = 0;
    this.set('dying');
    this.invulnerable = true;
    g.addScore(20000);
    g.audio.sfx('roar');
    g.eBullets.forEach((b) => (b.dead = true));
    for (const e of g.enemies) if (e instanceof Mine || e instanceof SnowWave) e.dead = true;
  }

  // ---------------------------------------------------------------- behaviour
  update() {
    const g = this.g;
    this.t++; this.modeT++;
    if (this.flashT > 0) this.flashT--;
    const fast = this.enraged ? 1.5 : 1;
    const [px] = g.player.center();
    const face = () => { this.facing = px < this.x ? -1 : 1; };
    let frame = g.assets.snow.walker.stand[Math.floor(this.t / 20) % 2];
    let armTarget = CARRY, armRate = 0.2;
    this.hammerFrame = 0; this.hammerBehind = true;
    this.invulnerable = this.mode === 'drop' || this.mode === 'dying';
    switch (this.mode) {
      case 'drop': {
        // drops in on its jump jets
        this.vy = Math.min(8, this.vy + 0.3);
        this.y += this.vy;
        frame = g.assets.snow.walker.air;
        armTarget = CARRY;
        this.jets();
        if (this.y >= this.floor) { this.y = this.floor; this.land(false); this.set('vent'); }
        break;
      }
      case 'vent':
        face();
        frame = g.assets.snow.walker.vent;
        if (this.modeT === 1) g.audio.sfx('roar');
        if (this.modeT % 6 === 0) g.addFx(new Anim(g, g.assets.snow.puff, this.x - this.facing * 16, this.y - 92, 3, 30));
        if (this.modeT > (this.intro ? 70 : 40)) { this.intro = false; this.set('walk'); this.nextAttack = 40 + Math.floor(Math.random() * 30); }
        break;
      case 'walk': {
        face();
        const sp = 0.65 * fast;
        if (Math.abs(px - this.x) > 50) this.x += this.facing * sp;
        this.x = Math.max(this.left + 36, Math.min(this.right - 36, this.x));
        frame = g.assets.snow.walker.walk[Math.floor(this.t / 9) % 4];
        if (this.modeT >= this.nextAttack / fast) {
          const near = Math.abs(px - this.x) < 120;
          const r = Math.random();
          if (near && r < 0.65) this.set('raise');
          else if (r < 0.5 || near) this.set('toss');
          else this.set('crouch');
        }
        break;
      }
      case 'raise':
        // wind up: the hammer goes back over the cockpit
        armTarget = -165; armRate = 0.12;
        this.hammerBehind = false;
        if (this.modeT > 28 / fast) { this.set('slam'); g.audio.sfx('grapple', 0.6); }
        break;
      case 'slam':
        armTarget = 45; armRate = 0.45;
        this.hammerBehind = false;
        if (this.modeT === Math.ceil(8 / fast)) {
          this.arm = 45; this.hammerDir = 75;
          this.slamImpact();
          this.set('recover');
        }
        break;
      case 'recover':
        // the hammer is buried in the ice and the reactor vents: the time to strike
        armTarget = 45; armRate = 1;
        this.hammerBehind = false;
        this.hammerFrame = this.modeT < 30 ? 1 : 0;
        frame = Math.floor(this.modeT / 4) % 2 ? g.assets.snow.walker.vent : g.assets.snow.walker.crouch;
        if (this.modeT > 50 / fast) { this.set(this.enraged && Math.random() < 0.4 ? 'raise' : 'walk'); this.nextAttack = 50 + Math.floor(Math.random() * 40); }
        break;
      case 'toss': {
        face();
        // plants its feet and fires a salvo from the back pod
        frame = g.assets.snow.walker.crouch;
        armTarget = CARRY;
        const n = this.enraged ? 5 : 3;
        const every = 12;
        if (this.modeT >= 22 && (this.modeT - 22) % every === 0 && (this.modeT - 22) / every < n) this.fireMine((this.modeT - 22) / every, n);
        if (this.modeT > 22 + n * every + 20) { this.set('walk'); this.nextAttack = 70 + Math.floor(Math.random() * 50); }
        break;
      }
      case 'crouch':
        face();
        frame = g.assets.snow.walker.crouch;
        armTarget = CARRY;
        if (this.modeT > 24 / fast) {
          // leap at the player, or past them if they are hugging a wall
          const tx = Math.max(this.left + 40, Math.min(this.right - 40, px));
          this.vy = -7.2;
          this.vx = (tx - this.x) / ((2 * 7.2) / 0.3);
          this.leapTx = tx;
          g.audio.sfx('jets');
          this.set('leap');
        }
        break;
      case 'leap':
        frame = g.assets.snow.walker.air;
        armTarget = CARRY;
        if (this.vy < 2) this.jets();
        this.vy += 0.3;
        this.x += this.vx; this.y += this.vy;
        if (this.vy > 0 && this.y >= this.floor) {
          this.y = this.floor; this.vx = 0; this.vy = 0;
          this.land(true);
          this.set('walk');
          this.nextAttack = 60 + Math.floor(Math.random() * 40);
        }
        break;
      case 'dying': {
        frame = this.modeT < 100 ? g.assets.snow.walker.vent : g.assets.snow.walker.down;
        if (this.modeT % 9 === 0 && this.modeT < 150) explode(g, this.x + (Math.random() - 0.5) * 50, this.y - 20 - Math.random() * 60, this.modeT % 27 === 0 ? 'M' : 'S');
        if (this.modeT === 100) {
          // the reactor goes up and the walker comes apart
          g.audio.sfx('bigBoom'); g.gfx.shake = 8;
          explode(g, this.x, this.y - 50, 'L');
          snowBurst(g, this.x, this.y - 10, 10);
          for (let i = 0; i < 18; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
            const sp = 2 + Math.random() * 4;
            g.addFx(new Debris(g, g.assets.snow.scrap[i % 2], this.x, this.y - 50, Math.cos(a) * sp, Math.sin(a) * sp, 90, 0.2, 27));
          }
        }
        armTarget = this.modeT < 100 ? -30 : 80;
        if (this.modeT > 260) { this.dead = true; g.onBossDefeated(); }
        break;
      }
    }
    if (this.mode !== 'slam' || this.modeT < 8 / fast) this.arm += (armTarget - this.arm) * armRate;
    // the hammer trails the arm on a swing and hangs down otherwise
    const hang = this.mode === 'raise' || this.mode === 'slam' ? this.arm : this.mode === 'recover' ? 75 : this.mode === 'dying' && this.modeT >= 100 ? 90 : SHOULDER;
    this.hammerDir += (hang - this.hammerDir) * (this.mode === 'slam' ? 0.6 : 0.25);
    if (this.mode === 'dying' && this.modeT >= 100) this.hammerS.visible = false;

    // contact: the hull, and the hammer while it is moving fast
    if (this.mode !== 'dying') {
      const [gx, gy] = this.grip();
      const dir = this.facing > 0 ? this.hammerDir * D : Math.PI - this.hammerDir * D;
      this.hammer.cx = gx + Math.cos(dir) * HEAD; this.hammer.cy = gy + Math.sin(dir) * HEAD;
      const hot = this.mode === 'slam' || this.mode === 'leap' || this.mode === 'drop';
      for (const p of g.livePlayers()) {
        if (!p.alive) continue;
        const pb = p.box();
        const hits = (b: [number, number, number, number]) => b[0] < pb[2] && b[2] > pb[0] && b[1] < pb[3] && b[3] > pb[1];
        if (hits([this.x - 22, this.y - 82, this.x + 22, this.y]) || (hot && hits(this.hammer.box()))) p.hurt();
      }
    }
    this.draw(frame);
  }

  /** Shoulder of the hammer arm, and the clamp at the end of it. */
  private shoulder(): [number, number] {
    const low = this.mode === 'recover' || this.mode === 'crouch' || this.mode === 'toss' ? 7 : 0;
    return [this.x + this.facing * 18, this.y - 68 + low];
  }
  private grip(): [number, number] {
    const [sx, sy] = this.shoulder();
    const a = this.facing > 0 ? this.arm * D : Math.PI - this.arm * D;
    return [sx + Math.cos(a) * 24, sy + Math.sin(a) * 24];
  }
  /** Exhaust from the jump jets under the hull. */
  private jets() {
    const g = this.g;
    if (this.t % 3 !== 0) return;
    for (const dx of [-14, 12]) g.addFx(new Anim(g, g.assets.snow.puff, this.x + dx, this.y - 30, 2, 24));
    if (this.t % 6 === 0) explode(g, this.x + (Math.random() - 0.5) * 20, this.y - 24, 'S');
  }

  private land(waves: boolean) {
    const g = this.g;
    g.gfx.shake = 7;
    g.audio.sfx('rumble');
    snowBurst(g, this.x - 20, this.floor - 4, 4);
    snowBurst(g, this.x + 20, this.floor - 4, 4);
    if (waves) {
      g.enemies.push(new SnowWave(g, this.x - 24, this.floor, -1, this.enraged ? 2.6 : 2.1));
      g.enemies.push(new SnowWave(g, this.x + 24, this.floor, 1, this.enraged ? 2.6 : 2.1));
    }
  }
  private slamImpact() {
    const g = this.g;
    const x = this.hammer.cx;
    g.gfx.shake = 8;
    g.audio.sfx('crash', 0.7);
    snowBurst(g, x, this.floor - 4, 8);
    g.enemies.push(new SnowWave(g, x + this.facing * 10, this.floor, this.facing, this.enraged ? 3 : 2.4));
    if (this.enraged) g.enemies.push(new SnowWave(g, this.x - this.facing * 24, this.floor, -this.facing, 2.4));
  }
  private fireMine(i: number, n: number) {
    const g = this.g;
    // the launch tubes sit on the back of the hull
    const gx = this.x - this.facing * 22, gy = this.y - 90;
    const [px] = g.player.center();
    // spread the mines around where the player is standing
    const spread = (i - (n - 1) / 2) * 34;
    const tx = Math.max(this.left + 10, Math.min(this.right - 10, px + spread + (Math.random() - 0.5) * 16));
    const T = 56 + i * 4;
    const grav = 0.16;
    const vx = (tx - gx) / T, vy = (this.floor - (gy - 10)) / T - 0.5 * grav * T;
    g.enemies.push(new Mine(g, gx, gy - 10, vx, vy, grav, this.floor, this.enraged ? 55 : 75));
    g.addFx(new Anim(g, g.assets.snow.puff, gx, gy, 2, 20));
    g.audio.sfx('launch', 0.6);
  }

  private draw(frame: typeof this.body.frame) {
    const g = this.g;
    const flash = this.flashT > 0 ? 0.8 : this.mode === 'dying' && this.modeT < 100 && this.modeT % 6 < 3 ? 0.5 : 0;
    const b = this.body;
    b.setFrame(frame);
    b.flip = this.facing < 0;
    b.x = this.x; b.y = this.y; b.flash = flash;
    b.sync();
    const [sx, sy] = this.shoulder();
    const arm = this.armS;
    arm.visible = this.mode !== 'dying' || this.modeT < 100;
    arm.rot = this.facing > 0 ? this.arm * D : Math.PI - this.arm * D;
    arm.x = sx; arm.y = sy; arm.flash = flash;
    arm.sync();
    const [gx, gy] = this.grip();
    const s = this.hammerS;
    s.setFrame(g.assets.snow.hammer[this.hammerFrame]);
    s.z = this.hammerBehind ? 23 : 25;
    s.flip = this.facing < 0;
    const dir = this.facing > 0 ? this.hammerDir * D : Math.PI - this.hammerDir * D;
    s.rot = dir - Math.PI / 2;
    s.x = gx; s.y = gy;
    s.sync();
    // a shadow on the snow shows where it is coming down
    const sh = this.shadow;
    sh.visible = this.mode === 'leap' || this.mode === 'drop';
    sh.x = this.mode === 'leap' ? this.leapTx : this.x; sh.y = this.floor;
    sh.sync();
  }
  destroy() { this.body.remove(); this.armS.remove(); this.hammerS.remove(); this.shadow.remove(); }
}

/** A cluster mine. Shoot it before the timer runs out, or keep well clear. */
export class Mine extends Enemy {
  landed = false;
  fuse: number;
  constructor(g: Game, x: number, y: number, public vx: number, public vy: number, public grav: number, public floor: number, fuse: number) {
    super(g, x, y, g.assets.snow.mine, 27);
    this.fuse = fuse;
    this.hp = 1; this.score = 100;
    this.touch = false;
    this.boomSize = 'S';
  }
  box(): [number, number, number, number] { return [this.x - 7, this.y - 13, this.x + 7, this.y]; }
  update() {
    const g = this.g;
    if (!this.landed) {
      this.vy += this.grav;
      this.x += this.vx; this.y += this.vy;
      this.sprite.rot += this.vx * 0.05;
      if (this.vy > 0 && this.y >= this.floor) { this.y = this.floor; this.landed = true; this.sprite.rot = 0; g.audio.sfx('land'); }
    } else if (--this.fuse <= 0) { this.blast(); return; }
    this.baseUpdate();
    const s = this.sprite;
    if (this.landed && this.flashT === 0) s.flash = this.fuse < 30 ? (this.fuse % 6 < 3 ? 0.7 : 0) : (this.fuse % 16 < 3 ? 0.5 : 0);
    s.setFlashColor(1, this.flashT > 0 ? 1 : 0.3, this.flashT > 0 ? 1 : 0.3);
    s.x = this.x; s.y = this.y; s.sync();
  }
  /** Timer ran out: a real blast that hurts anyone close. */
  private blast() {
    const g = this.g;
    this.dead = true;
    explode(g, this.x, this.y - 8, 'M');
    for (const p of g.livePlayers()) {
      if (!p.alive) continue;
      const [cx, cy] = p.center();
      if (Math.abs(cx - this.x) < 26 && Math.abs(cy - (this.y - 10)) < 26) p.hurt();
    }
  }
}

/** A shockwave of shattered ice that races along the ground. Jump it. */
export class SnowWave extends Enemy {
  constructor(g: Game, x: number, y: number, public dir: number, public speed: number) {
    super(g, x, y, g.assets.snow.wave[0], 28);
    this.invulnerable = true;
    this.cullMargin = 10;
  }
  box(): [number, number, number, number] { return [this.x - 8, this.y - 15, this.x + 8, this.y]; }
  update() {
    const g = this.g;
    this.x += this.dir * this.speed;
    if (this.t % 5 === 0) g.addFx(new Debris(g, g.assets.snow.snowball[this.t % 2], this.x, this.y - 6, -this.dir * 0.5, -2 - Math.random() * 1.5, 22, 0.2));
    this.baseUpdate();
    if (this.offscreenT > 2) this.dead = true;
    const s = this.sprite;
    s.setFrame(g.assets.snow.wave[Math.floor(this.t / 4) % 3]);
    s.flip = this.dir < 0;
    s.x = this.x; s.y = this.y; s.sync();
  }
}
