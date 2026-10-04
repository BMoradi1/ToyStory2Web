/** 0044eb90: red line segments and sprite-51 bows at all 16 chain points. */
import * as THREE from 'three';
import {SpriteBatch,effectCardPlacement,type WorldSprite} from './world-sprites.ts';
import type {KiteTail} from '../sim/kite-tail.ts';
import type {SpriteHeader} from '../formats/sprite-table.ts';
import {gammaModulate} from './gamma.ts';
export class KiteTailRenderer {
  readonly group=new THREE.Group();
  readonly bows=new SpriteBatch(false,'normal');
  readonly line:THREE.LineSegments;
  private readonly geometry=new THREE.BufferGeometry();
  private cards:WorldSprite[]=[];
  constructor(){
    this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(90),3));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(90),3));
    this.line=new THREE.LineSegments(this.geometry,new THREE.LineBasicMaterial({vertexColors:true,toneMapped:false}));
    this.line.frustumCulled=false;this.group.add(this.line,this.bows.mesh);this.group.visible=false;
  }
  set(tail:KiteTail|null,header:SpriteHeader|undefined,texture:THREE.Texture|null,size:{width:number;height:number}|undefined):void{
    this.cards=[];this.group.visible=!!tail?.visible;
    if(!tail?.visible){this.bows.setSheet(null);return;}
    const positions=this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colours=this.geometry.getAttribute('color') as THREE.BufferAttribute;
    const frame=header?.frames[0];this.bows.setSheet(texture);
    for(let i=0;i<tail.points.length;i++){
      const p=tail.points[i]!,at=effectCardPlacement({...p,width:140,height:140});
      if(header&&frame&&size)this.cards.push({...at,u0:frame.u/size.width,v0:frame.v/size.height,
        u1:(frame.u+header.width)/size.width,v1:(frame.v+header.height)/size.height,alpha:1});
      if(i===tail.points.length-1)break;
      const b=effectCardPlacement({...tail.points[i+1]!,width:0,height:0});
      positions.setXYZ(i*2,at.x,at.y,at.z);positions.setXYZ(i*2+1,b.x,b.y,b.z);
      const red=gammaModulate((128-i*4)/255);
      colours.setXYZ(i*2,red,0,0);colours.setXYZ(i*2+1,red,0,0);
    }
    this.geometry.setDrawRange(0,(tail.points.length-1)*2);positions.needsUpdate=colours.needsUpdate=true;
  }
  update(camera:THREE.Camera):void{this.bows.update(this.cards,camera);}
}
