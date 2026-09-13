/** Only the browser's native file picker remains outside the retail renderer. */
import { importProgress } from '../loader/save.ts';
import type { SaveSlot } from './load-screen.ts';
export function chooseSaveFile(): Promise<SaveSlot | null> {
  const input=document.createElement('input');input.type='file';input.accept='.sav';input.hidden=true;
  input.setAttribute('aria-label','Import save file');document.body.append(input);
  return new Promise((resolve,reject)=>{
    const finish=()=>input.remove();
    input.oncancel=()=>{finish();resolve(null);};
    input.onchange=async()=>{
      try{
        const file=input.files?.[0];
        if(!file){resolve(null);return;}
        if(file.size>4096)throw Error('save file is too large');
        if(/toy299\.sav$/i.test(file.name))throw Error('choose a game save');
        const progress=importProgress(new Uint8Array(await file.arrayBuffer()));
        resolve({name:file.name,progress});
      }catch(error){reject(error);}finally{finish();}
    };
    input.click();
  });
}
