# The follow camera

Decoded 2026-09-06 from `FUN_004045e0` in `toy2.exe` (4.7 KB, called once
a tick by `FUN_00405860` unless a scripted camera is running,
`DAT_0050a13c != 0`). `src/sim/camera.ts` is a skeleton of it; this is the
whole thing, so the port can be finished by transcription.

Units: game units (32 per level unit), +Y down, 12-bit angles, `dt` is the
tick count `DAT_0052f2d4`. `S(a)` is the 0x4000-scale sine table at
0x4fe788 and `C(a) = S(a + 0x400)`. The camera struct is at `DAT_0052f3a0`:

| field | | |
|---|---|---|
| +0x00 | x, y, z | where the camera is |
| +0x0c | x, y, z | where it wants to be this tick |
| +0x18 | h1 | the player's height, followed slowly |
| +0x1c | h2 | h1 followed again; the camera's base height |
| +0x20 | view pitch | the direction the view looks, eased |
| +0x22 | view yaw | |
| +0x26 | distance | eased toward `DAT_0050a128` = 0x4b0 (level units) |
| +0x28 | yaw | which side of the player the camera is on |
| +0x2e | pitch | how high it sits; 0x40 at rest |
| +0x32 | mode | what the side rays found, below |

Globals: `stillFor` `DAT_0050a534`, `turnRate` `DAT_0050a4e4`, `autoTurn`
`DAT_0050a4b4`, `onMover` `DAT_0050a4e0`, `smooth` `DAT_0052ad98` (0x10,
level 1's tick sets 0x40 for a slow pull and it decays 2 a tick), `shake`
`DAT_0050a510`, `lookAt` `DAT_0050a118/1c/20` (a point a script asks the
camera to turn toward once), `rayFlags` `DAT_0050a12c`.

**Two user modes.** The pause menu's "camera mode" chooses "passive
camera" (bit 0x40 of `DAT_0052f0cc` clear) or "active camera" (set);
the default byte is 0xc0, so the game ships active. Active: the yaw
follows Buzz's heading on its own. Passive: the camera-left and
camera-right buttons (`DAT_0052ad88` bits 0x100/0x200, 16 a tick) turn
it, the centre button (`DAT_0088279c` bit 0x1000, on its press edge) snaps
it behind him, and it only centres itself after he has stood still.

## The tick

**Mover blend.** If Buzz stands on a type-8 collision object
(`FUN_0048e1b0`) and is grounded (`DAT_0052f38e`), `onMover` rises 2 a
tick to 0xc0, else falls 1 a tick to 0.

**Distance** eases toward 0x4b0 at `dt << 5` a tick, either way.

**Standing still** — |vx| < 4 and |vz| < 4 (`DAT_0052f368/370`), not
grappling (`DAT_0053c660 == 0`), grounded; or hovering (`DAT_0053c668 >
0`) in animation phase 0xf:

- `stillFor += dt`, jumping from 0x41 straight to 0x83 the first time it
  passes 0x42, capped at 0xf0 (`settled`).
- Passive: the centre button snaps yaw to Buzz's heading (`DAT_0052f30e`)
  when no direction is held; once `settled`, centre at 10 a tick.
  Active: the centring window is `turnRate`, set when `stillFor` first
  reaches 100 to the signed difference between the wanted heading
  `DAT_0052f348` and the yaw, then at least 0x140 (0x280 while a camera
  button is held, which also turns the wanted heading 16 a tick), and
  exactly that once `stillFor > 0xa4`; the yaw moves `turnRate * min(8,
  stillFor - 100) / 0x180` a tick toward the heading, snapping when it
  would overshoot.
- Passive with a camera button held: yaw ± 16, `stillFor = 0x42`.
- Whenever the yaw was moved this way, the pitch eases toward 0x40 at 8
  a tick (not while hovering, if below).
- `h1 -= (h1 - y + 0x1000) >> 5`; `h2 -= (h2 - h1) * dt / 16`; with
  `onMover`, `h2 = y - 0x1000 - ((y - h2 - 0x1000) >> 8) * (0x100 -
  onMover)`.
- `lookAt` pending: yaw -= (yaw - atan2(lookAt - Buzz)) / 8, then
  cleared.
- The long ray: from Buzz's head (`y - 0x1f00`) along the camera's
  offset at the RESTING distance (0x4b0 scaled by cos/sin of the pitch),
  broadphase `FUN_0048a4c0` with radius 2000, cast `FUN_0048c860(from,
  dir, 0x8000, 1, standoff)` with standoff `(stillFor / 2) * 0x50 + 200`
  while `stillFor < 0x42`, else 0xb18. A hit sets the distance to the
  hit's distance, floored at 10.
- Skip to **place**.

**Moving** — `stillFor = 0`:

- `h1` is clamped to within 0x4000 of `y`, and follows `(h1 - y +
  0x1000) >> 5` only when grounded with forward speed (`DAT_0052f39c`
  and `DAT_0052f374`) or when Buzz is below `h1 + 0x1000`: the camera does
  not rise with a jump but does drop with a fall.
- `h2` as above; while the 600-tick timer `DAT_00882920` runs (set by
  `FUN_004a4b70` with the hover boots), `h2` is kept at or above `y -
  0x1000`.
- Passive: camera buttons turn the yaw 16 a tick unless the side ray on
  that side is blocked (`rayFlags` bits 1/2 with 8); centre button snaps.
  Active: yaw -= delta * dt / (0x2a * 2), or / (0x60 * 2) while skidding
  (`DAT_0053c5d4`); beyond 0x600 the delta becomes `(±0x800 - delta) * 3`
  so it swings round the short way.
- Ledge grab (`DAT_0053c618`), rocket boots (`DAT_0053c5e0`), hang
  (`DAT_0053c818`), grapple state 2 (`DAT_00882950`) or the script flag
  `DAT_0052f340 & 0x40`: yaw -= clamp(delta, ±0x200) * dt / 32 as well.
- **The three short rays**, from the position the resting offset gives
  (pitch and distance applied, height `h2`), broadphase radius 2000:
  left and right (`± sin/cos(yaw) >> 3`, i.e. 0x800 to the side, from
  0xf00 below the head) and up (0xc00 above), each `FUN_0048c860(from,
  dir, 0x8000, 1, 200)`. A hit sets `rayFlags` bit 1 (left), 2 (right), 4
  (up); a side hit on a surface whose normal y (`DAT_0072869a`) exceeds
  12000, a ceiling, sets bit 8 as well.
- **Mode** from `rayFlags` (bit 8 counts as both sides): 0 free; 1 left
  blocked; 2 right blocked; 4 up blocked; 5/6 keep the current side bit
  or become 8; 3 and 7 by the yaw's distance from Buzz's heading: over
  0x400 → 9 or 10 (pitch up plus a side), over 0x200 → 1 or 2 by sign,
  else 4 if Buzz is rising faster than 0x80 (`DAT_0052f36c < -0x80`) else
  8.
- **Auto-turn**: mode side 0 → `autoTurn` decays 16 a tick toward 0;
  side 1 → `autoTurn` -= 8 dt to -0x60; side 2 → += 8 dt to 0x60; yaw +=
  `autoTurn * dt / 2`. That is how a wall on one side slides the view
  round rather than pulling it in.
- **Pitch**: mode bit 4 → pitch -= 8 dt to -0x200; bit 8 → += 8 dt to
  0x300; neither → eases to 0x40 at 8 a tick.
- `lookAt` as above.

**Place.** Wanted position: `r = C(pitch) * distance >> 14`; `x = bx -
S(yaw) * r >> 9`, `z = bz - C(yaw) * r >> 9`, `y = h2 - 0x2000 + S(pitch
- 0x800) * distance >> 9` (so pitch 0x40 lifts it a little, and the >> 9
against the 0x4000 table is what turns the level-unit distance into game
units). Unless frozen (`DAT_0050a4e8`, never set): the centre snap jumps
there; otherwise `pos -= (pos - wanted) * dt / ((smooth * 2) >> 2)`, an
eighth a tick at rest. **The camera's position lags its target**; the
port places it outright.

**View angles.** Aim at Buzz's head (`y - 0x1800`) from the camera. The
horizontal reach is `0x4b0 - max(0, 400 - distance) * 2` along the
camera→Buzz bearing (so a close camera looks steeper). Wanted pitch
`atan2(±dy, reach)`; while `shake` runs, plus `S((shake * -3 & 0x1f) *
0x80) / ((shake - 0x32) * 0x10)`, shake falling 1 a tick (level 2's boss
sets it to 0x28). While grappling the pitch may change at most 0x20 a
tick. View pitch += delta * dt / (smooth / 2); view yaw the same toward
`atan2(dx, dz)`, snapping on the centre button.

**Moving only, the line to Buzz.** `FUN_0048d530(camera, Buzz's head -
camera, 1, 1)` says whether the line is blocked and how far in: distance
-= that, floored at 10, and when the pull-in is under 300 the camera is
also moved along the line.

**Too close.** If the camera is within 400 level units of Buzz's head it
is put onto that sphere: `k = sqrt(160000 - dx^2 - dz^2)` (dy not
subtracted) and `y = by - 0x1000 - k * 0x20`, so it ends exactly 400 level
units from the head, above it.

## The collision flags the camera sees

A collision record's flag word (`TERRAIN.ALL` entry +0x28, record +0x2e,
docs/FORMATS.md): bit 0x100 makes the surface invisible to the entity
sweeps (`FUN_00484380`, `FUN_00485940`) — camera-only walls; bit 0x200
makes it invisible to the camera's broadphase (`FUN_0048a4c0`) — the
camera passes through it; bit 0x400 is a zone floor (docs/LEVELS.md).

## Ported

`src/sim/camera.ts` is now all of the above except the mover blend
(`onMover`, which needs "Buzz is standing on a type-8 collision group")
and the states that pull the view behind him — a ledge grab, the rocket
boots, a hang, the grapple — none of which exist yet. `FUN_0048c860` is a
ray cast against the hull with a THICKNESS (its fifth argument, which it
expands by 1.39 for the broadphase, so 200 is a thin ray and the
standing cast's 0xb18 is a fat one); `sweepSphere` at that radius is the
same query, and `cast` in the module wraps it.

The three float conversions Ghidra dropped were read from the machine
code on 2026-09-07 (objdump on the exe) and every one is a square root:

- **the standing ray**: `FUN_0048c860` shortens the line to the hit, and
  the distance becomes that line's length, `sqrt(dx^2 + dy^2 + dz^2)` with
  each component `>> 5`, so level units, floored at 10;
- **the occlusion pull-in**: the same length of the line `FUN_0048d530`
  shortened, which is how far the CAMERA is from the wall. That is what is
  subtracted from the distance — so the new follow distance is the wall's
  own distance from Buzz — and when it is under 300 the camera is put on
  the wall this tick as well. An earlier reading here subtracted the
  remainder instead, which was backwards;
- **the too-close lift**: `k = sqrt(160000 - dx^2 - dz^2)`, dy left out,
  and `y = head - k * 32`. It puts the camera ON the sphere of radius 400
  level units around his head, above him, rather than merely lifting it.

Measured after the port, walking, strafing, turning and jumping around
level 1 for 480 ticks: the camera's worst single-tick move is **81 level
units** and no tick exceeds 100. Before the position lag it was 310, and
before the distance fix in the previous session it was 1,224.

## Cuts

Decoded and ported 2026-09-07 (`src/sim/camera-cut.ts`). The scripted
camera the boss fights and the talk box share, in three pieces:

**Starting one.** `FUN_004020f0(look, ticks, distance)` cuts to a thing:
it sets the "no player control" bit (`DAT_0052b816 & 1`, the same one a
talk box sets), camera flag bit 4, the cut's look point to the thing
(`DAT_0050a500..08`) and its eye (`DAT_0050a520..28`) on the line from
Buzz to it, `distance` sixteenths of a sine unit short of it at its
height — every boss passes 0x10, which is 0x4000 game units — and the
countdown `DAT_0050a1f4` to `ticks`. `FUN_00402290(ticks)` is the variant
that cuts to Buzz himself, 0x3000 above his feet from 0x4000 short of him
along the line from the camera's last position. Both then copy eye and
look into the scripted camera record at 0x52b7e8 (`FUN_00402030`) with
no ease, and set the blend counter `DAT_0050a140` to 64. A level tick may
go on moving the cut's eye and look every tick it runs, and level 6 does,
panning up and along through its boss's entrance.

**Feeding it.** The script tick (`FUN_00402a10`, run before the player
moves) copies the cut's look and eye into the record each tick and counts
`DAT_0050a1f4` down; at zero it clears the no-control bit and flag 4 and
sets the blend counter to 64 again. The record itself (`FUN_00403640`)
eases its eye an eighth of the way toward the cut's eye each tick, and its
yaw and pitch a quarter of the way toward the direction from that eye to
the look point. The talk box's own end (the other exit of the same
function) sets the blend counter to 64 too, but a talk starts with a hard
cut: nothing sets the counter on its way in.

**Blending.** The tail of the camera update (`FUN_00405860`) picks a
source — the follow camera when control is on, the record when it is not
— and the rendered camera (`DAT_0052adc0` and its angles) is that source
outright when the counter is under 1, else `source + (rendered - source)
* counter / 64`, the counter falling one a tick. The follow camera is
stepped either way, so it is always somewhere sensible to come back to. A
second counter, `DAT_0050a148`, climbs to 0x18 while control is off and
decays after; the zone code reads it to let the camera's room lead
Buzz's.

**In the port.** The one approximation is that the engine eases two
angles and the renderer takes a look-at point, so the record's look point
is eased at the angle's quarter-a-tick rate instead. The follow camera is
not stepped under a talk box, so a box blends back to where it left the
camera rather than where it would have drifted to; a cut does step it.
The special camera modes `FUN_004020f0` cancels on the way in
(`DAT_0050a13c`, rails and fixed views) do not exist in the port.

Walked on level 6: Buzz crossing the trigger sets a 300-tick cut, the
rendered eye leaves the follow camera over the first 64 ticks as the
counter runs 64 to 0, pans about 100 to 170 level units a sample through
the entrance with Buzz held still, and when the countdown ends the
counter restarts at 64 and the eye eases back to the follow camera. On
level 1 a hint sign's box, once shut, sets the counter and the eye eases
back the same way instead of snapping.
