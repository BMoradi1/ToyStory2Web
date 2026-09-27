/** Tarmac light pads: 0042d710/0042db10 and the puzzle branch of 0042e790. */
export const TARMAC_LIGHT_OBJECTS = [31,32,33,34,35,36,37,38,39,40,41,42,43,44,51,52,
  54,55,56,57,76,77,78,79,80,81,82,83];
type Point = { x: number; y: number; z: number };
export const LIGHT_PUZZLE_CENTRE: Point = { x: -0xd2ac0, y: -0xf9f7, z: -0x98d72 };

/** Set this pad's light and clear its predecessor, retaining the goal nibble. */
export function pressLight(bits: number, button: number) {
  if (!Number.isInteger(button) || button < 0 || button > 3) throw Error('Invalid light pad');
  const on = 1 << button, off = 1 << ((button + 3) & 3);
  return { bits: (bits & ~(on | off)) | on,
    changes: Number((bits & on) === 0) + Number((bits & off) !== 0) };
}

function scramble(random: () => number): number {
  // Retail chooses a pattern, applies three two-bit changes, then swaps the
  // current/goal rows. Use the installed random stream, never Math.random.
  for (let tries=0; tries<4096; tries++) {
    let bits=(random() & 15)*17, changes=0;
    for (let n=0;n<3;n++) { const next=pressLight(bits,random() & 3); bits=next.bits; changes+=next.changes; }
    if ((bits & 15)!==(bits >> 4) && changes===6) return ((bits & 15)<<4)|(bits>>4);
  }
  throw Error('Random data could not generate a Tarmac light puzzle');
}
export function createTarmacLights(random: () => number) {
  return { bits: scramble(random), attempts: 3, shownAttempts: 3, entered: false,
    button: -1, flash: 0, height: 0, cameraTicks: 0,
    sequence: null as number | null, startCamera: false, trackCamera: false,
    guidesSpent: false };
}
export type TarmacLights = ReturnType<typeof createTarmacLights>;
export function lightsMatch(s: TarmacLights) { return (s.bits & 15)===(s.bits>>4); }
export function inLightPuzzle(p: Point) {
  const x=(p.x-LIGHT_PUZZLE_CENTRE.x)>>8,y=(p.y-LIGHT_PUZZLE_CENTRE.y)>>8,z=(p.z-LIGHT_PUZZLE_CENTRE.z)>>8;
  return x*x+y*y+z*z < 500*500;
}
function reset(s: TarmacLights, random: () => number) {
  s.bits=scramble(random);s.attempts=s.shownAttempts=3;s.flash=0;s.button=-1;
}

export function stepTarmacLights(s: TarmacLights, p: Point, stompImpact: boolean, surface: number,
  random: () => number, cameraBusy: boolean) {
  s.sequence=null;s.startCamera=s.trackCamera=s.guidesSpent=false;
  if (inLightPuzzle(p)) {
    if (!s.entered) reset(s,random);
    s.entered=true;
    if (lightsMatch(s) && s.attempts>=0) {
      s.attempts=(s.attempts+1)&63;
      if(s.attempts>20&&s.bits===0)s.bits=255;
      if(s.attempts<20&&s.bits!==0)s.bits=0;
      if(s.height<48000)s.height+=128;
      if(s.cameraTicks>=0) {
        if(s.cameraTicks===0){s.startCamera=true;s.sequence=-5;}
        s.trackCamera=true;
        if(++s.cameraTicks>299)s.cameraTicks=-1;
      }
    } else if (s.attempts<=0) {
      if(s.attempts===0)s.bits=0;
      if(--s.attempts < -60){reset(s,random);if(!cameraBusy)s.sequence=-6;}
    } else if(stompImpact&&surface>=32&&surface<=35) {
      s.attempts--;s.shownAttempts=s.attempts;
      s.button=surface-32;s.flash=12;
      s.bits=pressLight(s.bits,s.button).bits;s.guidesSpent=true;
    }
  }
  if(s.flash>0)s.flash--;
}

/** Authored alternative meshes are shown/hidden by 004ccb20's uniform scale. */
export function lightScales(s: TarmacLights): Map<number, number> {
  const out=new Map<number,number>();
  for(let i=0;i<4;i++) {
    const bit=1<<(3-i), currentOn=(s.bits & bit)!==0, goalOn=(s.bits & (bit<<4))!==0;
    out.set(35+i,Number(!currentOn));out.set([43,44,51,52][i]!,Number(currentOn));
    out.set(31+i,Number(!goalOn));out.set(39+i,Number(goalOn));
    out.set(54+i,Number(i===s.shownAttempts));
    const down=s.flash>0&&s.button===i;
    out.set(76+i,Number(!down));out.set(80+i,Number(down));
  }
  return out;
}

/** 0042e790 places the rotor sound three quarters of the way toward the eye. */
export function helicopterSoundPoint(helicopter: Point, eye: Point): Point {
  return { x: helicopter.x+Math.trunc((eye.x-helicopter.x)*3/4),
    y: helicopter.y+Math.trunc((eye.y-helicopter.y)*3/4),
    z: helicopter.z+Math.trunc((eye.z-helicopter.z)*3/4) };
}
