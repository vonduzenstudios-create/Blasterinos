import * as THREE from 'three';
import type { Frame } from './pixel';

// The game renders at a fixed low resolution and the canvas is scaled up with
// nearest-neighbour filtering, so every texel lands on a crisp screen pixel.
export const VW = 384;
export const VH = 216;

const texCache = new WeakMap<HTMLCanvasElement, THREE.Texture>();
export function tex(cv: HTMLCanvasElement, repeat = false): THREE.Texture {
  let t = texCache.get(cv);
  if (!t) {
    t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
    texCache.set(cv, t);
  }
  return t;
}

const spriteVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const spriteFrag = /* glsl */`
  uniform sampler2D map;
  uniform float flash;
  uniform vec3 flashColor;
  uniform vec3 tint;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < 0.02) discard;
    vec3 col = mix(c.rgb * tint, flashColor, flash);
    gl_FragColor = vec4(col, c.a * opacity);
    #include <colorspace_fragment>
  }
`;

const quad = new THREE.PlaneGeometry(1, 1);

export class Sprite {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  frame: Frame;
  x = 0; y = 0;
  flip = false;
  rot = 0;
  scale = 1;
  private gfx: Gfx;
  constructor(gfx: Gfx, f: Frame, z: number, additive = false) {
    this.gfx = gfx;
    this.frame = f;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex(f.canvas) },
        flash: { value: 0 },
        flashColor: { value: new THREE.Color(1, 1, 1) },
        tint: { value: new THREE.Color(1, 1, 1) },
        opacity: { value: 1 },
      },
      vertexShader: spriteVert,
      fragmentShader: spriteFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(quad, this.mat);
    this.mesh.renderOrder = z;
    this.mesh.position.z = z * 0.001;
    gfx.scene.add(this.mesh);
  }
  set z(v: number) { this.mesh.renderOrder = v; }
  get z() { return this.mesh.renderOrder; }
  setFrame(f: Frame) {
    if (f === this.frame) return;
    this.frame = f;
    this.mat.uniforms.map.value = tex(f.canvas);
  }
  set flash(v: number) { this.mat.uniforms.flash.value = v; }
  set opacity(v: number) { this.mat.uniforms.opacity.value = v; }
  setFlashColor(r: number, g: number, b: number) { this.mat.uniforms.flashColor.value.setRGB(r, g, b); }
  setTint(r: number, g: number, b: number) { this.mat.uniforms.tint.value.setRGB(r, g, b); }
  set visible(v: boolean) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
  /** Place the sprite so its anchor sits at (x, y) in world pixels (y grows downward). */
  sync() {
    const f = this.frame;
    const sx = this.flip ? -1 : 1;
    const s = this.scale;
    const px = Math.round(this.x), py = Math.round(this.y);
    let cx = (f.w / 2 - f.ax) * s * sx;
    let cy = (f.h / 2 - f.ay) * s;
    if (this.rot !== 0) {
      const c = Math.cos(this.rot), sn = Math.sin(this.rot);
      const rx = cx * c - cy * sn, ry = cx * sn + cy * c;
      cx = rx; cy = ry;
    }
    // Odd sized frames would land on half pixels; nudge so texels stay aligned.
    const ox = (f.w * s) % 2 === 1 ? 0.5 : 0, oy = (f.h * s) % 2 === 1 ? 0.5 : 0;
    this.mesh.position.x = px + Math.round(cx - ox) + ox;
    this.mesh.position.y = -(py + Math.round(cy - oy) + oy);
    this.mesh.scale.set(f.w * s * sx, f.h * s, 1);
    this.mesh.rotation.z = -this.rot;
  }
  remove() {
    this.gfx.scene.remove(this.mesh);
    this.mat.dispose();
  }
}

export class Gfx {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  camX = 0; camY = 0;
  shake = 0;
  private shakeX = 0; private shakeY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(VW, VH, false);
    this.renderer.setClearColor(0x000000);
    this.camera = new THREE.OrthographicCamera(0, VW, 0, -VH, -100, 100);
    this.camera.position.z = 10;
  }
  sprite(f: Frame, z: number, additive = false) { return new Sprite(this, f, z, additive); }
  update() {
    if (this.shake > 0.1) {
      this.shakeX = (Math.random() * 2 - 1) * this.shake;
      this.shakeY = (Math.random() * 2 - 1) * this.shake;
      this.shake *= 0.86;
    } else { this.shake = 0; this.shakeX = this.shakeY = 0; }
    this.camera.position.x = Math.round(this.camX + this.shakeX);
    this.camera.position.y = -Math.round(this.camY + this.shakeY);
  }
  render() { this.renderer.render(this.scene, this.camera); }
  clear() {
    for (const c of [...this.scene.children]) {
      this.scene.remove(c);
      const m = c as THREE.Mesh;
      if (m.material && (m.material as THREE.Material).dispose) (m.material as THREE.Material).dispose();
    }
  }
}

/** A full-screen layer that scrolls with the camera at a parallax factor. */
export class Parallax {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: THREE.Texture;
  fx: number; fy: number; baseY: number; w: number; h: number;
  repeatY: boolean;
  constructor(gfx: Gfx, cv: HTMLCanvasElement, z: number, fx: number, fy: number, baseY: number, repeatY = false) {
    this.t = tex(cv, true).clone();
    this.t.needsUpdate = true;
    this.t.wrapT = repeatY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    this.w = cv.width; this.h = cv.height;
    this.fx = fx; this.fy = fy; this.baseY = baseY; this.repeatY = repeatY;
    this.mat = new THREE.MeshBasicMaterial({ map: this.t, transparent: true, depthTest: false, depthWrite: false });
    const width = VW + 2;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, cv.height), this.mat);
    this.mesh.renderOrder = z;
    this.t.repeat.set(width / cv.width, 1);
    gfx.scene.add(this.mesh);
  }
  update(camX: number, camY: number) {
    const cx = Math.round(camX), cy = Math.round(camY);
    this.mesh.position.x = cx + VW / 2;
    this.t.offset.x = (Math.round(cx * this.fx) % this.w) / this.w;
    if (this.repeatY) {
      this.mesh.position.y = -(cy + this.h / 2);
      this.t.offset.y = (Math.round(cy * this.fy) % this.h) / this.h;
    } else {
      const top = cy + this.baseY - Math.round(cy * this.fy);
      this.mesh.position.y = -(Math.round(top) + this.h / 2);
    }
  }
}
