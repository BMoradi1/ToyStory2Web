/** Browser approximation: add directional light to existing model colours.
 * Face normals come from posed triangles, pending retail normal/light decoding.
 * Inputs are model-space direction and un-gamma-corrected RGB bytes. */
export function lightPlayerColours(positions:Float32Array,base:Float32Array,
  direction:readonly [number,number,number],colour:readonly [number,number,number]):Float32Array{
  const out=base.slice(),length=Math.hypot(...direction);
  if(length===0)return out;
  for(let i=0;i+8<positions.length;i+=9){
    const ax=positions[i+3]!-positions[i]!,ay=positions[i+4]!-positions[i+1]!,az=positions[i+5]!-positions[i+2]!;
    const bx=positions[i+6]!-positions[i]!,by=positions[i+7]!-positions[i+1]!,bz=positions[i+8]!-positions[i+2]!;
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
    const norm=Math.hypot(nx,ny,nz);if(!norm)continue;
    const weight=Math.max(0,(nx*direction[0]+ny*direction[1]+nz*direction[2])/(norm*length));
    for(let v=0;v<3;v++)for(let c=0;c<3;c++)out[i+v*3+c]!+=weight*colour[c]!/128;
  }
  return out;
}
