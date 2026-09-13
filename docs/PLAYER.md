# Player physics, read from toy2.exe

Every number here was read out of the player controller in the PC executable
and cross-checked against the same function in the PlayStation executable
(`data/psx.exe`, SLUS-00893). Nothing was tuned by feel. Where the two builds
disagree it is said so. Addresses are `toy2.exe` virtual addresses as Ghidra
names them (`FUN_xxxxxxxx`); the PSX twin is given where it was matched.

Confidence: **high** for the time base, the unit scale, and every constant in
the jump, gravity, run and turn sections (identical integer code in both
builds). **Medium** for the attack timers and power-ups (read from one build,
consistent with the in-game text). Edge-climb distances and state selection
are decoded from the PC routine and validated against synthetic collision
and real Level 1 ledges; its queries use the port's swept-sphere arithmetic.

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
full charge starts a charged spin of **300 ticks**: 181 whirling, then 119
dizzy (flag 0x04) during which the player is uncontrollable. The release is
gated on the state word carrying nothing but "grounded", NOT on the same
"nothing else running" test the press uses — that test insists the charge is
zero, and at the release it is 60.

Its four sounds, by event, resolved through the level's table:

| event | name | when |
|---|---|---|
| 0x11 | `BUZTSPIN` | the plain spin goes off |
| 0x27 | `BUZPWRUP` | every tick while charging. Sustained |
| 0x26 | `BUZWHIRL` | every tick of the 181 whirling. Sustained |
| 0x18 | `BUZDIZZY` | **once**, on the tick the whirl gives out |

Two are sustained, so raising them every tick keeps one sound running rather
than restarting it. `BUZDIZZY` is the odd one out: the original tests the
charge from BEFORE the step against the same threshold it tests after, so it
fires on the crossing and only then.

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

### Pole/rope controller port — 2026-09-13

`src/sim/poles.ts` now connects path 61 to `stepPlayer`. Grab distance is
`((dx >> 8)^2 + (dz >> 8)^2) < 0x200`, with feet between bottom + 0x1e00
and top + 0x3600. Position eases toward the rope by one quarter per tick;
normal walking, gravity, laser and ledge acquisition yield to the pole move.
Up/down climb/slide, left/right rotate, and a fresh Jump after ten attached
ticks releases. Released poles stay locked until horizontal separation in
level units exceeds squared distance 0x8400. Damage/death interrupts attachment.
The animation override at `0x401605` selects states 14 climbing, 15 holding,
16 sliding (the earlier state-name notes were inaccurate).

The existing sphere sweep still handles terrain clearance, so a ceiling can
stop Buzz slightly before the authored top; jumping away remains available.
The local probe exercises 104 climbable poles from playable scenes plus a real
first-level rope's climb and release. Zip-line traversal remains unported.

## Edge climb — ported 2026-09-08

`FUN_00435f30` automatically grabs while descending, with coyote time spent,
no hard-fall/stun or other special move, and floor more than `0x2000` below
the origin. Laser activity is allowed by its `0xfff7f` mask and is cancelled
when the climb animation takes over. Reach is `sin(yaw)/3, cos(yaw)/3`
in the `0x4000` sine-table scale (about 5,461 game units). The top normal
must have Y below `-15000/16384`.

The hands, `0x3600` ABOVE the origin (+Y is down), must cross the top minus
200 between the previous and current positions. The original floor helper
`FUN_00486280` can return a top above the current probe, so the port searches
the whole crossing interval; a below-only query misses fast descents.
Two radius-4000 sweeps check clearance: upward from one-quarter reach behind
Buzz, then forward four-thirds reach at top Y minus `0x1838`. A lower sweep
finds the wall normal to turn toward, closing the yaw difference by 1/16.

On success the controller anchors one reach forward at top Y minus 200,
fires sound event `0x17`, zeros velocity, and locks movement for `0x52` ticks.
Animation **state 9, slot 10** contains the pull-up displacement relative to
that anchor; the controller must not add another animated translation.
Damage/death cancels the climb and respawn clears it. The existing mover
settles Buzz onto the top when control resumes. Moving-platform attachment
and the original camera's climb transition remain unported.

`tools/ledge-probe.ts` checks ordinary running-jump acquisition, fast descent,
reach/facing, low ceilings, steep tops, state gates, all 82 animation ticks,
input lock, landing and damage interruption. It also finds 371 reachable
edge samples in Level 1's actual collision hull. `tools/player-probe.ts`
still passes all 24 movement checks.

## PSX differences

Only two were found in the controller: forward friction (32 on PSX, 48 on PC)
and the PC's height-capped double jump. Everything else, including every mask
and threshold, matches. The PSX build has no float code; the PC port's two
`sqrt` calls (double jump and stick magnitude) are the port's additions.

## Animation

Animation is not "pick a clip and play it". `FUN_004011d0` runs a state machine
whose 28 states live in a table at **0x4df3f0**, 20 bytes each: a pointer to a
**byte script**, animation slot A, animation slot B, a playback rate, and a
flag. The script is a list of frame numbers with opcodes mixed in:

| byte | meaning |
|---|---|
| `< 0x80` | a frame number within the animation |
| `0x81`, `0x82` | footfall, left and right |
| `0x83`-`0x86` | fire sound event 0x30, 0x10, 0x17, 0x43 |
| `0xfe` | end; drop back to the resting state |
| `0xff n` | loop back to script index `n` |

A 16.16 cursor walks that list and the state's rate is its step per tick, so
`0x10000` is one script entry per tick and `0x4000` is one every four. **A
negative rate means the step is the player's speed times its magnitude**,
which is how the walk cycle stays in step with the ground instead of sliding.
That also settles a question docs/FORMATS.md left open: there is no single
animation frame rate, and the 20 fps figure inherited from prior art is not
right. Fixed-rate states run at 15 or 30 script steps per second and
locomotion runs at whatever the legs are doing.

**Each state names two animation slots because Buzz's animations are
layered.** Slot A is the primary and slot B supplies the bones whose tracks
are absent from it — the `-3` track offsets already described in FORMATS.md.
The engine plays slot B first and slot A over it. Playing one alone is not a
degraded version of the pair, it is a broken one: slot 0 alone poses 284
triangles where the pair poses 417, so a third of Buzz simply disappears.

The states the controller can currently reach:

| state | slots | what it is |
|---|---|---|
| 0 | 0 + 1 | walk and run, speed-driven, two footfall opcodes |
| 1 | 2 + 3 | idle, a 16-frame loop |
| 2 | 4 + 5 | jump, rising |
| 3 | 4 + 5 | falling, a later stretch of the same script |
| 4 | 4 + 5 | landing, four frames then end |
| 8 | 22 + 27 | double jump |
| 0xc | 15 | hard fall |
| 0x13 | 11 | the charged spin, whirling |
| 0x14 | 7 | ...and dizzy, the last 0x78 ticks of it |

**The plain spin is not a state.** `FUN_004011d0` runs the state machine
first and then, if the spin timer is up, replaces the resolved primary slot
with **9** and drives the cursor straight off the timer,
`(0x30 - spin) * 0x8000`, bypassing the state's script. A state whose two
slots are equal cannot carry the override, and the original cancels the spin
rather than play it wrong. There IS a state 9 — it is the ledge climb, slots
10 + 10 — and selecting it for a spin plays a climb. The laser is the same
shape with slot 0x1a. Both overrides keep the state's secondary slot and
its original frame cursor; only the primary slot receives the attack frame.
The port incorrectly made both slots the attack slot, dropping the seven
bones absent from slots 9 and 26. Fixed 2026-09-08, with full 417-triangle
poses checked against the install by `tools/player-attack-probe.ts`.

**Laser phases.** Rechecked against `FUN_00434990` on 2026-09-08: a tap
raises the arm and fires at phase 12 even if released before then. The phase
continues to 63 before returning to idle. While held, phases past 51 wrap
back by 40 and charge saturates at 64. Releasing charge above 36 moves to
phase 52; full charge fires again and restarts at phase 12. The old port
froze at phase 12 and cleared the pose immediately on release. The basic
sequence is now ported; power-up autofire remains outside this controller.
The probe covers tapping, charging, recovery, and 100 repeated shots.

Keyboard firing uses **K**. The Left Ctrl alternate was removed because
combining it with forward movement on W forms the browser's close-tab shortcut.

The other 20 belong to moves that are not implemented yet — poles, zip lines,
the grapple, cutscenes. They are in the generated table and simply never
selected.

## Collision: the mover, read from toy2.exe

The player is a **swept sphere**. There is no step height and no capsule; the
sphere rolls over anything lower than its radius and the floor query handles
the rest. All of this was read from `FUN_004855f0` -> `FUN_00484380` ->
`FUN_00482a00` -> `FUN_00481fb0` on PC and checked against the PSX twins
(`FUN_80046b70`+`FUN_80046e50`, `FUN_80041ec0`), which carry the same
constants. Confidence: **high** for every number below.

| constant | value | where |
|---|---|---|
| sphere radius | **4000** game units (125 level units) | written into every collision-object record at level load, `FUN_00489c30` |
| sphere centre above the origin | radius + **0xc0** | the mover lifts by it before colliding and lowers after; the origin rests 0xc0 below the floor surface |
| edge test radius | radius + **0x40** | `FUN_00481fb0` passes it to the edge/vertex tests |
| ground vs wall | contact normal `y < -0x2000` (2.14, i.e. flatter than **60°**) is ground, else wall | `FUN_00482a00`, return 1 vs 2 |
| slope slide begins | ground normal `y >= -11999` (steeper than **42.9°**) | top of `FUN_00484380` |
| slide push | `n.x * 4096 / (((L + 0xc80) * -n.y) >> 5)` per axis, `L` = step length; for slopes past 75.5° the divisor uses 0x1000 in place of `-n.y` | same |
| split step | `|v|^2 > 0x400000` runs two half-steps | `FUN_004855f0` |
| broadphase reach | `L + 0x1880 + (radius * 8000 >> 12)`, cap 240 polys | `FUN_00484380` |
| response iterations | 4 if under 11 candidate polys, else 3; stop early once a pass finds nothing | same |
| contact skin | start distance `- 0x20`, end distance `- 0x60` (`- 0x80` on a moving object), both `>> 3` | `FUN_00482a00` |
| wall push-out | position and velocity `+= n * 3 >> 9`, then `+= n / 0x60`; velocity `*= 15/16` on the same tick | same |
| stuck | position unchanged against a wall for **0x14** ticks flags a touch | end of the mover |
| safe position | recorded every tick standing on ground with normal `y < -0xf3c` (flatter than **76°**) whose surface type is not 0..3 | `FUN_004a28f0`; the respawn reads it |

The per-tick algorithm, for the player (object 0), in game units, +Y down:

1. If `|v|^2 > 0x400000` do everything below twice with `v/2`, OR-ing the
   result flags. `L = sqrt(v.x^2 + v.y^2 + v.z^2)` (the one x87 call, an
   integer sqrt on PSX).
2. Lift: `pos.y -= radius + 0xc0`. Everything now refers to the sphere centre.
3. If on ground last tick and its normal is steeper than 42.9°, add the slide
   push to `v` (table above). Note the divisor grows with `L`: the push is
   strongest from rest.
4. Gather candidate polys within the broadphase reach from the static grid and
   every dynamic object. If none, `pos += v`, clear the flags, done.
5. Otherwise iterate. Each pass first re-tests the previous ground poly alone
   (`FUN_00483ef0`): a hit counts as "touching" and bends `v` to hug that
   surface, which is what keeps you attached going down a slope or over a
   bump. Then the full response over all candidates:
   - For each poly, signed distances of the sweep's start and end from the
     plane offset by the radius: `d = ((p - v0) . n >> 14) - radius`. A
     crossing (`d0 >= 0 > d1`) that lands inside the face (point-in-triangle
     on the dominant axis) is a hit at `t = d0 / (d0 - d1)`. A quad is two
     triangles with two stored normals; word 20 == 0x7fff marks a triangle.
   - Sweeps that end within 0x101 of the plane also run edge tests with
     radius + 0x40 and a vertex test, so the sphere can catch a corner.
   - Take the nearest hit. Move to it with the skin pulled back, then split
     by the normal: **ground** (`n.y < -0x2000`) projects the remaining
     velocity onto the plane and records the poly and normal as the ground;
     **wall** pushes out along the normal and projects the velocity off it,
     with a double-strength projection if a wall was already hit this tick,
     to stop wedging in corners.
   - A ground hit sets on-ground; a wall hit clears it.
6. Lower: `pos.y += radius + 0xc0`. Decay the platform-push accumulator by 3/4.

Two consequences for the port. First, "on ground" is not a slope test on a
floor query; it is a contact this tick with a poly flatter than 60°. Second,
there is nothing to stop the player's head: the mover only carries the one
sphere, and the separate floor query (`FUN_00486520`, "highest up-facing poly
at or below, from 0x400 above the origin") has a ceiling branch that the
controller uses for head-bumps, not the mover.

Collision-object record, 0x30 bytes at `0x729178` (PC keeps two, PSX four):
`+0x00` last-contact flags (poly's object id | 0x4000 second triangle |
0x2000 edge hit), `+0x04` last ground poly, `+0x08` `+0x0c` last ground normal,
`+0x0e` ground kind (1 static, 2 moving), `+0x18..+0x1c` platform push
accumulator, `+0x24` stuck counter, `+0x2c` radius, `+0x2e` surface type
byte (0xff none). The controller's `+0x8e` on-ground word is the pair of
result bytes the mover writes: low byte touched-anything, high byte on-ground.

## Falling out of the level

Where you come back is the safe position above, not the level's spawn:
`FUN_00414110` copies it into the player block on respawn.

The last branch of the player update is a death plane:
`if (levelLowest + 0x2000 < player.y) respawn`. `levelLowest` is computed once
at load in `FUN_00489c30` as the largest Y in the terrain — +Y is down, so the
lowest point of the level — and `0x2000` is 256 level units below it.

This matters more than it looks. Outside the collision hull there is no floor
at all, so a player who leaves it never lands: the fall query keeps returning
nothing and they drop for ever. The original never has to think about this
because its mover keeps you inside the level; a reimplementation without a
complete mover very much does.

## Sound

The controller and the animation scripts both fire sounds, and there are two
layers between them and a file.

**Taking a blow and dying** (decoded 2026-09-06 from the damage path of
`FUN_00407150`, ported). A hit that costs health decrements `+0x96`, throws
Buzz up at `-0x200`, sets the reaction timer `+0x94` to 90 and plays event
0x1a, which is `BUZJMP3` — the grunt doubles as the hurt sound. The
animation selector runs state 5 while that timer is above 0x44, so the
knocked-back animation is the first 22 ticks and the remaining 68 are the
recovery, during which the original sets a flag on `+0x40` instead: the
invulnerability flash, which is not ported.

Out of health, the same timer goes to -90, `DAT_0052b7dc` becomes 2 and the
selector runs state 7, the death. Event 0x15 plays, which is `BUZDIE1`, and
the lives counter is put on screen. The player reset at `FUN_00407150`'s
init fills health back to 0xe, which is why a respawn comes back full.

The original keeps a second counter at `+0x98` that gates whether a blow can
land at all; the port has one field doing both jobs.

**Effects** are 61 names in a table at `0x4fcdc4` — `BUZJMP1`, `BUZSKID`,
`SPLAT` — and `LoadSoundEffect` turns each into `data/sfx/<name>.wav`, which
is exactly what is on disc. That half is certain, and it is what
`src/audio/sfx.ts` uses: the sim names an effect and the audio layer finds the
file.

**Events** are the layer above: 200 records at `0x502950`, sixteen bytes
each, holding an effect plus a pitch, volume and falloff, and game code fires
event numbers rather than effects. Decoded in docs/LEVELS.md ("Sound events,
resolved"): the effect field is a **1-based** index, 1..61 into the global
name table and 87 upward into the level's own table, and the apparent
off-by-one was the caller subtracting one before the player added it back.
Not yet ported — `src/audio/sfx.ts` still takes effect names — but nothing
now stands in the way except the pitch field's scale.

## Pickups and Pizza Planet tokens

Read from `FUN_00447db0` (building the list at level load), `FUN_004a0f80`
(the per-tick touch test) and `FUN_0044e520` (what a touched object is), and
ported in `src/sim/pickups.ts`.

**The list.** One flat array of sixteen-byte records: `i32 x, y, z` in level
units, a byte id, a byte reach code, and an `i16` floor height that
`FUN_00486310` — the engine's floor-under-a-point query — fills in from ten
units above the pickup (`0x7fff` if it finds nothing or the floor is more than
`0x1800` below). Two sources feed it:

- every marker in `level.dat`, as a **coin**: id `0x10`, reach code `0x11`;
- every used **object id** from the level's starting id upward — `0x30`
  normally, `0x60` for levels 4, 10, 11 and 14, `0x50` for level 5 — with
  the id itself as the id and the placement's `param >> 3` as the reach
  (docs/FORMATS.md explains the id list).

**The touch test** runs over the list each tick, for records the renderer
flagged as near enough to draw:

    dx = (player.x >> 5 - x) >> 3
    dy = ((player.y >> 5) - 0xe6 - y) >> 3        230 level units up: his middle
    dz = (player.z >> 5 - z) >> 3
    hit when dx² + dy² + dz² < ((reach & 0x7f) + 14)²

A sphere, not the tall ellipsoid in `FUN_004100f0` — that one is the
object-and-enemy test, which an earlier note here wrongly called the pickup
test. A coin is taken from 31 x 8 = 248 level units, a token (param 216, code
27) from 328. After a hit the record is disabled by writing `INT_MIN` into its
y, and a class object is also hidden (`FUN_004ccb20(id, 0, 0, 0)` scales it to
nothing).

**What a touched object is.** Ids below `0x30` are coins. Otherwise
`FUN_0044e520` looks up the object's mesh and switches on its **polygon
count** as `FUN_0043e2d0` counts it (face groups with mode `& 0x1f` in 8..0xe
count double). There is no type field anywhere; the count is the type:

| polygons | category | effect in `FUN_004a0f80` |
|---|---|---|
| 0x24, 0x48 | 2 token | sets bit `slot` of `(&DAT_0052f0d7)[level]`, plays the reveal |
| 0x20 | 0 health | +4, capped at 14, 0xb4-tick flash |
| 0x12 | 3 extra life | +1, capped at 9 |
| 6 | 4 hint sign | `FUN_00402610(id)` opens the tutorial talk box (docs/LEVELS.md, "Hint signs and the talk box"); record stays live |
| 0x27 | 5 rocket boots | `FUN_004a4d60` |
| 0x14 | 8 hover boots | `FUN_004a4b70`; the object comes back after 400 ticks |
| 100 | 6 | `DAT_00882938 += 5`, capped 10 — ammunition of some kind, regenerating |
| 0x1e | 7 | `DAT_00882964 += 10`, capped 30 — likewise |
| 0x3c | 1 | `FUN_004a50d0(record)` |
| 0x1f, 0x32, 0x50 | 9 | a counter, `DAT_00830d4c++` — the find-five-items tasks |
| 0x13 | 10 | `DAT_0053c824 = 0x4b0`, a 20-second timer |
| anything else | -1 | nothing |

Coins: +1 capped at 99, and at exactly 50 event `0x4f` fires. The polygon
count as a type is a real hazard for any other mesh that happens to share a
count: level 10 has a 2 x 3 grid of 18-polygon props that the switch would
call extra lives, and it is only the level's starting id of `0x60` that keeps
them out of the list.

**Tokens start hidden.** Each level's init function calls
`FUN_004a0c80(list, spare)` with five object ids — the executable's lists are
in `src/sim/level-data.ts`, one per non-boss level — and hides every one of
them, disabling its pickup record, along with five consecutive spare copies
from `spare` up (level 1's five stand in a row at the level's edge, table A ids
`0x48..0x4c`). `FUN_004a0db0(slot, quiet)` reveals one: it re-enables the
record at the object's current position and either cuts the camera to it for
0xb4 ticks or, if quiet, just scales it back to full size. The list order is
the task order on the level's status screen; a slot whose saved bit is already
set gets a spare swapped in (`FUN_004cd0c0`). What reveals each slot is the
level's own script, which is not decoded — the viewer reveals all five at
once. Validation: all ten lists resolve to five 36-polygon objects in the
scene `sceneForLevel` names, and nothing else does.

**Which scene is which level.** `InitLevelPlay` (`FUN_00452fc0`) builds the
directory as `level%02d` from the level number, except that numbers above ten
subtract ten and switch to the `level1.*` scene. Levels 1..10 are
`level01/level`..`level10/level`; 11..15 are `level01/level1`..`level05/level1`.
The token lists confirm it: level 11's ids are tokens only in
`level01/level1.dat`.

**The spawn table** at `0x4f59a4` (`i32 x, y, z; i16 yaw`, sixteen bytes per
level, entry 0 unused) is in `src/sim/level-data.ts`. The y is a seed: the
engine drops a ground ray from `0x400` above it. Checked against the collision
of each level's scene, all fifteen have floor within a few units of the seed
except level 10, which starts 1,030 units above its floor.

## Ported

The mover is in `src/formats/collision.ts` as `sweepSphere`, behind the
controller's `Ground.move`. Faithful: the radius, the lift, the 60-degree
ground threshold, the contact skin, the pass count and the broadphase. Done
differently and marked so in the code: the exact push-out arithmetic is a
plain slide, and resting contact is a static overlap test against all the
candidates rather than the original's re-test of the previous ground poly.
That last one matters — without it a standing player is swept by nothing,
touches nothing, and flickers on and off the ground every other tick.
Not yet ported: the slide push on slopes past 42.9 degrees, and the split
step, neither of which changes behaviour measurably at these speeds.

`src/sim/player.ts` is a transcription of the tick above, `src/sim/trig.ts` the
angle system, `src/sim/input.ts` the keyboard and pad. `src/sim/pickups.ts` is
the pickup list and touch test, `src/sim/level-data.ts` the spawn table, token
lists and level-to-scene mapping, and `tools/level-objects.ts` checks the
token lists against the scene files.
`src/sim/player-animation.ts` is the state machine and script interpreter, and
`src/sim/player-animation-data.ts` is the table above, generated from the
executable rather than typed in. `src/sim/camera.ts` is the follow camera and
`src/audio/sfx.ts` plays the effects. `tools/player-probe.ts`
runs the controller headlessly and checks the motion it produces against the
closed-form values these constants predict; it is the regression test for any
later change.

## Not extracted

The "line" collision the mover also runs
(`FUN_00480660`, walking a linked list at `0x7290f4` of up to 32 vertical
segments, tested like walls) is dead on PC: the machine code reads that
head in three places (`FUN_00484380`, `FUN_0048c860`, `FUN_0048d530`),
zeroes it with the rest of its block at level load (`FUN_00489980`), and
never writes it, so every walk is over an empty list. Nothing to port.
