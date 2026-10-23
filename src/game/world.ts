import * as THREE from 'three';
import { Gfx, tex } from '../engine/gfx';
import { paintChunk, T, TS, SOLID, ONEWAY } from '../art/tiles';
import { drawRail, type RailStyle } from '../art/props';

export const CHUNK = 32;

export interface Body {
  x: number; y: number;     // feet center
  w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
  dropTimer: number;        // > 0 ignores one-way platforms
  hitWall: boolean;
  hitCeil: boolean;
}

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, dropTimer: 0, hitWall: false, hitCeil: false };
}

/** An overhead bar the player can hang from and climb along hand over hand. y is the bar's center line. */
export interface Rail { x0: number; x1: number; y: number; style: RailStyle; hang: number; }

export class World {
  w: number; h: number;
  tiles: Uint8Array;
  rails: Rail[] = [];
  private meshes = new Map<string, THREE.Mesh>();
  private gfx: Gfx | null = null;

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.tiles = new Uint8Array(w * h);
  }
  get(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.w) return T.ROCK;
    if (ty < 0 || ty >= this.h) return T.E;
    return this.tiles[ty * this.w + tx];
  }
  set(tx: number, ty: number, t: number) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.tiles[ty * this.w + tx] = t;
  }
  fill(x0: number, y0: number, x1: number, y1: number, t: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  }
  /**
   * Add an overhead rail spanning tiles x0..x1, through the middle of a tile row.
   * `hang` is how far its supports reach up toward whatever holds it.
   */
  rail(x0: number, x1: number, row: number, style: RailStyle = 'steel', hang = 96) {
    this.rails.push({ x0: x0 * TS, x1: (x1 + 1) * TS, y: row * TS + 8, style, hang });
  }
  /** The rail whose bar lies between two heights at this x, if any (for grabbing on the way past). */
  railAcross(x: number, ya: number, yb: number): Rail | null {
    const lo = Math.min(ya, yb), hi = Math.max(ya, yb);
    for (const r of this.rails) if (x >= r.x0 + 3 && x <= r.x1 - 3 && r.y >= lo && r.y <= hi) return r;
    return null;
  }
  /** Which tile ids block and which are one-way. A stage with its own tile set overrides these. */
  solidT(t: number) { return SOLID.has(t); }
  onewayT(t: number) { return ONEWAY.has(t); }
  solid(tx: number, ty: number) { return this.solidT(this.get(tx, ty)); }
  oneway(tx: number, ty: number) { return this.onewayT(this.get(tx, ty)); }
  solidAtPx(px: number, py: number) { return this.solid(Math.floor(px / TS), Math.floor(py / TS)); }
  /** Anything a bullet or the grappling hook stops on. */
  blocksAtPx(px: number, py: number, includeOneway = false) {
    const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
    if (this.solid(tx, ty)) return true;
    if (includeOneway && this.oneway(tx, ty)) return (py - ty * TS) < 7;
    return false;
  }
  /** Is there floor directly under this point (within a few px)? */
  groundBelow(px: number, py: number, range = 4) {
    for (let d = 0; d <= range; d++) {
      const tx = Math.floor(px / TS), ty = Math.floor((py + d) / TS);
      if (this.solid(tx, ty) || this.oneway(tx, ty)) return true;
    }
    return false;
  }

  move(b: Body) {
    b.hitWall = false; b.hitCeil = false;
    if (b.dropTimer > 0) b.dropTimer--;
    // horizontal
    if (b.vx !== 0) {
      b.x += b.vx;
      const top = b.y - b.h + 1, bot = b.y - 1;
      const edge = b.vx > 0 ? b.x + b.w / 2 : b.x - b.w / 2;
      const tx = Math.floor(edge / TS);
      for (let ty = Math.floor(top / TS); ty <= Math.floor(bot / TS); ty++) {
        if (this.solid(tx, ty)) {
          b.x = b.vx > 0 ? tx * TS - b.w / 2 - 0.01 : (tx + 1) * TS + b.w / 2 + 0.01;
          b.hitWall = true;
          break;
        }
      }
    }
    // vertical
    const prevBottom = b.y;
    b.y += b.vy;
    const l = b.x - b.w / 2 + 1, r = b.x + b.w / 2 - 1;
    b.onGround = false;
    if (b.vy >= 0) {
      const ty = Math.floor(b.y / TS);
      for (let tx = Math.floor(l / TS); tx <= Math.floor(r / TS); tx++) {
        const t = this.get(tx, ty);
        const top = ty * TS;
        if (this.solidT(t) || (this.onewayT(t) && b.dropTimer <= 0 && prevBottom <= top + 0.5)) {
          if (this.solidT(t) && prevBottom > top + 8) continue; // deep inside a wall: let horizontal resolve it
          b.y = top; b.vy = 0; b.onGround = true;
          break;
        }
      }
    } else {
      const ty = Math.floor((b.y - b.h) / TS);
      for (let tx = Math.floor(l / TS); tx <= Math.floor(r / TS); tx++) {
        if (this.solid(tx, ty)) { b.y = (ty + 1) * TS + b.h; b.vy = 0; b.hitCeil = true; break; }
      }
    }
  }

  // ---------- rendering ----------
  /** Rails are sprites over the tiles, drawn for every kind of world once the stage is built. */
  buildRails(gfx: Gfx) {
    for (const r of this.rails) {
      const f = drawRail(r.x1 - r.x0, r.style, r.hang);
      const s = gfx.sprite(f, 13);
      s.x = r.x0; s.y = r.y; s.sync();
    }
  }
  build(gfx: Gfx) {
    this.gfx = gfx;
    for (let cy = 0; cy < Math.ceil(this.h / CHUNK); cy++)
      for (let cx = 0; cx < Math.ceil(this.w / CHUNK); cx++) this.buildChunk(cx, cy);
  }
  /** Repaint chunks after tiles changed (e.g. a destroyed gate). */
  rebuildArea(tx0: number, ty0: number, tx1: number, ty1: number) {
    for (let cy = Math.floor((ty0 - 1) / CHUNK); cy <= Math.floor((ty1 + 1) / CHUNK); cy++)
      for (let cx = Math.floor((tx0 - 1) / CHUNK); cx <= Math.floor((tx1 + 1) / CHUNK); cx++) this.buildChunk(cx, cy);
  }
  private buildChunk(cx: number, cy: number) {
    const gfx = this.gfx!;
    const key = cx + ',' + cy;
    const old = this.meshes.get(key);
    if (old) { gfx.scene.remove(old); (old.material as THREE.Material).dispose(); this.meshes.delete(key); }
    const pix = paintChunk((x, y) => this.get(x, y), cx, cy, CHUNK);
    if (!pix) return;
    // Include a margin so grass blades / outlines that spill above a chunk are kept:
    // simplest is to paint them into the chunk itself, which paintChunk does.
    const cv = pix.toCanvas();
    const mat = new THREE.MeshBasicMaterial({ map: tex(cv), transparent: true, depthTest: false, depthWrite: false });
    const size = CHUNK * TS;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.position.set(cx * size + size / 2, -(cy * size + size / 2), 0);
    m.renderOrder = 12;
    gfx.scene.add(m);
    this.meshes.set(key, m);
  }
}
