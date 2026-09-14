/** PC colour gain, FUN_004b3740 / 004b37b0; not display-space power gamma. */
export type Gamma = 2 | 2.5 | 3;
let gamma: Gamma = 2;
export function getGamma(): Gamma { return gamma; }
export function setGamma(value: number): void {
  gamma = value === 2.5 || value === 3 ? value : 2;
}
/** The retail 16.16 lookup truncates, clamps RGB and leaves alpha alone. */
export function gammaByte(value: number, gain: Gamma = gamma): number {
  return Math.min(255, Math.floor(Math.max(0, value) * gain));
}
/** Renderer inputs use the port's 0x80-neutral modulation convention. */
export function gammaModulate(value: number, gain: Gamma = gamma): number {
  return gammaByte(Math.round(value * 128), gain) / 255;
}
