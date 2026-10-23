import { Gfx, VW, VH } from '../engine/gfx';
import { Input } from '../engine/input';
import { audio, type Audio } from '../engine/audio';
import { drawText } from '../engine/font';
import { buildAssets, type Assets } from './assets';
import { World } from './world';
import { Player, HEROES, type HeroDef } from './player';
import { PlayerBullet, WEAPON_NAMES, type Hittable } from './weapons';
import { Enemy, EnemyBullet, Pickup, Runner, Rifleman, Turret, Leaper, Drone, Crawler, Capsule, RunnerSpawner } from './enemies';
import { SHAFT_X, JUNGLE_CAM_Y, type Spawn, type Scenery } from './level';
import { TS } from '../art/tiles';
import { TITLE_SONG, CLEAR_SONG, GAMEOVER_SONG, READY_SONG } from './music';
import { explode } from './effects';
import type { Stage } from './stage';
import { Stage1 } from './stage1';
import { Stage2 } from './stage2';
import type { Weapon } from './weapons';

type Mode = 'title' | 'select' | 'intro' | 'play' | 'paused' | 'gameover' | 'clear';
const STAGES = [Stage1, Stage2];

interface Updatable { dead: boolean; update(): void; destroy(): void; }
interface FloatText { text: string; x: number; y: number; t: number; }

export class Game {
  gfx: Gfx;
  input = new Input();
  audio: Audio = audio;
  assets!: Assets;
  hud: CanvasRenderingContext2D;
  mode: Mode = 'title';
  modeT = 0;
  t = 0;

  world!: World;
  scenery!: Scenery;
  player!: Player;
  hero: HeroDef = HEROES[0];
  enemies: Enemy[] = [];
  pBullets: PlayerBullet[] = [];
  eBullets: EnemyBullet[] = [];
  pickups: Pickup[] = [];
  fx: Updatable[] = [];
  misc: Updatable[] = [];
  spawns: Spawn[] = [];
  stage!: Stage;
  stageIdx = 0;
  /** How fast the view is being carried along (the jeep ride); shots and riders move with it. */
  scrollVx = 0;
  checkpoint = 0;
  lives = 3;
  score = 0;
  hiScore = 0;
  continues = 3;
  texts: FloatText[] = [];
  banner: { text: string; sub?: string; t: number } | null = null;
  selectIdx = 0;
  menuIdx = 0;
  titleCam = 0;
  private sceneReady = false;

  constructor(glCanvas: HTMLCanvasElement, hudCanvas: HTMLCanvasElement) {
    this.gfx = new Gfx(glCanvas);
    hudCanvas.width = VW; hudCanvas.height = VH;
    this.hud = hudCanvas.getContext('2d')!;
    this.hud.imageSmoothingEnabled = false;
    this.input.onFirstInteraction = () => { this.audio.init(); };
    try { this.hiScore = parseInt(localStorage.getItem('blasterinos.hi') || '0') || 0; } catch { /* storage unavailable */ }
  }

  boot() {
    this.assets = buildAssets();
    this.setStage(0);
    this.buildScene(0);
    this.setMode('title');
  }

  get bossActive() { return this.stage.bossActive; }
  addFx(f: Updatable) { this.fx.push(f); }
  addScore(n: number) { this.score += n; if (this.score > this.hiScore) this.hiScore = this.score; }
  flashText(text: string, x: number, y: number) { this.texts.push({ text, x, y, t: 0 }); }
  targets(): Hittable[] {
    return [...this.enemies, ...this.stage.parts()];
  }

  setMode(m: Mode) {
    this.mode = m; this.modeT = 0;
    if (m === 'title') this.audio.play(TITLE_SONG);
    if (m === 'gameover') this.audio.play(GAMEOVER_SONG);
    if (m === 'clear') this.audio.play(CLEAR_SONG);
  }

  // ---------------------------------------------------------------- scene setup
  private clearEntities() {
    for (const list of [this.enemies, this.pBullets, this.eBullets, this.pickups, this.fx, this.misc] as Updatable[][]) { for (const e of list) e.destroy(); list.length = 0; }
    this.stage?.destroy();
    this.player?.destroy();
  }
  setStage(i: number) {
    if (this.sceneReady) this.clearEntities();
    this.sceneReady = false;
    this.stageIdx = i;
    this.stage = new STAGES[i](this);
  }
  buildScene(cp: number) {
    if (this.sceneReady) this.clearEntities();
    this.gfx.clear();
    this.scrollVx = 0;
    this.stage.build(cp);
    this.checkpoint = cp;
    this.sceneReady = true;
  }
  /** Start (or restart) the current stage at a checkpoint. Weapons carry over between stages. */
  startStage(cp: number, carry?: Weapon[]) {
    this.buildScene(cp);
    const { x, y, after } = this.stage.start(cp);
    this.player = new Player(this, this.hero, x, y);
    if (carry) this.player.weapons = carry.map((w) => ({ ...w }));
    this.player.respawn(x, y);
    this.player.invuln = 60;
    after?.();
    this.banner = null;
    this.texts = [];
    this.setMode('intro');
    this.audio.play(READY_SONG);
  }
  private toTitle() {
    this.setStage(0);
    this.buildScene(0);
    this.setMode('title');
  }

  // ---------------------------------------------------------------- main update
  update() {
    this.t++; this.modeT++;
    this.input.update();
    switch (this.mode) {
      case 'title': this.updateTitle(); break;
      case 'select': this.updateSelect(); break;
      case 'intro':
        this.updateWorld(false);
        if (this.modeT > 130) { this.setMode('play'); this.audio.play(this.stage.inBoss ? this.stage.bossSong : this.stage.song); }
        break;
      case 'play':
        if (this.input.pressed('start')) { this.setMode('paused'); this.audio.sfx('pause'); this.audio.musicBus && (this.audio.musicBus.gain.value = 0.1); break; }
        this.updateWorld(true);
        break;
      case 'paused':
        if (this.input.pressed('start')) { this.mode = 'play'; this.audio.sfx('pause'); this.audio.musicBus && (this.audio.musicBus.gain.value = 0.32); }
        break;
      case 'gameover': this.updateGameOver(); break;
      case 'clear':
        this.updateWorld(false);
        if (this.modeT > 240 && (this.input.pressed('start') || this.input.pressed('jump'))) {
          if (this.stageIdx + 1 < STAGES.length) {
            const carry = this.player.weapons;
            this.setStage(this.stageIdx + 1);
            this.startStage(0, carry);
          } else this.toTitle();
        }
        break;
    }
    this.gfx.update();
    this.scenery.update(this.gfx.camX, this.gfx.camY, this.t / 60);
    this.drawHud();
  }
  render() { this.gfx.render(); }

  private updateTitle() {
    // slow pan across the stage behind the logo
    this.titleCam += 0.4;
    const span = SHAFT_X - VW;
    const k = (this.titleCam % (span * 2));
    this.gfx.camX = k < span ? k : span * 2 - k;
    this.gfx.camY = JUNGLE_CAM_Y;
    this.stage.update();
    if (this.modeT > 30 && (this.input.pressed('start') || this.input.pressed('jump') || this.input.pressed('shoot'))) {
      this.audio.init();
      this.audio.sfx('select');
      this.setMode('select');
    }
  }
  private updateSelect() {
    const i = this.input;
    if (i.pressed('left') || i.pressed('right')) { this.selectIdx = 1 - this.selectIdx; this.audio.sfx('menu'); }
    if (this.modeT > 10 && (i.pressed('start') || i.pressed('jump') || i.pressed('shoot'))) {
      this.audio.sfx('select');
      this.hero = HEROES[this.selectIdx];
      this.lives = 3; this.score = 0; this.continues = 3;
      // ?stage=2 (and optionally &cp=1 or 2) jumps straight to a later stage for testing
      const q = new URLSearchParams(location.search);
      const st = Math.max(1, Math.min(STAGES.length, parseInt(q.get('stage') || '1') || 1)) - 1;
      if (st !== this.stageIdx) this.setStage(st);
      this.startStage(Math.max(0, Math.min(2, parseInt(q.get('cp') || '0') || 0)));
    }
    if (i.pressed('special')) this.setMode('title');
  }
  private updateGameOver() {
    const i = this.input;
    if (this.continues > 0) {
      if (i.pressed('up') || i.pressed('down')) { this.menuIdx = 1 - this.menuIdx; this.audio.sfx('menu'); }
      if (this.modeT > 60 && (i.pressed('start') || i.pressed('jump') || i.pressed('shoot'))) {
        this.audio.sfx('select');
        if (this.menuIdx === 0) { this.continues--; this.lives = 3; this.score = 0; this.startStage(this.checkpoint); }
        else this.toTitle();
      }
    } else if (this.modeT > 120 && (i.pressed('start') || i.pressed('jump'))) this.toTitle();
  }

  private updateWorld(live: boolean) {
    const p = this.player;
    if (live || this.mode === 'intro' || this.mode === 'clear') p.update();
    if (this.mode === 'clear' && p.body.onGround) p.body.vx = 0;
    this.stage.updateCamera();
    this.activateSpawns();
    this.stage.update();
    const step = (list: Updatable[]) => {
      for (const e of list) if (!e.dead) e.update();
      for (let k = list.length - 1; k >= 0; k--) if (list[k].dead) { list[k].destroy(); list.splice(k, 1); }
    };
    step(this.misc);
    step(this.enemies);
    step(this.pBullets);
    this.collide();
    step(this.eBullets);
    step(this.pickups);
    step(this.fx);
    for (const t of this.texts) t.t++;
    this.texts = this.texts.filter((t) => t.t < 60);
    if (this.banner) { this.banner.t++; if (this.banner.t > 240) this.banner = null; }
  }

  private collide() {
    const targets = this.targets();
    for (const b of this.pBullets) {
      if (b.dead) continue;
      const bb = b.box();
      for (const e of targets) {
        if (e.dead || b.hitSet.has(e)) continue;
        const eb = e.box();
        if (bb[0] < eb[2] && bb[2] > eb[0] && bb[1] < eb[3] && bb[3] > eb[1]) {
          // invulnerable parts only stop bullets if they are solid armor (deflect)
          if (e.invulnerable) { if (e.deflect && !b.pierce) { b.dead = true; this.audio.sfx('clink', 0.4); } continue; }
          e.hit(b.dmg, this);
          b.hitSet.add(e);
          if (!b.pierce) { b.dead = true; if (b.kind === 'H') explode(this, b.x, b.y, 'S', false); break; }
        }
      }
    }
  }

  private activateSpawns() {
    const g = this.gfx;
    for (const s of this.spawns) {
      if (s.done) continue;
      const inX = s.x < g.camX + VW + 24 && s.x > g.camX - 40;
      const inY = s.y > g.camY - 30 && s.y < g.camY + VH + 60;
      if (!(inX && inY)) continue;
      s.done = true;
      const edgeX = g.camX + VW + 16;
      const before = this.enemies.length;
      switch (s.kind) {
        case 'runners': this.misc.push(new RunnerSpawner(this, s.arg[0], s.arg[1], s.arg[2])); break;
        case 'rifle': this.enemies.push(new Rifleman(this, s.x, s.y)); break;
        case 'rifleBag': this.enemies.push(new Rifleman(this, s.x, s.y, false, true)); break;
        case 'sniper': this.enemies.push(new Rifleman(this, s.x, s.y, true)); break;
        case 'turret': this.enemies.push(new Turret(this, s.x, s.y)); break;
        case 'leaper': this.enemies.push(new Leaper(this, s.x, s.y)); break;
        case 'drone': this.enemies.push(new Drone(this, s.arg < 0 ? Math.max(s.x, edgeX) : g.camX - 16, s.y - 30, s.arg)); break;
        case 'crawler': this.enemies.push(new Crawler(this, s.x, s.y, s.arg)); break;
        case 'capsule': this.enemies.push(new Capsule(this, g.camX - 16, s.y, s.arg, 1)); break;
        default: this.stage.spawn(s);
      }
      // during the jeep ride, flyers keep pace with the view instead of whipping past
      for (let k = before; k < this.enemies.length; k++) this.enemies[k].carried = this.scrollVx > 0;
    }
  }

  // ---------------------------------------------------------------- events
  onPlayerDead() {
    this.lives--;
    if (this.lives <= 0) { this.menuIdx = 0; this.setMode('gameover'); return; }
    if (this.stage.respawn()) return;
    // drop back in Contra style, near where the player was
    const g = this.gfx, p = this.player;
    const want = Math.max(g.camX + 30, Math.min(g.camX + VW - 30, p.lastSafe.x));
    const xs = [want, want - 40, want + 40, want - 80, want + 80, g.camX + VW / 2, g.camX + 60, g.camX + VW - 60];
    for (const x of xs) {
      const tx = Math.floor(x / TS);
      for (let ty = Math.floor((g.camY + 40) / TS); ty < Math.floor((g.camY + VH - 4) / TS); ty++) {
        if ((this.world.solid(tx, ty) || this.world.oneway(tx, ty)) && !this.world.solid(tx, ty - 1) && !this.world.solid(tx, ty - 2)) {
          p.respawn(tx * TS + 8, Math.max(g.camY + 10, ty * TS - 60));
          return;
        }
      }
    }
    p.respawn(p.lastSafe.x, p.lastSafe.y - 40);
  }
  onMidBossDefeated() { this.stage.onMidBossDefeated(); }
  onBossDefeated() {
    this.stage.onBossDefeated();
    this.addScore(this.lives * 5000);
    this.setMode('clear');
    try { localStorage.setItem('blasterinos.hi', String(this.hiScore)); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- HUD + menus
  private drawHud() {
    const c = this.hud;
    c.clearRect(0, 0, VW, VH);
    if (this.mode === 'title') return this.drawTitle();
    if (this.mode === 'select') return this.drawSelect();
    const p = this.player;
    // lives as medals
    const medal = this.assets.fx.medal.canvas;
    drawText(c, '1P', 6, 5, '#7ac0ff');
    for (let i = 0; i < Math.min(8, this.lives - 1); i++) c.drawImage(medal, 22 + i * 9, 3);
    drawText(c, String(this.score).padStart(7, '0'), 6, 15, '#ffffff');
    drawText(c, 'HI ' + String(this.hiScore).padStart(7, '0'), VW - 6, 5, '#ffd040', { align: 'right' });
    // weapon slots
    for (let i = 0; i < 2; i++) {
      const w = p.weapons[i];
      const x = 6 + i * 26, y = 26;
      const active = i === p.slot;
      c.fillStyle = active ? '#ffd040' : '#3a3450';
      c.fillRect(x - 1, y - 1, 24, 16);
      c.fillStyle = '#120d16'; c.fillRect(x, y, 22, 14);
      drawText(c, w.kind, x + 3, y + 4, active ? '#ffffff' : '#8a84a0');
      for (let l = 0; l < w.level; l++) { c.fillStyle = active ? '#ff5050' : '#6a3040'; c.fillRect(x + 12 + l * 4, y + 9, 3, 3); }
    }
    drawText(c, WEAPON_NAMES[p.weapon.kind], 60, 30, '#c8c0e0');
    if (p.def.armor) drawText(c, p.armor ? 'ARMOR' : 'ARMOR ' + Math.ceil(p.armorRegen / 60), 6, 44, p.armor ? '#7ae0ff' : '#5a6070');
    if (p.barrier > 0) drawText(c, 'BARRIER ' + Math.ceil(p.barrier / 60), 6, p.def.armor ? 54 : 44, '#d080ff');
    // boss bar
    const bossHp = this.stage.bossBar();
    if (bossHp) {
      const [hp, max, name] = bossHp;
      const bw = 140, bx = VW / 2 - bw / 2, by = 18;
      drawText(c, name, VW / 2, 8, '#ff8080', { align: 'center' });
      c.fillStyle = '#120d16'; c.fillRect(bx - 2, by - 2, bw + 4, 8);
      c.fillStyle = '#5a1020'; c.fillRect(bx, by, bw, 4);
      c.fillStyle = '#ff3a3a'; c.fillRect(bx, by, Math.max(0, Math.round((bw * hp) / max)), 4);
      c.fillStyle = '#ffa0a0'; c.fillRect(bx, by, Math.max(0, Math.round((bw * hp) / max)), 1);
    }
    // floating texts
    for (const t of this.texts) drawText(c, t.text, t.x - this.gfx.camX, t.y - this.gfx.camY - t.t * 0.4, t.t % 6 < 3 ? '#ffffff' : '#ffd040', { align: 'center' });
    if (this.banner) {
      const b = this.banner;
      if (b.text === 'WARNING' ? b.t % 30 < 20 : true) drawText(c, b.text, VW / 2, 80, b.text === 'WARNING' ? '#ff4040' : '#ffffff', { align: 'center', scale: 2 });
      if (b.sub) drawText(c, b.sub, VW / 2, 100, '#ffd040', { align: 'center' });
    }
    if (this.mode === 'intro') {
      c.fillStyle = 'rgba(8,6,16,0.55)'; c.fillRect(0, 70, VW, 56);
      drawText(c, 'STAGE ' + this.stage.num, VW / 2, 80, '#ffd040', { align: 'center', scale: 2 });
      drawText(c, this.stage.name, VW / 2, 102, '#ffffff', { align: 'center' });
      if (this.checkpoint === 0 && this.stageIdx === 0) {
        const hint = this.input.lastDevice === 'gamepad' ? 'X SHOOT  A JUMP  Y GRAPPLE  RB LOCK AIM  B SWAP' : 'X SHOOT  Z JUMP  C GRAPPLE  SHIFT LOCK AIM  V SWAP';
        drawText(c, hint, VW / 2, 190, '#c8c0e0', { align: 'center' });
      }
    }
    if (this.mode === 'paused') {
      c.fillStyle = 'rgba(8,6,16,0.6)'; c.fillRect(0, 0, VW, VH);
      drawText(c, 'PAUSED', VW / 2, 70, '#ffffff', { align: 'center', scale: 2 });
      this.drawControls(100);
    }
    if (this.mode === 'gameover') {
      c.fillStyle = `rgba(8,6,16,${Math.min(0.75, this.modeT / 60)})`; c.fillRect(0, 0, VW, VH);
      drawText(c, 'GAME OVER', VW / 2, 70, '#ff4040', { align: 'center', scale: 3 });
      if (this.continues > 0 && this.modeT > 60) {
        drawText(c, 'CONTINUE  (' + this.continues + ' LEFT)', VW / 2, 112, '#ffffff', { align: 'center' });
        drawText(c, (this.menuIdx === 0 ? '> ' : '  ') + 'YES', VW / 2 - 20, 130, this.menuIdx === 0 ? '#ffd040' : '#8a84a0');
        drawText(c, (this.menuIdx === 1 ? '> ' : '  ') + 'NO', VW / 2 - 20, 142, this.menuIdx === 1 ? '#ffd040' : '#8a84a0');
      }
    }
    if (this.mode === 'clear') {
      c.fillStyle = `rgba(8,6,16,${Math.min(0.6, this.modeT / 90)})`; c.fillRect(0, 0, VW, VH);
      drawText(c, 'STAGE CLEAR!', VW / 2, 50, '#ffd040', { align: 'center', scale: 3 });
      if (this.modeT > 60) drawText(c, 'SCORE ' + this.score, VW / 2, 92, '#ffffff', { align: 'center', scale: 2 });
      this.stage.clearLines.forEach((l, k) => { if (this.modeT > 100 + k * 20) drawText(c, l, VW / 2, 124 + k * 12, '#c8c0e0', { align: 'center' }); });
      const last = this.stageIdx + 1 >= STAGES.length;
      const y = 128 + this.stage.clearLines.length * 12;
      if (this.modeT > 160) drawText(c, last ? 'THANKS FOR PLAYING THE BLASTERINOS TECH DEMO' : 'NEXT: STAGE ' + (this.stage.num + 1), VW / 2, y, last ? '#c8c0e0' : '#ffd040', { align: 'center' });
      if (this.modeT > 240 && this.modeT % 60 < 40) drawText(c, 'PRESS START', VW / 2, 180, '#ffffff', { align: 'center' });
    }
  }
  private drawControls(y: number) {
    const c = this.hud;
    const pad = this.input.lastDevice === 'gamepad';
    const rows = pad
      ? [['MOVE / AIM', 'D-PAD OR STICK'], ['SHOOT', 'X'], ['JUMP', 'A  (DOWN+A DROPS)'], ['GRAPPLE', 'Y  (UP+Y STRAIGHT UP)'], ['LOCK AIM', 'RB / LT / RT'], ['SWAP WEAPON', 'B / LB']]
      : [['MOVE / AIM', 'ARROWS OR WASD'], ['SHOOT', 'X OR J'], ['JUMP', 'Z, K OR SPACE'], ['GRAPPLE', 'C OR L'], ['LOCK AIM', 'SHIFT OR U'], ['SWAP WEAPON', 'V OR I']];
    rows.forEach(([a, b], i) => {
      drawText(c, a, VW / 2 - 10, y + i * 11, '#ffd040', { align: 'right' });
      drawText(c, b, VW / 2 + 6, y + i * 11, '#ffffff');
    });
  }
  private drawTitle() {
    const c = this.hud;
    c.fillStyle = 'rgba(8,6,20,0.35)'; c.fillRect(0, 0, VW, VH);
    // logo: layered shadow + gradient fill, drawn with the pixel font
    const logo = 'BLASTERINOS';
    const y = 34 + Math.round(Math.sin(this.t / 30) * 2);
    drawText(c, logo, VW / 2 + 3, y + 3, '#120d16', { align: 'center', scale: 4, shadow: null });
    drawText(c, logo, VW / 2, y, '#c02028', { align: 'center', scale: 4, shadow: '#5a0a10' });
    c.save();
    c.beginPath(); c.rect(0, y, VW, 12); c.clip();
    drawText(c, logo, VW / 2, y, '#ffb040', { align: 'center', scale: 4, shadow: null });
    c.restore();
    c.save();
    c.beginPath(); c.rect(0, y, VW, 5); c.clip();
    drawText(c, logo, VW / 2, y, '#fff0a0', { align: 'center', scale: 4, shadow: null });
    c.restore();
    drawText(c, 'A CODE-GENERATED RUN AND GUN TECH DEMO', VW / 2, y + 36, '#c8c0e0', { align: 'center' });
    if (this.modeT % 60 < 42) drawText(c, 'PRESS START', VW / 2, 120, '#ffffff', { align: 'center', scale: 2 });
    this.drawControls(146);
    drawText(c, 'HI ' + String(this.hiScore).padStart(7, '0'), VW / 2, 8, '#ffd040', { align: 'center' });
  }
  private drawSelect() {
    const c = this.hud;
    c.fillStyle = 'rgba(8,6,20,0.75)'; c.fillRect(0, 0, VW, VH);
    drawText(c, 'SELECT YOUR SOLDIER', VW / 2, 14, '#ffffff', { align: 'center', scale: 2 });
    HEROES.forEach((h, i) => {
      const cx = VW / 2 + (i === 0 ? -90 : 90);
      const sel = i === this.selectIdx;
      c.fillStyle = sel ? '#ffd040' : '#3a3450';
      c.fillRect(cx - 62, 38, 124, 150);
      c.fillStyle = sel ? '#2a2040' : '#14101e';
      c.fillRect(cx - 60, 40, 120, 146);
      const fr = this.assets.heroes[h.id];
      const f = sel ? fr.run.f[Math.floor(this.t / 6) % 6] : fr.stand.f;
      c.drawImage(f.canvas, Math.round(cx - f.ax * 2), 110 - f.ay * 2, f.w * 2, f.h * 2);
      drawText(c, h.name, cx, 120, sel ? '#ffd040' : '#8a84a0', { align: 'center', scale: 2 });
      h.blurb.forEach((b, k) => drawText(c, b, cx, 142 + k * 10, sel ? '#ffffff' : '#6a6480', { align: 'center' }));
      const stat = (label: string, v: number, y: number) => {
        drawText(c, label, cx - 52, y, '#8a84a0');
        for (let k = 0; k < 5; k++) { c.fillStyle = k < v ? (sel ? '#ff5050' : '#6a3040') : '#2a2438'; c.fillRect(cx + 4 + k * 9, y, 7, 6); }
      };
      stat('SPEED', h.id === 'ryder' ? 5 : 3, 176 - 2);
    });
    if (this.modeT % 60 < 42) drawText(c, '< >  CHOOSE    START  CONFIRM', VW / 2, 200, '#c8c0e0', { align: 'center' });
  }
}
