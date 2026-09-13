/** Browser settings and save selection. These replace the native Windows dialogs;
 * they do not claim to reproduce the original controller/GFX configuration UI. */
import { importProgress, type Progress } from '../loader/save.ts';
import { LEVEL_SELECT_ORDER, tokenCount } from '../formats/save-file.ts';
import type { GameDir } from '../loader/gamedir.ts';

export interface BrowserOptions { sfx: number; bgm: number; activeCamera: boolean }

function panel(title: string) {
  const dialog = document.createElement('dialog');
  dialog.className = 'game-dialog';
  const heading = document.createElement('h1');
  heading.id = 'game-dialog-title'; heading.textContent = title;
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.append(heading);
  document.body.append(dialog);
  return dialog;
}
function button(label: string, action: () => void): HTMLButtonElement {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.onclick = action; return b;
}

/** Changes preview immediately; Cancel restores the snapshot, Apply commits. */
export function showOptions(initial: BrowserOptions, preview: (value: BrowserOptions) => void): Promise<BrowserOptions | null> {
  const dialog = panel('Options');
  const draft = { ...initial };
  return new Promise(resolve => {
    let finished = false;
    const close = (accept: boolean) => {
      if (finished) return; finished = true;
      if (!accept) preview(initial);
      dialog.close(); dialog.remove(); resolve(accept ? draft : null);
    };
    for (const [key, title] of [['bgm', 'Music volume'], ['sfx', 'Sound effects volume']] as const) {
      const label = document.createElement('label'); label.textContent = title;
      const input = document.createElement('input'); input.type = 'range';
      input.min = '0'; input.max = '10'; input.step = '1'; input.value = String(draft[key]); input.name = key;
      const value = document.createElement('output'); value.textContent = input.value;
      input.oninput = () => { draft[key] = Number(input.value); value.textContent = input.value; preview({ ...draft }); };
      label.append(input, value); dialog.append(label);
    }
    const camera = document.createElement('label'); camera.textContent = 'Camera mode';
    const select = document.createElement('select'); select.name = 'camera';
    select.add(new Option('Passive', 'passive')); select.add(new Option('Active', 'active'));
    select.value = draft.activeCamera ? 'active' : 'passive';
    select.onchange = () => { draft.activeCamera = select.value === 'active'; preview({ ...draft }); };
    camera.append(select); dialog.append(camera);
    const help = document.createElement('p'); help.className = 'dialog-help';
    help.textContent = 'Tab moves between settings. Arrow keys adjust them. Enter applies; Escape cancels.';
    dialog.append(help, button('Apply', () => close(true)), button('Cancel', () => close(false)));
    dialog.oncancel = event => { event.preventDefault(); close(false); };
    dialog.onkeydown = event => {
      event.stopPropagation();
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); close(true); }
    };
    dialog.showModal();
  });
}

/** Native file input retains the user gesture. No file is uploaded or modified. */
export function showLoadGame(dir: GameDir, levelNames: readonly string[]): Promise<Progress | null> {
  const dialog = panel('Load game');
  const help = document.createElement('p'); help.textContent = 'Choose a Toy200.sav file. Loading replaces your current browser progress.';
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.sav'; input.setAttribute('aria-label', 'Save file');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'No save selected.';
  dialog.append(help, input, status);
  return new Promise(resolve => {
    let candidate: Progress | null = null, finished = false, request = 0;
    const close = (value: Progress | null) => {
      if (finished) return; finished = true; request++;
      dialog.close(); dialog.remove(); resolve(value);
    };
    const load = button('Load selected save', () => { if (candidate) close(candidate); }); load.disabled = true;
    const read = async (name: string, bytes: () => Promise<Uint8Array>) => {
      const id = ++request; candidate = null; load.disabled = true; status.textContent = 'Reading save…';
      try {
        if (/toy299\.sav$/i.test(name)) throw new Error('Toy299.sav contains controls. Choose Toy200.sav for game progress.');
        const parsed = importProgress(await bytes());
        if (finished || id !== request) return;
        candidate = parsed;
        const position = parsed.p.level + 1;
        status.textContent = `${name} — ${levelNames[position] ?? `Level ${LEVEL_SELECT_ORDER[position - 1]}`} · ${tokenCount(parsed.p)} tokens · ${parsed.p.lives} lives`;
        load.disabled = false;
      } catch (error) {
        if (!finished && id === request) status.textContent = (error as Error).message;
      }
    };
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void read(file.name, async () => {
        if (file.size > 4096) throw new Error('This file is too large to be a Toy Story 2 save.');
        return new Uint8Array(await file.arrayBuffer());
      });
    };
    const installed = dir.get('toy200.sav');
    if (installed) dialog.append(button('Use save from selected install', () => { void read('Toy200.sav', () => installed.read()); }));
    dialog.append(load, button('Cancel', () => close(null)));
    dialog.oncancel = event => { event.preventDefault(); close(null); };
    dialog.onkeydown = event => event.stopPropagation();
    dialog.showModal();
  });
}
