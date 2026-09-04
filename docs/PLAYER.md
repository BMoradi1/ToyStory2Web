# Player physics, read from toy2.exe

Every number here was read out of the player controller in the PC executable
and cross-checked against the same function in the PlayStation executable
(`data/psx.exe`, SLUS-00893). Nothing was tuned by feel. Where the two builds
disagree it is said so. Addresses are `toy2.exe` virtual addresses as Ghidra
names them (`FUN_xxxxxxxx`); the PSX twin is given where it was matched.

Confidence: **high** for the time base, the unit scale, and every constant in
the jump, gravity, run and turn sections (identical integer code in both
builds). **Medium** for the attack timers and power-ups (read from one build,
consistent with the in-game text). **Low** for the ledge-grab probe distances,
which are noted but not validated.

## How it was found

The sound-effect name table (`.data` at 0x4fcdc4, 61 names such as `BUZJMP1`,
`BUZWING`, `BUZSKID`) is indexed by effect number, and a second table at
0x502950 maps 200 *sound events* to effect numbers (16 bytes each: effect,
pitch, volume, ...). Game code fires events, not effects, through
`FUN_0049e660(event, obj)`. Effect `e` is name `e - 1` in the name table.
Grepping every caller for the events that resolve to Buzz's jump, skid, spin
and climb sounds landed in one cluster of functions, 0x433700-0x436d80, which
is the whole character controller. The PSX build has the same cluster at
0x8003af24-0x8003ec30 with the same control flow and the same constants.

Ghidra scripts to rebuild both decompiles are in `tools/ghidra/`.

## Time base

`FUN_00490860` measures the milliseconds since the last frame and converts
them to whole **60 Hz ticks**, rounding up, clamped to `[1, 4]`, then sleeps
away the remainder. That tick count is the global `DAT_0052f2d4`, referred to
below as `dt`. Every timer counts in ticks and every velocity is per tick; the
controller multiplies velocity by `dt` before moving and divides it back
afterwards. Replays and demo playback force `dt = 2`.

So the physics is defined at 60 Hz. A 16.949 ms frame is exactly 1.017 ticks,
which rounds up to 2 some frames and 1 on others; that jitter is the PC port's,
not the design's, and a reimplementation should run the controller at a fixed
60 Hz.

## Units

Game logic runs at **32x the level file's units**. Two independent readings:

- the per-level spawn table (`0x4f59a4`, 16 bytes per level: x, y, z, yaw)
  puts level 1 at (194774, 60044, -361401), far outside level 1's bounding box
  in `level.dat` units, and inside it after `>> 5`;
- the ground query `FUN_00486520` shifts object positions right by 5 before
  comparing them with terrain, and render objects receive `pos >> 5`.

Axes are the PlayStation's: **+Y is down**, so an upward impulse is negative.
Yaw is a 12-bit angle, 4096 per revolution, with the sine table at
`0x4fe788` (4096 x i16, 0x4000 = 1.0); forward is `(sin yaw, cos yaw)` in
`(x, z)`.

For scale: Buzz's mesh is 460 level units tall with the origin at his feet,
so **one body height is 14,720 game units**. Standing therefore means the
player's Y equals the floor's. Whether the original carries a small standing
offset is not known — that lives in the mover (`FUN_00484380`), which is
P2.3's to read.

## The player object

One fixed block at `0x52f300`, passed to every controller function. Fields
that the physics touches (byte offsets):

    +0x00  i32 x, y, z         position, game units
    +0x0e  u16 yaw             12-bit
    +0x40  u16 flags           see below
    +0x48  u16 target yaw      where the stick points, camera-relative
    +0x5c  i32 prev x, y, z    (+0x5c, +0x60, +0x64)
    +0x68  i32 vx, vy, vz      velocity, game units per tick
    +0x74  i32 forward speed   scalar, along yaw
    +0x78  i32 lateral speed   scalar, across yaw
    +0x84  i32 ground y        floor height under the player
    +0x8c  i16 jump state      0 grounded, 1 rising with button held,
                               2 released, 3 falling, 5 double jump,
                               6 double jump released
    +0x8e  i16 on ground       nonzero when the mover found floor this tick
    +0x90  i16 anim phase      8 after a double jump; 0x1a stomp; 2, 3 pole
    +0x94  i16 slip timer      counts down; flag 0x20 while nonzero
    +0x98  i16 hit stun        counts down; jump impulse and accel reduced
    +0x9c  i16 coyote          set to 6 while grounded, counts down in air

Flags at +0x40: `0x02` no ground friction, `0x04` dizzy, `0x20` slipping,
`0x40` launched (springboard: top speed 0xb80 until landing), `0x100` in
water, `0x200` no player control this tick.

The controller also keeps a global state word `DAT_0053c828` rebuilt every
tick: bit 0 grounded (coyote nonzero), 1 charged spin, 2 ledge climb, 3 zip
line, 4 pole, 5 hard-fall stun, 6 stomp, 7 laser charging, 8 grapple, 9
pushing, 10 on a stomp switch, 11 hit stun, 12 rocket boots, 13 grapple
state, 14 hover boots, 15 pole-top, 16 pole climb. Most moves are gated on
this word being exactly `1` or `0` with a mask.

## Per-tick order

`FUN_0049dfe0` (game tick) -> `FUN_00436220` (controller, PSX `FUN_8003e3ec`):

1. Build the movement table (accel, friction, jump impulse, top speed) for the
   current state.
2. Charge/fire laser (`FUN_00434990`), stomp (`FUN_00434d20`), spin
   (`FUN_00434eb0`).
3. Special movers in priority order, each returning 1 (skip jump, do turn), 2
   (skip everything) or 0: zip line (`FUN_004359d0`), stomp switch
   (`FUN_00435100`), pole (`FUN_004354e0`), ledge grab (`FUN_00435f30`).
4. Otherwise vertical: `FUN_004340d0` (jump + gravity), or the hover-boots
   version `FUN_004a4bb0`.
5. Turn toward the stick (`FUN_004346c0`, or rocket-boots `FUN_004a4f80`),
   then accelerate along yaw (`FUN_004343d0`).
6. `vel *= dt`; moving-platform carry (`FUN_00433700`); collision move
   (`FUN_00434550` -> `FUN_004855f0`, split into two half-steps when
   `|vel|^2 > 0x400000`); `vel /= dt`.
7. Coyote and fall timers.

## Vertical: jump, gravity, double jump

All from `FUN_004340d0` (PSX `FUN_8003bba4`, identical). `k = 2` normally,
`k = 4` in water; every vertical constant is divided by `k` or `k^2`.

| quantity                    | value (game units, per tick)     | notes |
|-----------------------------|----------------------------------|-------|
| gravity                     | `256 / k^2` = **64**             | applied only while not on ground |
| terminal velocity           | **0x800** (2048); 0x400 in water, 0x40 in slime | |
| jump impulse                | **-0x600** (-1536)               | needs coyote > 0, not launched/stomping/hard-fall |
| jump impulse, rocket boots  | -0x640 (-1600)                   | |
| jump impulse, hit-stunned   | -0x3c0 (-960)                    | |
| jump impulse, in water      | -0x300 (-768)                    | |
| jump release cut            | if `vy < -800/k` (-400): `vy += 0x180/k^2` (+96); then `vy = vy/2 - 0x100/k^2` (-64) | only in jump state 1 |
| double jump, PSX and PC-in-air | `-0x900 / k` = **-0x480** (-1152) | |
| double jump, PC from a ground jump | `-sqrt(2 * g * (0x6a80 - h))`, clamped to `[-0x74c, -0x22a]` | `h` = height gained since takeoff; tops out at 0x6a80 (27,264) above takeoff regardless of timing |
| coyote time                 | **6 ticks**                      | `+0x9c` reloads to 6 every grounded tick |
| double-jump window          | jump state 2 (button released) and `vy > -0x400` (rising slower than that, i.e. near the apex or falling), no hit stun, coyote expired, no charged spin, no hard-fall stun | one double jump per airborne period |
| double jump from a walk-off  | also allowed in jump state 0 once a fall has been flagged (0x50): a rescue jump after falling 60 ticks without having jumped | |

Derived: the rise takes 24 ticks and reaches **17,664** units, 1.20 body
heights. Note that is not the textbook `v^2 / 2g` = 18,432: the first-jump
branch clears the on-ground flag and the gravity test runs after it, so
gravity applies on the jump tick too and the first step moves at 1,472 rather
than 1,536. The sum of the actual steps is `v^2/2g - v/2`, exactly 768 lower.
Anything predicting jump heights from the continuous formula will be wrong by
that much.

The PC's double jump tops out 27,264 above takeoff. If you never release the
button the jump stays in state 1 for its whole rise and no double jump is
possible; the release cut is what makes short hops.

Hard fall: after **60 ticks** of falling with `vy > 0x80`, the scream event
fires and the fall is flagged (0x50). Landing from a flagged fall zeroes
velocity and stuns for **70 ticks** (`DAT_0053c838 = -0x46`). No damage.

Stomp (`FUN_00434d20`): spin button in jump state 1 or 2, or right after a
double jump. Hangs for **14 ticks** with velocity frozen, then `vy = 0x800`
straight down. Landing sets a **40-tick** recovery and a shockwave.

## Horizontal: run, friction, turn

The movement table built at the top of `FUN_00436220` is seven ints; the PC
stores `dt * 4 * value` and shifts back, the PSX stores `dt * value`. Values
per tick, normal ground, with `dt = 1`:

| index | meaning                        | PC   | PSX  |
|-------|--------------------------------|------|------|
| [0]   | lateral friction               | 128  | 128  |
| [1]   | forward friction               | **48** | **32** |
| [2]   | forward acceleration           | 40   | 40   |
| [3]   | jump impulse                   | -0x600 | -0x600 |
| [4]   | top speed (accel cut-off)      | 0x380 (896) | 0x380 |
| [5]   | forward speed clamp            | 0x400 (1024) | 0x400 |
| [6]   | max turn per 8 ticks           | 0x300 | 0x300 |

`FUN_004343d0` (PSX `FUN_8003bf6c`) decomposes velocity into forward and
lateral scalars along yaw, decays each toward zero by its friction, and while
the stick is held and `forward < [4]` adds `[2] + [1]` to forward, so the net
gain with input is exactly `[2]` = 40 per tick and the stop from top speed is
`[4] / [1]` ticks. Both scalars are then clamped, lateral to `[4]`, forward to
`[5]`, and recomposed. Top run speed is therefore 896 per tick = 53,760 per
second, 3.65 body heights per second, reached in 22 ticks; a full stop takes
19 ticks on PC and 28 on PSX. This is the one balance change the PC port made
to the controller.

State overrides of the table (PC values; PSX identical except [1] above):

| state                        | [0] | [1] | [2] | [4] | [3] |
|------------------------------|-----|-----|-----|-----|-----|
| airborne (coyote expired)    |     | 16  |     |     |     |
| hit stun (+0x98 > 0)         | 16  | 8   | 20  |     | -0x3c0 |
| ice surface (type 4..7)      | 16  | 8   | 20  |     |     |
| skid turn, stick held        | 16  | 4   |     |     |     |
| no-friction flag 0x02        | 0   | 0   |     |     |     |
| pushing an object            |     |     |     | 0x180 |   |
| launched (flag 0x40), in air | 0   | 0   |     | 0xb80, [5] 0xb80 | |
| water (type 1)               | 32  | 8   | 10  | 0x280 | -0x300 |
| slime (type 2, 3)            | 16  | 8   | 20  | 0x100 | -0x300 |
| rocket boots (`FUN_004a4f80`)| 128 | 32  | 160 | 0x800, [5] 0x800 | -0x640 |

Analog: `FUN_00433f40` returns `min(0x4000, sqrt(x^2 + y^2))` of the stick
with a per-axis dead zone of 0x1800, and the caller scales **[4], the top
speed**, by that over 0x4000 — not [2], the acceleration. So a half-pressed
stick reaches half speed at the same rate rather than creeping up to full
speed. Digital input is 0x4000.

The stick's angle goes through an 8-sector lookup with interpolation
(`0x4f5ab4`), which reads like a response curve but is the **identity**: its
nine entries are 0, 512, ... 4096. So the target yaw is a plain `atan2` of the
stick plus the camera's bearing to the player, and nothing needs porting but
that sum. Digital input uses a 16-entry direction table at `0x4f5ac8` keyed by
the four direction bits (0x10 up, 0x20 right, 0x40 down, 0x80 left), holding
the eight compass angles with 0 = away from the camera.

The sine table at `0x4fe788` is 4096 `i16` with `0x4000` as 1.0, and every one
of its entries equals `round(sin(i * 2pi / 4096) * 0x4000)`. It can therefore
be generated rather than shipped, with bit-identical results.

Turning (`FUN_004346c0`, PSX `FUN_8003c3a0`): each tick yaw moves toward the
target by `min(|diff|, 0x300) * dt / 8`, an exponential approach with an
8-tick constant and a cap of 96 per tick (180 degrees in 21 ticks). If the
target is more than **0x5dd** (132 degrees) away the yaw snaps to it at once,
and if that happens on the ground in a plain state it starts a **26-tick
skid** (`DAT_0053c5d4 = 0x1a`, `BUZSKID`), during which the friction row above
applies. The target yaw is the camera's bearing to the player plus the stick
direction, so control is camera-relative.

## Attacks

Spin (`FUN_00434eb0`): spin button, grounded and idle. Spins for **48 ticks**.
Holding the button charges `DAT_0053c83c` up to **60 ticks**; releasing at
full charge starts a charged spin of **300 ticks**: 181 spinning, then 119
dizzy (flag 0x04, `BUZDIZZY`) during which the player is uncontrollable.

Laser (`FUN_00434990`): fire button. A tap fires after a **12-tick** wind-up.
Holding charges `DAT_0053c840` up to **64 ticks** and a release at full charge
fires the charged shot. Projectile speeds live in `FUN_004a5d30` and were not
extracted. The cadence logic for repeated taps is fiddly and is best ported
straight from the function rather than summarised.

## Power-ups

Hover boots (`FUN_004a4bb0`): **600 ticks** of fuel per pickup. Replaces the
jump routine: the target float height above the floor starts at 0x2000 and
rises **0x400 per tick** while jump is held (cap 0xc000), falling at the same
rate when released; `vy` approaches the target at 0x20 per tick, capped at
+/-0x180. The particles change when fuel drops under 120 ticks.

Rocket boots (`FUN_004a4d60`): **250 ticks** (`DAT_0053c5e0 = 0xfa`). Uses
the rocket row of the table above.

Zip line (`FUN_004359d0`): attaches when the squared horizontal distance to
the line, in level units, is under 0x2000 (about 90 level units) and the
player is within its height window. Speed along the line ramps 1 per tick to
**0x30**. Letting go or reaching the end gives `vy = -0x5c0` and a horizontal
push along yaw; the push is written as a huge number but the same tick's
run clamp (0x400) cuts it, so the effective exit is one run speed forward.
30-tick re-grab lockout.

Pole (`FUN_004354e0`): up climbs at a fixed **-0x100** per tick; down slides
at +32 per tick up to 0x400 while spiralling the yaw by `vy / 16` per tick;
neither decays the vertical speed by 64 per tick; left and right rotate 0x20
per tick. Jump lets go with `vy = -0x400` and a run-clamped push along yaw,
or -0x600 straight up from the very top. Type-2 poles are slides: gravity 16
per tick to a cap of 0x800.

## PSX differences

Only two were found in the controller: forward friction (32 on PSX, 48 on PC)
and the PC's height-capped double jump. Everything else, including every mask
and threshold, matches. The PSX build has no float code; the PC port's two
`sqrt` calls (double jump and stick magnitude) are the port's additions.

## Ported

`src/sim/player.ts` is a transcription of the tick above, `src/sim/trig.ts` the
angle system, `src/sim/input.ts` the keyboard and pad. `tools/player-probe.ts`
runs the controller headlessly and checks the motion it produces against the
closed-form values these constants predict; it is the regression test for any
later change.

## Not extracted

Projectile speeds and lifetimes; the mover's step height, wall slide and slope
limit (`FUN_00484380`, 4.7 KB, P2.3's problem); the exact ledge-grab probe
geometry (`FUN_00435f30` probes 0x3600 below the origin and one third of a
unit forward, low confidence); the spawn table's meaning beyond level 1 (the
y is only a seed for a ground ray, the ray starts 0x400 above it).
