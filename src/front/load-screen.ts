/** Retail PC load/save pages, FUN_0049b9e0, in 512 x 256 text space. */
import type { Progress } from '../loader/save.ts';
import { PAD, stepFade, type FrontItem, type PadWord, type StepResult } from './screens.ts';
import { layoutBigText } from './text.ts';
export interface SaveSlot { name: string; progress: Progress | null }
export function createLoadScreen(slots: SaveSlot[]) {
  return {slots,page:'root' as 'root'|'load'|'save',row:0,ticks:0,message:'',fade:{level:0,target:128,speed:12}};
}
export function stepLoadScreen(s: ReturnType<typeof createLoadScreen>,pad:PadWord,text:(a:number)=>string):StepResult<string>{
  stepFade(s.fade);s.ticks++;
  const items:FrontItem[]=[],sounds:number[]=[];
  const line=(value:string,y:number)=>items.push({kind:'big',glyphs:layoutBigText(value,256,y),space:512,colour:[255,255,255]});
  const edge=(b:number)=>!!(pad.now&b)&&!(pad.was&b);
  let done:string|null=null;
  if(s.fade.level===128){
    const max=s.page==='root'?2:s.slots.length-1;
    if(edge(PAD.up)&&s.row>0){s.row--;sounds.push(2);}
    if(edge(PAD.down)&&s.row<max){s.row++;sounds.push(2);}
    if(edge(PAD.cancel)){if(s.page==='root')done='exit';else{s.page='root';s.row=0;s.message='';}sounds.push(3);}
    else if(edge(PAD.jump)){
      if(s.page==='root'){
        if(s.row===2)done='exit';else{s.page=s.row===0?'load':'save';s.row=0;s.message='';}sounds.push(1);
      }else if(s.page==='save'||s.slots[s.row]?.progress){done=`${s.page}:${s.row}`;sounds.push(1);}
    }
  }
  if(s.page==='root'){
    line(text(0x50078c),25);
    [0x5007a0,0x5007ac,0x5007b8].forEach((a,i)=>{if(i!==s.row||s.ticks%20<10)line(text(a),75+i*25);});
  }else{
    line(text(s.page==='load'?0x5007c4:0x50082c),3);
    s.slots.forEach((slot,i)=>{if(i!==s.row||s.ticks%20<10)line(slot.progress?slot.name:text(0x5007d8),33+i*23);});
    line(text(0x5007e4),238);
  }
  if(s.message)line(s.message,216);
  return{frame:{picture:0,items,fade:s.fade.level},sounds,done};
}
