/** Space Land's type-3 liquid volume and moving ball effects, 00423f29. */
import type {Vec3} from '../formats/dat.ts';
import type {PlayerState} from './player.ts';
import type {Effect} from './effects.ts';
export const SPACE_BALL_PIT={xMin:0x3320e,xMax:0x5960e,zMin:0x269ca,zMax:0x49d8a,surface:-0x8200} as const;
export function spaceBallPitY(p:Vec3):number|null{
  const b=SPACE_BALL_PIT;return p.x>b.xMin&&p.x<b.xMax&&p.z>b.zMin&&p.z<b.zMax?b.surface:null;
}
export function createSpaceBallPit(exe:Uint8Array){
  if(exe.length<0xf2f30)throw Error('Executable is missing Space Land ball colours');
  // Four RGB triples stored as words; the original copies each low byte.
  return {colours:Array.from({length:4},(_,i)=>[exe[0xf2f18+i*6]!,exe[0xf2f1a+i*6]!,exe[0xf2f1c+i*6]!] as const)};
}
export type SpaceBallPit=ReturnType<typeof createSpaceBallPit>;
export function stepSpaceBallPit(s:SpaceBallPit,p:PlayerState,host:{gateFour:boolean;randomByte:()=>number;
  effect:(at:Vec3,kind:number,mode:number)=>Pick<Effect,'r'|'g'|'b'>|null;
}){
  if(!p.inBallPit||!host.gateFour||(p.forwardSpeed<=32&&Math.abs(p.vy)<=32))return;
  const e=host.effect({x:p.x,y:SPACE_BALL_PIT.surface,z:p.z},95,4),rgb=s.colours[host.randomByte()&3]!;
  if(e)[e.r,e.g,e.b]=rgb;
}
