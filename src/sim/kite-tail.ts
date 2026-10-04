/** Neighborhood tail chain: 0044e620/0044e710. Positions use game units. */
export interface TailPoint {x:number;y:number;z:number}
export function createKiteTail(at:TailPoint){
  return {visible:false,points:Array.from({length:16},(_,i)=>({x:at.x,y:at.y+i*4096,z:at.z})),
    velocities:Array.from({length:16},()=>({x:0,y:0,z:0}))};
}
export type KiteTail=ReturnType<typeof createKiteTail>;
const short=(n:number)=>n<<16>>16;
/** The original has a local roof box rather than querying terrain. */
export function collideTailRoof(p:TailPoint,v:TailPoint,dt=1):void{
  if(p.x<=0x1cdc3||p.x>=0x32350||p.z<=0x2ce97||p.z>=0x4cad0||p.y<=-0x721c7)return;
  if(p.x>=0x1c9c4&&p.x<0x31750&&p.z>=0x2ca98&&p.z<0x4bed0){p.y=-0x722c6;return;}
  const dx=p.x-0x1cdc4<=0x32350-p.x?p.x-0x1cdc4:p.x-0x32350;
  const dz=p.z-0x2ce98<=0x4cad0-p.z?p.z-0x2ce98:p.z-0x4cad0;
  const depth=p.y+0x721c6;
  if(Math.abs(dx)<depth){
    if(Math.abs(dx)<Math.abs(dz))p.x=dx>0?0x1ccc4:0x32450;
    else p.z=dz>0?0x2cd98:0x4cbd0;
    v.y=short(v.y-Math.trunc(dt*96*6/4));
  }else if(Math.abs(dz)<depth){p.z=dz>0?0x2cd98:0x4cbd0;v.y=short(v.y-Math.trunc(dt*96*6/4));}
  else p.y=-0x722c6;
}
export function stepKiteTail(s:KiteTail,anchor:TailPoint,camera:TailPoint,phase:number,dt=1):void{
  const dx=(camera.x-anchor.x)>>8,dy=(camera.y-anchor.y)>>8,dz=(camera.z-anchor.z)>>8;
  s.visible=phase!==200&&dx*dx+dy*dy+dz*dz<800*800;
  if(!s.visible)return;
  const points=s.points,vs=s.velocities;points[0]={...anchor};
  const constrained:TailPoint[]=[{...anchor}];
  for(let i=1;i<points.length;i++){
    const p=points[i]!,prev=points[i-1]!,v=vs[i]!;
    p.x+=v.x;p.y+=v.y;p.z+=v.z;
    const x=(p.x-prev.x)>>3,y=(p.y-prev.y)>>3,z=(p.z-prev.z)>>3;
    const length=Math.hypot(x,y,z);
    // Coincident points are undefined in the original FP helper; hang down.
    constrained.push(length?{x:prev.x+Math.trunc(x*4096/length),y:prev.y+Math.trunc(y*4096/length),z:prev.z+Math.trunc(z*4096/length)}:{x:prev.x,y:prev.y+4096,z:prev.z});
  }
  for(let i=1;i<points.length;i++){
    const p=points[i]!,q=constrained[i]!,v=vs[i]!,next=points[i+1],qn=constrained[i+1];
    for(const key of ['x','y','z'] as const){
      v[key]=short(Math.trunc(v[key]*30/32)+((q[key]-p[key])>>4)+(next&&qn?((next[key]-qn[key])>>5):0)+(key==='y'?dt*96:0));
    }
  }
  for(let i=1;i<points.length;i++){const q=constrained[i]!;collideTailRoof(q,vs[i]!,dt);points[i]=q;}
}
