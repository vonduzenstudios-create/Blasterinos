// Debug view (?sheet): renders every generated sprite so the art can be reviewed.
import { LOOKS, buildHero } from './art/humanoid';
import { buildFx } from './art/fx';
import { buildEnemyArt } from './art/enemies';
import { buildProps } from './art/props';
import { buildHydra } from './art/hydra';
import { showSheet } from './sheet';

export function run() {
  const groups: [string, any[]][] = [];
  for (const k of ['ryder', 'voss']) {
    const h = buildHero(LOOKS[k]);
    groups.push([k, [...Object.values(h.stand), ...Object.values(h.air), ...h.run.f, h.prone, ...h.curl, h.hang, h.hurt, h.dead]]);
  }
  const fx = buildFx();
  groups.push(['fx', [...fx.boomM, ...Object.values(fx.bullet).flat(), ...fx.enemyBullet, ...fx.spit, ...fx.flash, ...fx.splash, fx.hook, ...Object.values(fx.falcon).map((f) => f[0]), ...fx.capsule]]);
  const e = buildEnemyArt();
  groups.push(['enemies', [e.soldier.stand.f, e.sniper.stand.uf, ...e.soldierRun, ...e.turret.slice(0, 6), e.turretClosed, e.leaper.crouch, e.leaper.jump, ...e.drone, ...e.crawler, e.sandbag]]);
  groups.push(['gate', [e.gate.intact, ...e.gate.core, ...e.gate.cannon]]);
  const pr = buildProps();
  groups.push(['props', [...pr.tree, ...pr.bush, pr.pillar, pr.statue, pr.vine, pr.skulls]]);
  const hy = buildHydra();
  groups.push(['hydra', [hy.body, ...hy.head, hy.neck, hy.neckBelly, hy.stump, ...hy.claw, hy.forearm, ...hy.core, hy.coreShell]]);
  showSheet(groups);
}
