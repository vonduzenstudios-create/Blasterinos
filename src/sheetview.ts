// Debug view (?sheet): renders every generated sprite so the art can be reviewed.
import { LOOKS, buildHero } from './art/humanoid';
import { buildFx } from './art/fx';
import { buildEnemyArt } from './art/enemies';
import { buildProps } from './art/props';
import { buildHydra } from './art/hydra';
import { buildDesert } from './art/desert';
import { buildBeach } from './art/beach';
import { buildSnow } from './art/snow';
import { buildHive } from './art/hive';
import { showSheet } from './sheet';

export function run() {
  const groups: [string, any[]][] = [];
  for (const k of ['ryder', 'voss', 'vossBare']) {
    const h = buildHero(LOOKS[k]);
    groups.push([k, [...Object.values(h.stand), ...Object.values(h.air), ...h.run.f, h.prone, ...h.curl, h.hang, h.hurt, h.dead, ...h.bits]]);
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
  const d = buildDesert();
  const asFrame = (c: HTMLCanvasElement) => ({ canvas: c, w: c.width, h: c.height, ax: 0, ay: 0 });
  groups.push(['desert backdrops', [asFrame(d.sky), asFrame(d.mesas), asFrame(d.dunes), asFrame(d.near)]]);
  groups.push(['desert props', [...d.cactus, d.ribs, d.skull, d.sign, d.wreck, d.barrel, d.tower, ...d.boulder]]);
  groups.push(['vehicles', [...d.jeep, d.jeepWreck, d.driver, ...d.bike, d.heli, d.heliWreck, ...d.heliRotor, ...d.bomb, ...d.sandball]]);
  groups.push(['sandworm', [...d.wormSeg, ...d.wormHead, d.mound, ...d.ripple, ...d.larva]]);
  const b = buildBeach();
  groups.push(['beach backdrops', [asFrame(b.sky), asFrame(b.islands)]]);
  groups.push(['beach props', [...b.palm, b.hedgehog, b.tower, b.boat, b.piling, b.starfish, b.shells, b.grass, b.crate]]);
  groups.push(['abyssal clam', [b.shell, ...b.core, ...b.pearl, b.bigPearl, ...b.geyser, ...b.bubbles, ...b.crab, b.crabEyes, ...b.fish]]);
  const sn = buildSnow();
  groups.push(['snow backdrops', [asFrame(sn.sky), asFrame(sn.peaks), asFrame(sn.firs), asFrame(sn.near)]]);
  groups.push(['snow props', [...sn.pine, sn.rock, sn.beacon, sn.mast, sn.lamp, sn.crates, sn.outpost, ...sn.thinIce]]);
  groups.push(['snow foes', [...sn.grenadier, ...sn.grenade, ...sn.snowball, sn.boulder, ...sn.puff, ...sn.wave, ...sn.skier, sn.skierAir]]);
  groups.push(['glacier walker', [...sn.walker.stand, ...sn.walker.walk, sn.walker.crouch, sn.walker.air, sn.walker.vent, sn.walker.down, sn.arm, ...sn.hammer, sn.mine, ...sn.scrap, sn.shadow]]);
  const hv = buildHive();
  groups.push(['hive backdrops', [asFrame(hv.sky), asFrame(hv.far), asFrame(hv.near)]]);
  groups.push(['hive props', [...hv.pod, hv.tendril, hv.eggCluster, hv.bones, ...hv.pustule, ...hv.egg, ...hv.plasma]]);
  groups.push(['hive brood pods + hatchlings', [...hv.broodPod, ...hv.hatchling, hv.hatchlingCurl, ...hv.splat]]);
  groups.push(['hive queen', [hv.abdomen, hv.torso, ...hv.core, ...hv.head, hv.arm, hv.leg]]);
  showSheet(groups);
}
