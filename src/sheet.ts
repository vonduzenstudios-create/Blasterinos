// Debug view: ?sheet renders every generated sprite so art can be reviewed.
import type { Frame } from './engine/pixel';

export function showSheet(groups: [string, Frame[]][]) {
  document.body.innerHTML = '';
  document.body.style.background = '#556';
  document.body.style.overflow = 'auto';
  const S = 3;
  for (const [name, frames] of groups) {
    const h = document.createElement('div');
    h.textContent = name; h.style.cssText = 'color:#fff;font:12px monospace;margin:6px';
    document.body.appendChild(h);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:4px;align-items:flex-start';
    for (const f of frames) {
      const c = document.createElement('canvas');
      c.width = f.w * S; c.height = f.h * S;
      c.style.background = '#8a9';
      const x = c.getContext('2d')!;
      x.imageSmoothingEnabled = false;
      x.drawImage(f.canvas, 0, 0, f.w * S, f.h * S);
      x.fillStyle = 'rgba(255,0,0,.8)'; x.fillRect(f.ax * S, f.ay * S, S, S);
      row.appendChild(c);
    }
    document.body.appendChild(row);
  }
}
