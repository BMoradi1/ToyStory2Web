/** Shared collision-mover wordcode, 0048acc0. One instruction runs per tick. */
import type {Vec3} from '../formats/dat.ts';
export function createMoverScript(words:readonly number[]){return {words,pc:0,wait:0,ramp:0,velocity:{x:0,y:0,z:0}};}
export type MoverScript=ReturnType<typeof createMoverScript>;
export function stepMoverScript(s:MoverScript,at:Vec3,rest:Vec3,host:{
  bits:number;randomByte:()=>number;point:(path:number,node:number)=>Vec3|undefined;
},dt=1):void{
  const word=(n:number)=>{const v=s.words[s.pc+n];if(v===undefined)throw Error('Truncated mover script');return v;};
  const op=word(0);
  const stop=()=>{s.velocity={x:0,y:0,z:0};};
  if(op===0){s.pc-=word(1);s.wait=0;return;}
  if(op===2||op===3){
    if(s.wait===0){s.wait=op===2?word(1):(word(1)&host.randomByte())+word(2);return;}
    s.wait-=dt;if(s.wait<1){s.wait=0;s.pc+=op===2?2:3;}return;
  }
  if(op>=6&&op<=9){
    const mask=word(1);
    if(op===8)host.bits|=mask;
    if(op===9)host.bits&=~mask;
    if(op>=8||(op===6?(host.bits&mask)!==0:(host.bits&mask)===0))s.pc+=2;
    return;
  }
  if(op!==1&&op!==4&&op!==10)throw Error(`Unsupported mover opcode ${op}`);
  const target=op===1?{x:(rest.x>>5)+word(1),y:(rest.y>>5)+word(2),z:(rest.z>>5)+word(3)}:host.point(word(1),word(2));
  if(!target)throw Error('Mover script references a missing path point');
  const speed=word(op===1?4:3),length=op===1?5:4;
  const dx=target.x-(at.x>>5),dy=target.y-(at.y>>5),dz=target.z-(at.z>>5);
  const within=(r:number)=>Math.abs(dx)<r&&Math.abs(dy)<r&&Math.abs(dz)<r;
  if(op!==10){
    if(within(speed*4+48)&&s.ramp>0)s.ramp=-64;
    if(s.ramp<0)s.ramp=Math.min(0,s.ramp+dt*2);
    else if(s.ramp<64)s.ramp+=dt*2;
  }
  if((op!==10&&s.ramp===0)||within(speed+8)){
    s.ramp=s.wait=0;s.pc+=length;stop();return;
  }
  const rate=op===10?speed:Math.max(1,s.ramp<64?Math.abs(Math.trunc(s.ramp*speed/64)):speed);
  const distance=Math.hypot(dx,dy,dz);
  const axis=(v:number)=>(Math.trunc(v*4096/distance)*rate*dt>>7)<<16>>16;
  s.velocity={x:axis(dx),y:axis(dy),z:axis(dz)};
}
