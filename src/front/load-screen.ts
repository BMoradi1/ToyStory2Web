/** Retail PC load/save pages, FUN_0049b9e0, in 512 x 256 text space. */
import type { Progress } from '../loader/save.ts';
import { PAD, setFade, stepFade, type FrontItem, type PadWord, type StepResult } from './screens.ts';
import { layoutBigText } from './text.ts';
export interface SaveSlot { name: string; progress: Progress | null }
export function createLoadScreen(slots: SaveSlot[]) {
  return { slots, page: 'root' as 'root'|'load'|'save', row: 0, rootRow: 0, ticks: 0,
    lock: 30, blink: 20, pending: null as string|null, message: '', fade: { level: 0, target: 128, speed: 12 } };
}
export function enterSaveSlots(s: ReturnType<typeof createLoadScreen>, page: 'load'|'save', row = 0): void {
  s.page = page; s.row = row; s.lock = 30; s.message = '';
}
export function stepLoadScreen(s: ReturnType<typeof createLoadScreen>, pad: PadWord, text: (a:number)=>string): StepResult<string> {
  stepFade(s.fade); s.ticks++;
  const items: FrontItem[] = [], sounds: number[] = [];
  const line = (value:string, y:number, x = 256) => items.push({kind:'big',glyphs:layoutBigText(value,x,y),space:512,colour:[255,255,255]});
  const edge = (b:number) => !!(pad.now&b) && !(pad.was&b);
  let done: string|null = null;
  if (s.pending !== null) {
    // Retail draws just the picture during the exit fade; no slot text survives it.
    if (s.fade.level === 0) { done = s.pending; }
    return { frame: {picture:0,items,fade:s.fade.level}, sounds, done };
  }
  if (s.page === 'root') {
    line(text(0x50078c),25);
    [0x5007a0,0x5007ac,0x5007b8].forEach((a,i) => { if(i!==s.row || s.blink<10) line(text(a),75+i*25); });
  } else {
    line(text(s.page==='load'?0x5007c4:0x50082c),3);
    s.slots.forEach((slot,i) => {
      // The eight slot centres follow the static Slinky-shaped curve in the executable.
      const x = 256 + Math.trunc(Math.cos(i * Math.fround(0.6426990628242493) - 1) * 80);
      if(i!==s.row || s.blink<10) line(slot.progress?slot.name:text(0x5007d8),33+i*23,x);
    });
    line(text(0x5007e4),228);
  }
  if(s.message) line(s.message,216);
  // Slot navigation remains available during the 30-tick confirmation lock.
  if (s.page !== 'root' || s.lock === 0) {
    const max = s.page === 'root' ? 2 : s.slots.length - 1;
    if(edge(PAD.up) && s.row>0) {s.row--;sounds.push(2);}
    if(edge(PAD.down) && s.row<max) {s.row++;sounds.push(2);}
  }
  if (s.lock === 0) {
    if(edge(PAD.cancel)) {
      if(s.page==='root') s.pending='exit';
      else {s.page='root';s.row=s.rootRow;s.lock=30;s.message='';}
      sounds.push(3);
    } else if(edge(PAD.jump)) {
      if(s.page==='root') {
        s.rootRow=s.row;
        if(s.row===2) s.pending='exit';
        else enterSaveSlots(s,s.row===0?'load':'save');
        sounds.push(s.row===2?3:1);
      } else if(s.page==='save' || s.slots[s.row]?.progress) {
        s.pending=`${s.page}:${s.row}`;sounds.push(1);
      }
    }
    if(s.pending !== null) setFade(s.fade,0,6);
  }
  if(s.lock>0) s.lock--;
  if(--s.blink<0) s.blink+=20;
  return {frame:{picture:0,items,fade:s.fade.level},sounds,done};
}
