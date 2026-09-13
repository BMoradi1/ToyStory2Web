/** Retail options artwork and root/volume timing from FUN_004371b0. */
import { PAD, setFade, stepFade, type FrontItem, type PadWord, type StepResult } from './screens.ts';
import type { KeyBindings, Action } from '../sim/input.ts';
export interface OptionsValues { sfx: number; bgm: number; activeCamera: boolean; detail: number; keys: KeyBindings }
export const CONTROL_ACTIONS: Action[] = ['up','down','left','right','jump','spin','fire','cameraLeft','cameraRight'];
export function createOptions(value: OptionsValues) {
  return { value: structuredClone(value), snapshot: structuredClone(value), page: -1, row: 0, subrow: 0,
    cursorY: 65 * 256, ticks: 0, remaining: -1, capture: false,
    fade: {level:0,target:128,speed:12} };
}
export function optionText(items: FrontItem[], text: string, y: number, scale = 2048, centre = 160) {
  const advance = scale === 2048 ? 8 : 6;
  let x = centre - Math.trunc(text.length * advance / 2);
  for(const ch of text) {
    const code=ch.charCodeAt(0);
    const frame=ch==="'"?47:ch===':'?31:ch==='0'?44:code>=49&&code<=57?code-14
      :code>=65&&code<=68?code-20:ch.toLowerCase().charCodeAt(0)-97;
    if(frame>=0 && frame<64 && ch!==' ') items.push({kind:'sprite',index:67,frame,x,y,space:320,colour:128,alpha:1,scaleX:scale,scaleY:scale});
    x+=advance;
  }
}
export function stepOptions(s: ReturnType<typeof createOptions>, pad: PadWord, text: (address:number)=>string): StepResult<'exit'> {
  stepFade(s.fade);s.ticks++;
  const items: FrontItem[]=[],sounds:number[]=[];
  const sprite=(index:number,frame:number,x:number,y:number)=>items.push({kind:'sprite',index,frame,x,y,space:320,colour:128,alpha:1,scaleX:4096,scaleY:4096});
  const edge=(bit:number)=>!!(pad.now&bit)&&!(pad.was&bit);
  if(s.capture&&edge(PAD.cancel))s.capture=false;
  if(s.remaining>=0)s.remaining=Math.max(0,s.remaining-1);
  else if(!s.capture){
    if(s.page===-1){
      const target=(65+s.row*20)*256;
      if(s.cursorY===target){
        if(pad.now&PAD.up&&s.row>0){s.row--;sounds.push(2);}
        else if(pad.now&PAD.down&&s.row<3){s.row++;sounds.push(2);}
        else if(edge(PAD.jump)){s.page=s.row;s.subrow=0;s.snapshot=structuredClone(s.value);sounds.push(1);}
      }
      const next=(65+s.row*20)*256;
      s.cursorY+=Math.sign(next-s.cursorY)*Math.min(160,Math.abs(next-s.cursorY));
      if(edge(PAD.cancel)){s.remaining=44;setFade(s.fade,0,6);sounds.push(3);}
    }else if(edge(PAD.cancel)){
      s.value=structuredClone(s.snapshot);s.page=-1;sounds.push(3);
    }else if(s.page===1||s.page===2){
      const key=s.page===1?'bgm':'sfx';
      const delta=edge(PAD.right)?1:edge(PAD.left)?-1:0;
      const value=Math.max(0,Math.min(10,s.value[key]+delta));
      if(value!==s.value[key]){s.value[key]=value;sounds.push(2);}
      if(edge(PAD.jump)){s.page=-1;sounds.push(1);}
    }else{
      const max=s.page===0?CONTROL_ACTIONS.length+1:0;
      if(edge(PAD.up)&&s.subrow>0){s.subrow--;sounds.push(2);}
      if(edge(PAD.down)&&s.subrow<max){s.subrow++;sounds.push(2);}
      if(s.page===3){
        const delta=edge(PAD.right)?1:edge(PAD.left)?-1:0;
        s.value.detail=Math.max(0,Math.min(2,s.value.detail+delta));
        if(delta)sounds.push(2);
        if(edge(PAD.jump)){s.page=-1;sounds.push(1);}
      }else if(edge(PAD.jump)){
        if(s.subrow===CONTROL_ACTIONS.length+1){s.page=-1;sounds.push(1);}
        else if(s.subrow===CONTROL_ACTIONS.length){s.value.activeCamera=!s.value.activeCamera;sounds.push(2);}
        else s.capture=true;
      }
    }
  }
  if(s.page===-1){
    sprite(52,16+((s.ticks>>1)&7),48,s.cursorY>>8);
    sprite(52,16+(((s.ticks>>1)+2)&7),240,s.cursorY>>8);
    optionText(items,text(0x4f5b1c),50);
    [0x4f5b24,0x4f5b3c,0x4f5b4c,0x4f6804].forEach((a,i)=>optionText(items,text(a),79+i*20));
    optionText(items,text(0x4f6814),190,1536);
  }else if(s.page===1||s.page===2){
    const value=s.page===1?s.value.bgm:s.value.sfx;
    optionText(items,text(s.page===1?0x4f5b3c:0x4f5b4c),50);
    const frame=Math.floor(s.ticks*(s.page===1?8:5+(value>>1))/16)%18;
    sprite((s.page===1?53:57)+(frame>=9?1:0),frame%9,117,76);
    sprite(55,value,119,166);
    if(s.ticks%40<20){if(value>0)sprite(56,3,50,158);if(value<10)sprite(56,2,239,158);}
    optionText(items,text(0x4f6830),190,1536);
  }else if(s.page===0){
    optionText(items,text(0x500948),40,1536);
    CONTROL_ACTIONS.forEach((action,i)=>{
      const name=action.replace('cameraLeft','camera left').replace('cameraRight','camera right');
      const key=s.value.keys[action][0]?.replace('Key','').replace('Arrow','')??'';
      if(s.subrow!==i||s.ticks%32<24)optionText(items,`${name}  ${key.toLowerCase()}`,62+i*11,1536);
    });
    if(s.subrow!==9||s.ticks%32<24)optionText(items,s.value.activeCamera?text(0x502730):text(0x502720),164,1536);
    if(s.subrow!==10||s.ticks%32<24)optionText(items,'accept',176,1536);
    optionText(items,s.capture?'press desired key':'jump:change  cancel:go back',190,1536);
  }else{
    optionText(items,text(0x5008bc),50);
    const labels=[0x5009f4,0x5009f8,0x5009fc];
    // The host resolves pointer-table text for this negative-address request.
    optionText(items,text(-labels[s.value.detail]!),100);
    optionText(items,text(0x5009bc),178,1536);
    optionText(items,text(0x5009d8),190,1536);
  }
  return {frame:{picture:0,items,fade:s.fade.level},sounds,done:s.remaining===0?'exit':null};
}
