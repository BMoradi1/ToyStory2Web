/** Path 58 guide points: FUN_00414550, FUN_0049fb40 and FUN_0049fab0. */
import { spawnChild, type EffectSim, type EffectWorld } from './effects.ts';
export interface GuidePoint { x: number; y: number; z: number; kind: number; index: number; spent: boolean }
export interface GuideSparkles { points: GuidePoint[]; phase: number }
export function createGuideSparkles(path: readonly { x: number; y: number; z: number }[]): GuideSparkles {
  let kind = 0x71, index = 0;
  const points: GuidePoint[] = [];
  for (const p of path) {
    if (p.x === 0 && p.y === 0 && p.z === 0) { kind = 0x73; index = 0; continue; }
    points.push({ x: p.x * 32, y: p.y * 32, z: p.z * 32, kind, index: index++, spent: false });
  }
  return { points, phase: 0 };
}
export function spendGuide(s: GuideSparkles, effects: EffectSim | null, index: number, secondary: boolean): void {
  const p = s.points.find(p => p.kind === (secondary ? 0x73 : 0x71) && p.index === index);
  if (!p || p.spent) return;
  p.spent = true;
  // Kill matching live emitters too, not just future spawns. Their children can finish fading.
  for (const e of effects?.effects ?? []) {
    if (e.kind === p.kind && e.x === p.x && e.y === p.y && e.z === p.z) e.life = 0;
  }
}
export function stepGuideSparkles(s: GuideSparkles, effects: EffectSim, world: EffectWorld): void {
  if (!effects.gate.sixteen) return;
  for (let i = s.phase; i < s.points.length; i += 4) {
    const p = s.points[i]!;
    if (p.spent) continue;
    const distance = ((world.cameraX - p.x) >> 8) ** 2 + ((world.cameraY - p.y) >> 8) ** 2 + ((world.cameraZ - p.z) >> 8) ** 2;
    if (distance < 0x57e40) spawnChild(effects, world, p.x, p.y, p.z, p.kind, 2);
  }
  s.phase = (s.phase + 1) % Math.max(1, Math.min(4, s.points.length));
}
