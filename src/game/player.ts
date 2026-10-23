import * as THREE from 'three';
import type { Sprite } from '../engine/gfx';
import { VW, VH } from '../engine/gfx';
import { makeBody, type Body, type Rail } from './world';
import type { Game } from './game';
import { fireWeapon, type Weapon, type WeaponKind } from './weapons';
import { muzzle, standPose, airPose, runPose, hangPose, AIMS, HANG_DROP, type Look, type HeroFrames } from '../art/humanoid';
import { Anim, Debris } from './effects';
import { TS } from '../art/tiles';

export interface HeroDef {
  id: 'ryder' | 'voss';
  name: string;
  blurb: string[];
  speed: number;
  jump: number;
  armor: boolean;
}

export const HEROES: HeroDef[] = [
  { id: 'ryder', name: 'RYDER', blurb: ['FAST AND AGILE', 'HIGHER JUMP', 'QUICK GRAPPLE'], speed: 1.75, jump: 6.55, armor: false },
  { id: 'voss', name: 'VOSS', blurb: ['HEAVY ARMOR', 'SHIELD TAKES ONE HIT', 'RECHARGES OVER TIME'], speed: 1.4, jump: 6.1, armor: true },
];

const GRAV = 0.22, MAXFALL = 5.5, JUMP_CUT = 2.4;
/** Hand-over-hand speed along a rail. */
const CLIMB_SPEED = 1.05;
/** Frames between shots while the button is held (mashing is limited only by the weapon). */
const HOLD_RATE: Record<string, number> = { R: 16, M: 0, S: 22, L: 26, H: 18, F: 0 };

/** hook: frozen in place while the grapple flies up. hang: holding on to a rail. */
type State = 'play' | 'hook' | 'reel' | 'hang' | 'dying' | 'dead';

export class Player {
  def: HeroDef;
  frames: HeroFrames;
  /** Frames once the armor has been knocked off (same as frames for heroes without armor). */
  bareFrames: HeroFrames;
  look: Look;
  body: Body;
  sprite: Sprite;
  shieldSprite: Sprite;
  facing = 1;
  aim = 'f';
  prone = false;
  curl = false;
  state: State = 'play';
  weapons: Weapon[] = [{ kind: 'R', level: 1 }, { kind: 'R', level: 1 }];
  slot = 0;
  cooldown = 0;
  sinceShot = 99;
  jumpHeld = false;
  invuln = 0;
  barrier = 0;
  armor = false;
  armorRegen = 0;
  /** Counts down after the armor snaps back on: drives the white flash and glint. */
  armorFlash = 0;
  t = 0;
  stateT = 0;
  lastSafe = { x: 0, y: 0 };
  safeT = 0;
  hook: { x: number; y: number; vx: number; vy: number; latched: boolean; tx: number; ty: number; dist: number; rail: Rail | null } | null = null;
  hookSprite: Sprite;
  rope: THREE.Mesh;
  hookCool = 0;
  /** The rail being hung from. */
  rail: Rail | null = null;
  /** Frames before a rail can be grabbed again (just let go of one). */
  grabCool = 0;
  climbT = 0;
  moving = false;
  locked = false;
  /** How well the boots hold on the ground last stood on: 1 is full control, ice is far less. */
  grip = 1;
  private wasGround = true;

  constructor(public g: Game, def: HeroDef, x: number, y: number) {
    this.def = def;
    this.frames = g.assets.heroes[def.id];
    this.bareFrames = g.assets.heroes[def.id + 'Bare'] ?? this.frames;
    this.look = g.assets.looks[def.id];
    this.body = makeBody(x, y, 10, 26);
    this.sprite = g.gfx.sprite(this.frames.stand.f, 30);
    this.shieldSprite = g.gfx.sprite(g.assets.fx.ring[3], 31, true);
    this.shieldSprite.visible = false;
    this.armor = def.armor;
    this.hookSprite = g.gfx.sprite(g.assets.fx.hook, 32);
    this.hookSprite.visible = false;
    this.rope = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xd8c890, depthTest: false, depthWrite: false, transparent: true }));
    this.rope.renderOrder = 29;
    this.rope.visible = false;
    g.gfx.scene.add(this.rope);
    this.lastSafe = { x, y };
  }

  get weapon() { return this.weapons[this.slot]; }
  get alive() { return this.state === 'play' || this.state === 'hook' || this.state === 'reel' || this.state === 'hang'; }

  box(): [number, number, number, number] {
    const b = this.body;
    if (this.prone) return [b.x - 10, b.y - 9, b.x + 10, b.y];
    if (this.curl) return [b.x - 6, b.y - 18, b.x + 6, b.y - 4];
    return [b.x - 4, b.y - 25, b.x + 4, b.y];
  }
  center(): [number, number] { return [this.body.x, this.body.y - (this.prone ? 5 : 14)]; }

  /** Equip a weapon. Returns the weapon it displaced (never the rifle), so it can be dropped. */
  giveWeapon(k: WeaponKind, level = 1): Weapon | null {
    const w = this.weapon;
    if (w.kind === k) { w.level = Math.min(2, w.level + level); return null; }
    // fill the empty (rifle) slot first so the player keeps what they had
    const other = this.weapons[1 - this.slot];
    if (w.kind !== 'R' && other.kind === 'R') { this.weapons[1 - this.slot] = { kind: k, level }; this.slot = 1 - this.slot; return null; }
    this.weapons[this.slot] = { kind: k, level };
    return w.kind === 'R' ? null : w;
  }

  update() {
    const g = this.g, inp = g.input, b = this.body;
    this.t++; this.stateT++;
    if (this.cooldown > 0) this.cooldown--;
    if (this.hookCool > 0) this.hookCool--;
    if (this.grabCool > 0) this.grabCool--;
    if (this.invuln > 0) this.invuln--;
    if (this.barrier > 0) this.barrier--;
    if (this.armorFlash > 0) this.armorFlash--;
    if (this.def.armor && !this.armor && this.alive) { this.armorRegen--; if (this.armorRegen <= 0) this.armorUp(); }

    if (this.state === 'dying' || this.state === 'dead') { this.updateDeath(); this.draw(); return; }

    const left = inp.held('left'), right = inp.held('right'), up = inp.held('up'), down = inp.held('down');
    const dirX = (right ? 1 : 0) - (left ? 1 : 0);
    this.locked = inp.held('lock');

    if (this.state === 'reel') { this.updateReel(); this.draw(); return; }
    if (this.state === 'hook') { this.updateFrozen(); this.draw(); return; }
    if (this.state === 'hang') { this.updateHang(dirX, up, down); this.draw(); return; }

    if (dirX !== 0) this.facing = dirX;
    const ground = b.onGround;
    // ---- aiming ----
    this.prone = false;
    if (ground && !this.locked) {
      if (down && dirX === 0) { this.prone = true; this.aim = 'f'; }
      else if (up) this.aim = dirX ? 'uf' : 'u';
      else if (down) this.aim = 'df';
      else this.aim = 'f';
    } else if (ground && this.locked) {
      // locked in place you can point the gun straight down at your feet
      this.aim = up ? (dirX ? 'uf' : 'u') : down ? (dirX ? 'df' : 'd') : 'f';
    } else {
      this.aim = up ? (dirX ? 'uf' : 'u') : down ? (dirX ? 'df' : 'd') : 'f';
    }

    // ---- movement ----
    const speed = this.def.speed;
    const want = (this.locked && ground) || this.prone ? 0 : dirX * speed;
    // on ice you only ease toward the speed you want, and keep sliding through a jump
    if (ground) this.grip = g.stage.grip?.(b) ?? 1;
    const grip = ground ? this.grip : this.grip < 1 ? 0.12 : 1;
    b.vx = grip >= 1 ? want : b.vx + (want - b.vx) * grip;
    this.moving = want !== 0 && ground;

    if (inp.pressed('jump') && ground) {
      // only a plain down + jump drops through; down + a direction is a normal jump
      if (down && dirX === 0 && this.onOneway()) { b.dropTimer = 14; b.y += 2; this.curl = false; }
      else { b.vy = -this.def.jump; this.curl = true; this.jumpHeld = true; g.audio.sfx('jump'); }
    }
    // variable height: letting go of jump early cuts the rise short
    if (this.jumpHeld && !inp.held('jump')) {
      this.jumpHeld = false;
      if (b.vy < -JUMP_CUT) b.vy = -JUMP_CUT;
    }
    if (b.vy >= 0) this.jumpHeld = false;
    b.vy = Math.min(MAXFALL, b.vy + GRAV);
    const prevY = b.y;
    b.x += g.scrollVx; // carried along by the jeep ride
    g.world.move(b);
    // keep inside the camera's left/right edges
    const minX = g.gfx.camX + 6, maxX = g.gfx.camX + VW - 6;
    if (b.x < minX) b.x = minX;
    if (b.x > maxX) b.x = maxX;
    // riding a vehicle: its deck is the floor and you can't step off it
    const deck = g.stage.deck();
    if (deck) {
      b.x = Math.max(deck.x0, Math.min(deck.x1, b.x));
      if (b.vy >= 0 && prevY <= deck.y + 6 && b.y >= deck.y - 0.5) { b.y = deck.y; b.vy = 0; b.onGround = true; }
    }
    if (b.onGround) {
      if (!this.wasGround) { this.curl = false; g.audio.sfx('land', 0.6); }
      this.safeT++;
      if (this.safeT > 20 && g.world.groundBelow(b.x - 4, b.y + 1, 1) && g.world.groundBelow(b.x + 4, b.y + 1, 1)) this.lastSafe = { x: b.x, y: b.y };
    } else this.safeT = 0;
    this.wasGround = b.onGround;
    // holding up while passing a rail always catches it
    if (up && !b.onGround && this.grabCool <= 0) {
      const r = g.world.railAcross(b.x, prevY - HANG_DROP, b.y - HANG_DROP);
      if (r) { this.grab(r); this.draw(); return; }
    }

    // ---- weapons ----
    if (inp.pressed('swap')) { this.slot = 1 - this.slot; g.audio.sfx('swap'); }
    this.tryFire(0);
    // ---- grappling hook ----
    if (inp.pressed('special') && !this.hook && this.hookCool <= 0) { this.fireHook(); this.draw(); return; }
    this.updateHook();

    // fell off the bottom of the screen
    if (b.y > g.gfx.camY + VH + 40) this.die(true);
    this.draw();
  }

  /**
   * Mashing fires as fast as the weapon allows; holding the button auto-fires at a
   * slower pace. The machine gun and flamethrower are full auto either way.
   */
  private tryFire(dy: number) {
    const g = this.g, inp = g.input;
    this.sinceShot++;
    if (this.cooldown > 0 || !inp.held('shoot')) return;
    if (!inp.pressed('shoot') && this.sinceShot < HOLD_RATE[this.weapon.kind]) return;
    const [mx, my, ang] = this.muzzle();
    this.cooldown = fireWeapon(g, this.weapon, mx, my + dy, ang);
    this.sinceShot = 0;
    if (this.weapon.kind !== 'F') g.addFx(new Anim(g, g.assets.fx.flash, mx, my + dy, 2, 36, true));
  }

  private onOneway() {
    const b = this.body;
    const ty = Math.floor((b.y + 1) / TS);
    return this.g.world.oneway(Math.floor(b.x / TS), ty) && !this.g.world.solid(Math.floor(b.x / TS), ty);
  }

  muzzle(): [number, number, number] {
    const b = this.body, f = this.facing;
    const ang = (AIMS[this.aim] * Math.PI) / 180;
    const worldAng = f > 0 ? ang : Math.PI - ang;
    if (this.prone) return [b.x + f * 17, b.y - 4, worldAng];
    if (this.curl) return [b.x + Math.cos(worldAng) * 10, b.y - 12 + Math.sin(worldAng) * 10, worldAng];
    const pose = this.state === 'hang' ? hangPose(this.aim)
      : this.body.onGround ? (this.moving ? runPose(this.aim, 0, 6) : standPose(this.aim)) : airPose(this.aim);
    const [mx, my] = muzzle(pose, this.look);
    return [b.x + mx * f, b.y + my, worldAng];
  }

  // ---------------- grappling hook ----------------
  /** The grapple always goes straight up, and the player holds still until it lands or misses. */
  private fireHook() {
    const b = this.body;
    this.hook = { x: b.x, y: b.y - HANG_DROP, vx: 0, vy: -8, latched: false, tx: 0, ty: 0, dist: 0, rail: null };
    this.state = 'hook'; this.stateT = 0;
    b.vx = 0; b.vy = 0;
    this.curl = false; this.jumpHeld = false; this.prone = false;
    this.g.audio.sfx('grapple');
  }
  private updateFrozen() {
    const b = this.body;
    b.vx = 0; b.vy = 0;
    this.keepOnScreen();
    this.updateHook();
    if (this.state === 'hook' && !this.hook) this.state = 'play';
  }
  /** Carried along by a scrolling ride, but kept inside the camera and on the deck. */
  private keepOnScreen() {
    const g = this.g, b = this.body;
    b.x += g.scrollVx;
    b.x = Math.max(g.gfx.camX + 6, Math.min(g.gfx.camX + VW - 6, b.x));
    const deck = g.stage.deck();
    if (deck && b.onGround) b.x = Math.max(deck.x0, Math.min(deck.x1, b.x));
  }
  private grab(r: Rail) {
    const b = this.body;
    this.state = 'hang'; this.stateT = 0;
    this.rail = r;
    b.x = Math.max(r.x0 + 3, Math.min(r.x1 - 3, b.x));
    b.y = r.y + HANG_DROP; b.vx = 0; b.vy = 0; b.onGround = false;
    this.curl = false; this.jumpHeld = false; this.prone = false;
    this.wasGround = false;
    this.g.audio.sfx('clink', 0.7);
  }
  private letGo() {
    this.state = 'play'; this.rail = null; this.grabCool = 14;
  }
  /** Hanging from a rail: climb along it, shoot, and jump (or down + jump to drop) to let go. */
  private updateHang(dirX: number, up: boolean, down: boolean) {
    const g = this.g, inp = g.input, b = this.body, r = this.rail;
    if (!r) { this.state = 'play'; return; }
    if (dirX !== 0) this.facing = dirX;
    this.aim = down ? (dirX ? 'df' : 'd') : up && dirX ? 'uf' : 'f';
    this.moving = false;
    if (!this.locked && dirX !== 0) {
      const nx = Math.max(r.x0 + 3, Math.min(r.x1 - 3, b.x + dirX * CLIMB_SPEED));
      const edge = nx + dirX * 5;
      if (!g.world.solidAtPx(edge, b.y - 4) && !g.world.solidAtPx(edge, b.y - 24)) {
        this.moving = nx !== b.x;
        b.x = nx;
      }
    }
    if (this.moving) this.climbT++;
    this.keepOnScreen();
    b.y = r.y + HANG_DROP; b.vx = 0; b.vy = 0; b.onGround = false;
    if (b.x < r.x0 || b.x > r.x1) { this.letGo(); return; }
    if (inp.pressed('swap')) { this.slot = 1 - this.slot; g.audio.sfx('swap'); }
    this.tryFire(0);
    if (inp.pressed('jump')) {
      this.letGo();
      if (down) b.vy = 0.5;
      else { b.vy = -this.def.jump * 0.85; this.curl = true; this.jumpHeld = true; g.audio.sfx('jump'); }
    }
  }
  private updateHook() {
    const h = this.hook;
    if (!h) { this.hookSprite.visible = false; this.rope.visible = false; return; }
    const g = this.g;
    if (!h.latched) {
      for (let s = 0; s < 2; s++) {
        const py = h.y;
        h.x += h.vx / 2; h.y += h.vy / 2; h.dist += 4;
        const rail = g.world.railAcross(h.x, py, h.y);
        if (rail) {
          h.latched = true; h.rail = rail; h.y = rail.y;
          g.audio.sfx('clink');
          this.state = 'reel'; this.stateT = 0; this.curl = false;
          break;
        }
        const tx = Math.floor(h.x / TS), ty = Math.floor(h.y / TS);
        if (g.world.solid(tx, ty) || g.world.oneway(tx, ty)) {
          // find the top of this column so we can pull the player up onto it
          let top = ty;
          while (top > 0 && (g.world.solid(tx, top - 1) || g.world.oneway(tx, top - 1))) top--;
          const free = !g.world.solid(tx, top - 1) && !g.world.solid(tx, top - 2);
          if (free && top <= ty + 0) {
            h.latched = true; h.tx = tx; h.ty = top;
            g.audio.sfx('clink');
            this.state = 'reel'; this.stateT = 0; this.curl = false;
          } else { this.hook = null; this.hookCool = 10; g.audio.sfx('hit'); }
          break;
        }
        if (h.dist > (this.def.id === 'ryder' ? 150 : 130)) { this.hook = null; this.hookCool = 8; break; }
      }
    }
    this.drawHook();
  }
  private updateReel() {
    const h = this.hook!, b = this.body, g = this.g;
    if (!h) { this.state = 'play'; return; }
    if (h.rail) {
      // pulled straight up to hang from the rail
      const r = h.rail;
      const dy = r.y + HANG_DROP - b.y;
      const sp = this.def.id === 'ryder' ? 6 : 5;
      if (this.stateT % 6 === 0) g.audio.sfx('reel');
      if (-dy <= sp || this.stateT > 70) { this.hook = null; this.hookCool = 12; this.grab(r); this.drawHook(); return; }
      b.y -= sp; b.vy = 0;
      h.x = b.x; h.y = r.y;
      this.drawHook();
      return;
    }
    // target: standing on top of the hooked column, nudged toward its center
    let tx = h.tx * TS + TS / 2;
    const ty = h.ty * TS;
    // prefer to land on the near half of the platform edge
    tx = Math.max(h.tx * TS + 5, Math.min(h.tx * TS + TS - 5, tx));
    const dx = tx - b.x, dy = (ty - 2) - b.y;
    const d = Math.hypot(dx, dy);
    const sp = this.def.id === 'ryder' ? 6 : 5;
    if (this.stateT % 6 === 0) g.audio.sfx('reel');
    if (d <= sp || this.stateT > 70) {
      b.x = tx; b.y = ty; b.vx = 0; b.vy = 0; b.onGround = true;
      this.state = 'play'; this.hook = null; this.hookCool = 12;
      this.drawHook();
      return;
    }
    b.x += (dx / d) * sp; b.y += (dy / d) * sp;
    b.vy = 0;
    h.x = tx; h.y = ty + 2;
    // can still shoot while reeling
    this.aim = 'f';
    this.tryFire(-6);
    this.drawHook();
  }
  private drawHook() {
    const h = this.hook;
    if (!h) { this.hookSprite.visible = false; this.rope.visible = false; return; }
    const [hx, hy] = [this.body.x + this.facing * 2, this.body.y - HANG_DROP];
    this.hookSprite.visible = true;
    this.hookSprite.x = h.x; this.hookSprite.y = h.y;
    this.hookSprite.rot = Math.atan2(h.y - hy, h.x - hx);
    this.hookSprite.sync();
    const dx = h.x - hx, dy = h.y - hy, len = Math.hypot(dx, dy);
    this.rope.visible = true;
    this.rope.position.set(Math.round(hx + dx / 2), -Math.round(hy + dy / 2), 0);
    this.rope.scale.set(Math.max(1, len), 1, 1);
    this.rope.rotation.z = -Math.atan2(dy, dx);
  }

  // ---------------- damage / death ----------------
  hurt() {
    if (!this.alive || this.invuln > 0 || this.barrier > 0) return;
    const g = this.g;
    if (this.armor) {
      this.armor = false; this.armorRegen = 60 * 12; this.invuln = 90;
      g.audio.sfx('armorHit');
      g.gfx.shake = 3;
      // the plates fly off and tumble away
      const bits = this.frames.bits, [cx, cy] = this.center();
      for (let i = 0; i < bits.length + 2; i++) {
        const side = i % 2 ? 1 : -1;
        const d = new Debris(g, bits[i % bits.length], cx + side * 3, cy - 4 + (i % 3) * 4, side * (0.8 + Math.random() * 1.8) - this.facing * 0.4, -2.5 - Math.random() * 2, 55 + Math.floor(Math.random() * 20), 0.2, 33);
        d.spin = side * (0.15 + Math.random() * 0.2);
        g.addFx(d);
      }
      for (let i = 0; i < 8; i++) g.addFx(new Anim(g, g.assets.fx.spark, this.body.x + (Math.random() - 0.5) * 16, this.body.y - 14 + (Math.random() - 0.5) * 20, 2, 42, true, i));
      return;
    }
    this.die(false);
  }
  /** The regen timer ran out (or he respawned): the armor snaps back on with a shwing. */
  private armorUp(sound = true) {
    const g = this.g;
    this.armor = true; this.armorRegen = 0;
    if (!sound) return;
    this.armorFlash = 18;
    g.audio.sfx('shwing');
    const [cx, cy] = this.center();
    for (let i = 0; i < 5; i++) g.addFx(new Anim(g, g.assets.fx.spark, cx + (i - 2) * 4, cy - 10 + i * 5, 2, 42, true, i * 2));
  }
  die(fell: boolean) {
    if (!this.alive) return;
    const g = this.g;
    this.state = fell ? 'dead' : 'dying';
    this.stateT = 0;
    this.hook = null; this.drawHook();
    this.rail = null;
    this.body.vx = -this.facing * 1.6; this.body.vy = -3.8;
    this.prone = false; this.curl = false;
    g.audio.sfx('die');
    g.gfx.shake = 4;
    // lose the weapon in hand
    this.weapons[this.slot] = { kind: 'R', level: 1 };
  }
  private updateDeath() {
    const b = this.body, g = this.g;
    if (this.state === 'dying') {
      b.vy = Math.min(MAXFALL, b.vy + GRAV);
      b.x += g.scrollVx * 0.5; // thrown off a moving jeep you tumble behind it
      g.world.move(b);
      if (b.onGround && this.stateT > 10) { b.vx = 0; this.state = 'dead'; this.stateT = 0; }
      if (b.y > g.gfx.camY + VH + 40) { this.state = 'dead'; this.stateT = 0; }
    }
    if (this.state === 'dead' && this.stateT > 70) g.onPlayerDead();
  }
  respawn(x: number, y: number) {
    const b = this.body;
    b.x = x; b.y = y; b.vx = 0; b.vy = 1; b.onGround = false;
    this.grip = 1;
    this.state = 'play'; this.stateT = 0;
    this.rail = null; this.hook = null; this.drawHook();
    this.curl = true;
    this.invuln = 150;
    this.lastSafe = { x, y };
    // a fresh life comes with a fresh suit of armor
    if (this.def.armor) this.armorUp(!this.armor);
  }

  draw() {
    const s = this.sprite, b = this.body, fr = this.armor || !this.def.armor ? this.frames : this.bareFrames;
    s.rot = 0;
    s.flip = this.facing < 0;
    if (this.state === 'dying') { s.setFrame(fr.hurt); s.rot = (this.stateT * 0.25) * -this.facing; }
    else if (this.state === 'dead') s.setFrame(fr.dead);
    else if (this.state === 'reel' || this.state === 'hook') s.setFrame(fr.hang);
    else if (this.state === 'hang') s.setFrame(this.moving && this.sinceShot > 14 ? fr.hangMove[Math.floor(this.climbT / 7) % 4] : fr.hangAim[this.aim] ?? fr.hangAim.f);
    else if (this.curl && !b.onGround) {
      const f = fr.curl[Math.floor(this.t / 4) % 4];
      s.setFrame(f);
    } else if (this.prone) s.setFrame(fr.prone);
    else if (b.onGround) {
      if (this.moving) {
        const a = this.aim === 'uf' || this.aim === 'df' ? this.aim : 'f';
        s.setFrame(fr.run[a][Math.floor(this.t / 5) % 6]);
      } else s.setFrame(fr.stand[this.aim === 'd' ? 'df' : this.aim]);
    } else s.setFrame(fr.air[this.aim]);
    s.x = b.x; s.y = this.curl && !b.onGround && this.state === 'play' ? b.y - 12 : b.y;
    if (this.state === 'dying' && s.rot !== 0) s.y = b.y - 14;
    s.visible = !(this.invuln > 0 && this.alive && Math.floor(this.t / 3) % 2 === 0) || this.armorFlash > 0;
    s.flash = this.armorFlash > 0 ? this.armorFlash / 18 : 0;
    s.sync();
    // barrier power-up / armor glint
    const sh = this.shieldSprite;
    const regen = this.armorFlash > 6;
    if (this.alive && (this.barrier > 0 || regen || (this.armor && this.t % 120 < 10))) {
      sh.visible = this.barrier > 120 || this.t % 4 < 2 || this.barrier === 0;
      const ring = this.g.assets.fx.ring;
      sh.setFrame(ring[this.barrier > 0 ? 3 + (Math.floor(this.t / 3) % 2) : regen ? Math.min(5, Math.floor((18 - this.armorFlash) / 2)) : Math.min(5, Math.floor((this.t % 120) / 2))]);
      sh.x = b.x; sh.y = b.y - 13;
      sh.sync();
    } else sh.visible = false;
  }
  destroy() {
    this.sprite.remove(); this.shieldSprite.remove(); this.hookSprite.remove();
    this.g.gfx.scene.remove(this.rope);
  }
}
