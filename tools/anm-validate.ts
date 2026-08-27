/**
 * Validate the `.anm` parser against a game install.
 *
 * Two structural invariants carry the weight here: an animation's payload must
 * be exactly frameCount * frameStride * 2 bytes with no padding, and a file's
 * boneCount must equal the graphics-mesh group count of the model beside it.
 *
 *   npx tsx tools/anm-validate.ts "Toy Story 2"
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseAnm, poseBone, hasScale } from '../src/formats/anm.ts';
import { parseAll, GroupType } from '../src/formats/all.ts';

const root = process.argv[2];
if (!root) { console.error('usage: npx tsx tools/anm-validate.ts <game dir>'); process.exit(1); }
const data = join(root, 'data');

let files = 0, anims = 0, exactPayload = 0, boneMatch = 0, boneChecked = 0;
let flagRule = 0, tracks = 0, scaled = 0, noTrack2 = 0, noTrack3 = 0, posed = 0;

for (const dir of readdirSync(data).filter((d) => /^chars/.test(d))) {
  for (const name of readdirSync(join(data, dir)).filter((n) => /\.anm$/i.test(n))) {
    files++;
    const file = parseAnm(readFileSync(join(data, dir, name)));
    const present = file.animations.filter((a) => a !== null);

    // An animation's payload runs to the next animation's HEADER, not to its
    // data — the next header, track table and mask all sit in between.
    const headers = present.map((a) => a!.offset).sort((x, y) => x - y);
    for (const a of present) {
      anims++;
      const next = headers.find((h) => h > a!.offset);
      const end = next ?? file.bytes.length;
      if (end - a!.dataStart === a!.frameCount * a!.frameStride * 2) exactPayload++;
      if (a!.scaleMask.length === 2 * (Math.floor(a!.boneCount / 16) + 1)) flagRule++;

      for (let b = 0; b < a!.boneCount; b++) {
        tracks++;
        const off = a!.trackOffsets[b]!;
        if (off === -2) noTrack2++;
        else if (off === -3) noTrack3++;
        // A scale channel only means anything for a bone that has a track.
        if (off >= 0 && hasScale(a!, b)) scaled++;
        if (poseBone(file, a!, 0, b)) posed++;
      }
    }

    // boneCount vs the matching model's graphics-mesh groups.
    const model = join(data, dir, name.replace(/\.anm$/i, '.all'));
    if (existsSync(model) && present.length > 0) {
      const groups = parseAll(readFileSync(model)).groups
        .filter((g) => g.type === GroupType.GfxMesh).length;
      boneChecked++;
      if (groups === present[0]!.boneCount) boneMatch++;
    }
  }
}
console.log(`files ${files}, animations ${anims}`);
console.log(`  payload == frameCount * frameStride * 2 exactly: ${exactPayload}/${anims}`);
console.log(`  flagBytes == 2 * (boneCount/16 + 1):             ${flagRule}/${anims}`);
console.log(`  boneCount == model gfx-mesh groups:              ${boneMatch}/${boneChecked} characters`);
console.log(`tracks ${tracks}: ${posed} posed on frame 0, ${scaled} with a scale channel`);
console.log(`  absent everywhere (-2): ${noTrack2}, layered elsewhere (-3): ${noTrack3}`);
