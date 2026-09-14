/** Retail options artwork and root/volume timing from FUN_004371b0. */
import type { Gamma } from '../render/gamma.ts';
import { PAD, setFade, stepFade, type FrontItem, type PadWord, type StepResult } from './screens.ts';
import { DEFAULT_PAD, validBindingCode, type PadBindings, type KeyBindings, type Action } from '../sim/input.ts';
export interface OptionsValues { sfx: number; bgm: number; activeCamera: boolean; detail: number; keys: KeyBindings; pad?: PadBindings; animatedTextures?: boolean; gamma?: Gamma; lensFlare?: boolean }
export const CONTROL_ACTIONS: Action[] = ['up','down','left','right','jump','fire','spin','cameraLeft','cameraRight'];
export function createOptions(value: OptionsValues) {
  const values={...structuredClone(value),pad:structuredClone(value.pad??DEFAULT_PAD),animatedTextures:value.animatedTextures??true,gamma:value.gamma??2,lensFlare:value.lensFlare??true};
  return { value: structuredClone(values), snapshot: structuredClone(values), page: -1, row: 0, subrow: 0,
    cursorY: 65 * 256, ticks: 0, remaining: -1, capture: false, controlTop: 0, captureLock: 0, controlDevice: 'keyboard' as 'keyboard'|'gamepad', gfxRepeat: 0, queuedSounds: [] as number[],
    fade: {level:0,target:128,speed:12} };
}
export function optionText(items: FrontItem[], text: string, y: number, scale = 2048, centre = 160, align: 'centre'|'left'|'right' = 'centre') {
  const advance = scale === 2048 ? 8 : 6;
  let x = centre - (align === 'left' ? 0 : Math.trunc(text.length * advance / (align === 'right' ? 1 : 2)));
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
  const items: FrontItem[]=[],sounds:number[]=s.queuedSounds.splice(0);
  const sprite=(index:number,frame:number,x:number,y:number)=>items.push({kind:'sprite',index,frame,x,y,space:320,colour:128,alpha:1,scaleX:4096,scaleY:4096});
  const edge=(bit:number)=>!!(pad.now&bit)&&!(pad.was&bit);
  const cancelledCapture=s.capture&&edge(PAD.cancel);
  if(cancelledCapture){s.capture=false;s.captureLock=30;sounds.push(3);}
  if(s.captureLock>0)s.captureLock--;
  if(s.remaining>=0)s.remaining=Math.max(0,s.remaining-1);
  else if(!s.capture&&!cancelledCapture&&!(s.page===0&&s.captureLock>0)){
    if(s.page===-1){
      const target=(65+s.row*20)*256;
      if(s.cursorY===target){
        if(pad.now&PAD.up&&s.row>0){s.row--;sounds.push(2);}
        else if(pad.now&PAD.down&&s.row<3){s.row++;sounds.push(2);}
        else if(edge(PAD.jump)){s.page=s.row;s.subrow=0;s.controlTop=0;s.captureLock=0;s.snapshot=structuredClone(s.value);sounds.push(1);}
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
      const max=s.page===0?CONTROL_ACTIONS.length+1:3;
      if(edge(PAD.up)&&s.subrow>0){s.subrow--;sounds.push(2);}
      if(edge(PAD.down)&&s.subrow<max){s.subrow++;sounds.push(2);}
      if(s.page===3){
        const delta=s.gfxRepeat>0?0:pad.now&PAD.right?1:pad.now&PAD.left?-1:0;
        if(s.gfxRepeat>0)s.gfxRepeat--;
        else if(delta)s.gfxRepeat=15;
        if(s.subrow===0){if(delta)s.value.lensFlare=!s.value.lensFlare;}
        else if(s.subrow===1)s.value.detail=Math.max(0,Math.min(2,s.value.detail+delta));
        else if(s.subrow===2)s.value.gamma=Math.max(2,Math.min(3,s.value.gamma+delta*0.5)) as Gamma;
        else if(delta)s.value.animatedTextures=!s.value.animatedTextures;
        if(delta)sounds.push(2);
        if(edge(PAD.jump)){s.page=-1;sounds.push(1);}
      }else if(edge(PAD.jump)&&s.captureLock===0){
        if(s.subrow===CONTROL_ACTIONS.length+1){s.page=-1;sounds.push(1);}
        else if(s.subrow===CONTROL_ACTIONS.length){s.value.activeCamera=!s.value.activeCamera;sounds.push(2);}
        else {s.capture=true;s.captureLock=30;sounds.push(1);}
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
    optionText(items,text(0x500948),46);
    s.controlTop=Math.min(s.controlTop,s.subrow);
    if(s.subrow>s.controlTop+4)s.controlTop=s.subrow-4;
    const blink=s.ticks%20<10;
    for(let i=s.controlTop;i<=Math.min(s.controlTop+4,CONTROL_ACTIONS.length+1);i++) {
      const y=80+(i-s.controlTop)*16, action=CONTROL_ACTIONS[i];
      if(action) {
        const label=action.replace('cameraLeft','camera left').replace('cameraRight','camera right');
        if(i!==s.subrow||s.capture||blink)optionText(items,label,y,2048,150,'right');
        if(i!==s.subrow||!s.capture||blink)optionText(items,s.controlDevice==='gamepad'?`button ${(s.value.pad[action][0]??0)+1}`:keyName(s.value.keys[action][0]??''),y,2048,160,'left');
      }else if(i!==s.subrow||blink)optionText(items,i===CONTROL_ACTIONS.length
        ? text(s.value.activeCamera?0x502730:0x502720) : 'accept',y);
    }
    if(blink){
      if(s.controlTop>0)sprite(67,45,152,64);
      if(s.controlTop+5<CONTROL_ACTIONS.length+2)sprite(67,46,152,150);
    }
    if(s.capture)optionText(items,text(0x5009a0),182,1536);
    else {optionText(items,text(0x500960),178,1536);optionText(items,text(0x500980),186,1536);}

  }else{
    optionText(items,text(0x5008bc),50);
    const labels=[0x5009f4,0x5009f8,0x5009fc];
    // The host resolves pointer-table text for this negative-address request.
    if(s.subrow!==0||s.ticks%20<10)optionText(items,text(s.value.lensFlare?0x5008d4:0x5008e4),75);
    if(s.subrow!==1||s.ticks%20<10)optionText(items,text(-labels[s.value.detail]!),100);
    if(s.subrow!==2||s.ticks%20<10)optionText(items,text(-(0x500a00+(s.value.gamma-2)*8)),125);
    if(s.subrow!==3||s.ticks%20<10)optionText(items,text(s.value.animatedTextures?0x5008f4:0x50090c),150);
    const left=s.subrow===1?s.value.detail>0:s.subrow===2?s.value.gamma>2:true;
    const right=s.subrow===1?s.value.detail<2:s.subrow===2?s.value.gamma<3:true;
    if(left)items.push({kind:'sprite',index:56,frame:3,x:50,y:72+s.subrow*25,space:320,colour:128,alpha:1,scaleX:2048,scaleY:2048});
    if(right)items.push({kind:'sprite',index:56,frame:2,x:255,y:72+s.subrow*25,space:320,colour:128,alpha:1,scaleX:2048,scaleY:2048});
    optionText(items,text(0x5009bc),178,1536);
    optionText(items,text(0x5009d8),186,1536);
  }
  return {frame:{picture:0,items,fade:s.fade.level},sounds,done:s.remaining===0?'exit':null};
}

/** Readable physical-key names that fit the retail font's glyph set. */
export function keyName(code: string): string {
  const named: Record<string,string> = {Space:'space',ShiftLeft:'left shift',ShiftRight:'right shift',
    Backspace:'backspace',Delete:'delete',PageUp:'page up',PageDown:'page down',CapsLock:'caps lock',
    Backquote:'backquote',Minus:'minus',Equal:'equals',BracketLeft:'left bracket',BracketRight:'right bracket',
    Backslash:'backslash',Semicolon:'semicolon',Quote:'quote',Comma:'comma',Period:'period',Slash:'slash'};
  return named[code] ?? code.replace(/^Key|^Digit|^Arrow/,'').replace(/^Numpad/,'pad ').toLowerCase();
}

export function configureOptionKey(s: ReturnType<typeof createOptions>, code: string): boolean {
  if(s.page!==0||s.remaining>=0)return false;
  s.controlDevice='keyboard';
  if(s.capture){
    if(code==='Escape'){s.capture=false;s.captureLock=30;s.queuedSounds.push(3);return true;}
    if(s.captureLock>0||!validBindingCode(code))return true;
    const action=CONTROL_ACTIONS[s.subrow];
    if(action){
      const old=s.value.keys[action][0]!;
      for(const other of CONTROL_ACTIONS){
        if(other===action||!s.value.keys[other].includes(code))continue;
        s.value.keys[other]=s.value.keys[other].filter(key=>key!==code);
        if(!s.value.keys[other].length)s.value.keys[other]=[old];
      }
      s.value.keys[action]=[code];
    }
    s.queuedSounds.push(1);s.controlDevice='keyboard';s.capture=false;s.captureLock=30;return true;
  }
  if(code==='Enter'){s.page=-1;s.queuedSounds.push(1);return true;}
  if(code==='ArrowUp'||code==='ArrowDown'){
    s.subrow=Math.max(0,Math.min(CONTROL_ACTIONS.length+1,s.subrow+(code==='ArrowDown'?1:-1)));s.queuedSounds.push(2);return true;
  }
  if(code==='Space'){
    if(s.captureLock===0){
      s.queuedSounds.push(1);
      if(s.subrow<CONTROL_ACTIONS.length){s.capture=true;s.captureLock=30;}
      else if(s.subrow===CONTROL_ACTIONS.length)s.value.activeCamera=!s.value.activeCamera;
      else s.page=-1;
    }
    return true;
  }
  return false;
}

export function configureOptionButton(s: ReturnType<typeof createOptions>, button: number): void {
  if(s.page!==0)return;
  s.controlDevice='gamepad';
  if(!s.capture||s.captureLock>0||button===3||button===9)return;
  const action=CONTROL_ACTIONS[s.subrow];
  if(!action)return;
  const old=s.value.pad[action][0]!;
  for(const other of CONTROL_ACTIONS){
    if(other===action||!s.value.pad[other].includes(button))continue;
    s.value.pad[other]=s.value.pad[other].filter(b=>b!==button);
    if(!s.value.pad[other].length)s.value.pad[other]=[old];
  }
  s.value.pad[action]=[button];s.queuedSounds.push(1);s.capture=false;s.captureLock=30;
}
