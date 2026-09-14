# The effect system

Decoded 2026-09-06 from `toy2.exe`. Everything that is not a model or a
level mesh and moves — Buzz's disk, the hover bot's shots, the coins
a dying creature spills, hit sparks, smoke, dust, the stomp's shockwave,
the sparkles over secrets, the boss missiles — is an **effect**: one of 64
records driven by a template and a behaviour byte. `src/formats/
effect-table.ts` reads the templates from the user's executable and
`tools/effect-table.ts` checks them; nothing from the executable is stored
in the repository.

| what | where |
|---|---|
| records | 64 x 0x3c bytes at `DAT_00529e58`; next-slot cursor `DAT_0052ad90` |
| templates | 128 x 16 bytes at 0x4ec160, 127 in use |
| spawn modes | 29 x 0x18 bytes at 0x4ec948 (entry 0 unused) |
| spawn | `FUN_0040fae0(x, y, z, vx, vy, vz, gravity, rotation, spin, kind)` |
| spawn a child | `FUN_0040fdf0(x, y, z, kind, mode)` — velocity from the spawn mode, then the above |
| tick | `FUN_00410f40`, once per game tick, after the player and creatures |
| draw | `FUN_00445980`, in the render pass after the pickups |
| touches Buzz | `FUN_004100f0`, from the player tick |
| dies | `FUN_00410b80(record)`, by the template's death code |
| random bytes | `*DAT_0052adac++`, a cursor over `rand.dat` loaded at `DAT_0084c3e0` |

## The record

| offset | | |
|---|---|---|
| +0x00 | i32 x, y, z | game units, +Y down |
| +0x0c | i32 vx | per tick; the spawner halves what it is given |
| +0x10 | i32 vy | — or, with the `homing` flag, the target: an entity pointer, or -1 for Buzz |
| +0x14 | i32 vz | |
| +0x18 | i32 gravity | added to vy each tick; the spawner quarters what it is given. Homing: the yaw |
| +0x1c | i32 floor | y of the ground below, 0x80000000 until asked |
| +0x20 | i32 | homing: the pitch, or -1 for none |
| +0x24 | i16 life | ticks left; template life x 2. 0 dead, -1 for one frame while the death hook runs |
| +0x26 | i16 width | card size, level units |
| +0x28 | i16 height | |
| +0x2a | u8 period | ticks per frame, template x 2 |
| +0x2b | i8 countdown | to the next frame |
| +0x2c | u8 sprite | sprite table index (docs/HUD.md); 0 means "not drawn" |
| +0x2d | u8 kind | |
| +0x2e | i8 death | what the death hook does |
| +0x2f | u8 mode | the behaviour byte |
| +0x30 | u8 frames | |
| +0x31 | u8 frame | current |
| +0x32 | u16 flags | below |
| +0x34 | i16 rotation | 0..0xfff; drawn x 16 |
| +0x36 | i16 spin | per tick; the spawner halves it |
| +0x38 | u8 r, g, b | colour, 0x80 neutral; the fades write here |
| +0x3b | u8 layer | 0x2c when opaque, else 0x2e (`FUN_00446fa0`) |

## The template

Sixteen bytes, copied almost verbatim: `sprite`, `period` (signed; a
negative value would randomise, none is), `life` (i16), `frames`, `death`
(signed), `width` (i16), `height` (i16), `flags` (u16), `mode`, `r`, `g`,
`b`. See `EffectTemplate`. Validation: every one of the 127 templates names
a sprite that has a header in the global table or a level's, with at least
`frames` frames that fit the sheet; every mode is a case the updater has;
every death code is 0..11 or a negative naming a real kind; every kind the
updater spawns as a child exists.

**Flags** (`EFFECT_FLAGS`): 0x01 test the ground and die on landing, 0x02
can touch Buzz, 0x08 homing, 0x10 flat on the ground instead of a
billboard, 0x60 the blend (0 translucent at alpha 0x40, 0x20 additive,
0x40 subtractive, 0x60 opaque — the same words the HUD uses, docs/HUD.md),
0x80 protected, 0x100 keep, 0x200 drawn.

## Spawning

The spawner refuses anything further than 800 x 256 game units from the
camera target (`DAT_0052adc0`), or 400 for kinds 0x37, 0x43 and 0x50. It
takes the next slot round-robin, but skips a live record with `protect`
set, settling for the protected one with the least life if it has gone all
the way round. Position is copied, velocity halved, gravity quartered,
rotation kept, spin halved; life and period are doubled from the template;
`drawn` is set; the floor is unknown.

The child spawner picks a spawn mode: four packed nibbles at +0 say how
each of vx, vy, vz and gravity (+4, +8, +0xc, +0x10) is randomised from
the next random byte `r`, and +0x14/+0x16 are the rotation and spin.
The six rules, with `v` the entry's value: 1 `((r & v) - v/2) * 8`, 2
`(r & v) * 8`, 3 `-(r & v) * 8`, 4 `((r & v) + (v >> 4 & 0xff0)) * 8`, 5
`((r & v) - (v >> 4 & 0xff0)) * 8`, 6 `((r & v) - v/2) * 16`; 0 uses `v`.
Callers often patch the returned record (life, size, spin, a velocity) right
after.

## The tick

### Disk launch corrections (2026-09-08)

These effects were initially mislabeled as the normal laser. They are disks;
the normal laser is a separate beam system described below.

The browser's firing call passed Buzz's yaw into a parameter also used as
pitch for untargeted shots. Facing +X therefore fired upward, facing -Z
fired backward, and facing -X fired downward. `spawnStraightDisk` now takes
separate yaw and pitch; the current controller has no vertical aiming and
uses pitch zero. Homing shots retain their existing initial yaw and
target-derived pitch. Target selection also skips zero-health creatures.
`tools/disk-probe.ts` reads the install's effect templates and checks eight
ticks of forward, level flight at all 4,096 headings, plus eight explicit
elevation cases. This verifies the launch correction, not retail parity of
the wrist origin, target selection, or charged-shot behavior.

The user's invisible-laser report exposed a second bug the flight-only
checks missed: `drawEffects` divided game-unit positions by 256 rather than
32 × 256. The resulting cards were 32 times too far from the world origin.
`effectCardPlacement` now converts centres from game units and sizes from
level units separately, preserving the renderer's Y/Z axis flips. The laser
probe also checks actual sprite-batch vertex positions at a nonzero origin.
Verified in headless Chromium with a real fired shot on level 2: a side
camera shows the bolt and spark trail beside Buzz. The follow camera can
hide the first part of flight behind his body. The wrist-bone origin is
still a gap; the firing pose's missing layer and phase progression were
subsequently fixed (docs/PLAYER.md, "Laser phases").

### Update order

For each live record, in this order:

1. life -= dt, floored at 0.
2. Move. Plain: `y += vy*dt; vy += gravity*dt; x += vx*dt; z += vz*dt`.
   Homing (flag 0x08): turn the yaw toward the target — Buzz's position
   less 0x2000 when the target is -1, otherwise the entity's hit-shape
   centre (`entity[0x21] + hitShape[animState].centre`), and a target whose
   `+0x7e` is 0 or `+0x70` negative kills the missile — at `delta * dt /
   turn`, the pitch toward it at `/ 0x14`, then fly at `0x4000 / speed`
   along them. `speed` is 0x10 (turn 8) normally, 8 for a template period
   of 0xc4 (turn `(life/16)^2 + 4`, so it tightens as it ages), and 6 when
   chasing a creature (turn `(life & 0xf) * (life < 0x20 ? 1 : 3) + 2`).
3. Animate: countdown -= dt; while it is 0 or less add the period and step
   the frame modulo `frames`. Only when `frames > 1`.
4. Spin: rotation += spin * dt, mod 0x1000.
5. Ground (flag 0x01), while alive: if moving or the floor is unknown, ask
   `FUN_00486280` for the floor under the record. If the floor is above
   `y + height*32` the record has landed: life 0, and if it went through,
   sit it on the floor and add a ground mark. Otherwise add a ground mark
   anyway (the list at `DAT_0054f098`, 47 slots: x, floor y, z, width — the
   drop shadows `FUN_00445720` draws).
6. Cull: further than 400 x 256 game units from the camera target, life 0
   and death code 0. A record with neither `keep` nor `drawn` dies: the
   drawer sets `drawn` each frame it draws the record and skips one with
   life 0 or sprite 0.
7. The mode switch, then the fade switch, below.
8. Life exactly 0 becomes -1; after the loop, every -1 record is zeroed
   (life 0, sprite 0) and the death hook runs on it.

Frame gates: `DAT_0052f1c2` and `c3` count how many 2- and 3-tick
boundaries this tick crossed; `c4`..`c8` are true on one tick in 4, 5, 6,
7, 8; `c9` one in 16; `ca` one in 32 (from the divider counters
`DAT_0052ad5a`..`62`, stepped by dt). The emitters spawn on gated ticks.

### Modes

`w`/`h` are the record's size, `per` its period byte, `L` its life. "Spawn
K in M" is the child spawner with kind K and spawn mode M. `light` is
`FUN_0044f200(x, y, z, r, g, b, 0x30)`, a screen glow drawn when the point
is on screen and the camera can see it (8 per frame). `mark` adds a ground
mark at the record's floor. `sound N` is the sound event N at the record.
`randomly` uses the random stream.

| mode | what it does | fade |
|---|---|---|
| 0 | nothing | — |
| 1 | mark under the record every tick (its height above the floor) | — |
| 2 | — | 1 |
| 3 | — | 2 |
| 4 | while L > 0x10, on 1-in-4 ticks spawn 3 in 3 (smoke trail) | 1 |
| 5 | — | 3 |
| 6 | — | 4 |
| 7 | light in its colour | 1 |
| 8 | pulse: `w = sin(L*0x80)/1024 + 0x78`, `h` the cosine; on 1-in-7 ticks while L > 5 spawn 0xf in 2 with random spin | — |
| 9 | grow 2/tick | 1 |
| 0xa | shrink 4/tick, floor 0x10 | 5 |
| 0xb | grow `per`/tick | 1 |
| 0xc | follow Buzz, rising `L * -0x22a` above him, shrink 8/tick | 1 |
| 0xd | follow Buzz, `(L + 0x10) * -400` above him, shrink 5/tick | 1 |
| 0xe | random rotation each tick; light | 1 while L < 0x20 else 6 (flicker) |
| 0xf | shrink `per`/tick, floor 1 | 1 |
| 0x10 | while L > 4 on 1-in-4 ticks spawn 0x24 in 0xf | — |
| 0x11 | while L > 4, spawn `c3` x 0x27 in 2 (the exhaust trail) | — |
| 0x12 | while L > 4 on 1-in-7 ticks spawn 0x2c in 2 at a random offset (±0x100), random spin | — |
| 0x13 | every 8th random byte re-aims vx/vz (±0x80); `w,h = sin(L*0x80)/2048 + 0x28`; dies below the water line `DAT_0053c628` | — |
| 0x14 | grow `per`/tick | 3 |
| 0x15 | ride Buzz's wrist: `x,z` = Buzz + 0x580 or 0x280 along his yaw (by `per` == 0x65), y - 0x400; while L > 4 spawn 0x2e (0x2d underwater) with Buzz's horizontal velocity halved, gravity -0x10 | 1 |
| 0x16 | grow 0x20/tick to 0x140 | — |
| 0x17 | mark at the floor; land: life 0, sit on the floor | — |
| 0x18 | shrink `per`/tick, floor 1 | 1 |
| 0x19 | mark at the floor; land: bounce (vy = -vy*6/8), die when |vy| < 0x100, sound 0x1f | — |
| 0x1a | sound 0x44; while L > 4 spawn 0x40 in 2 at a random offset (±0x1000); light | 1 |
| 0x1b | shrink `per`/tick in both axes, floor 1 | — |
| 0x1c | unless `per` == 0xc6: floor with a 100-unit mark; land: bounce vy*3/4, die when |vy| < 0x400, sound 0x68. On 1-in-7 ticks while drawn and L > 5 spawn 0xf in 2, random spin | — |
| 0x1d | **the homing disk.** Sound 0x55 on 1-in-8 ticks. Within 0x4000 (level units squared, i.e. 128) of the target's hit-shape centre: if the placement's vulnerable byte is 4 the bolt **bounces** — flags lose `hurts` and `homing`, vy = -0x400, gravity 0x30, vx/vz = the angle from target to bolt, mode 0x1e, life 0x32, sound 7 — else `FUN_00408a60(creature, angle, 4)` damages it and the bolt dies with death code 8 | — |
| 0x1e | the straight disk: while L > 4 spawn `c3` x 0x2c in a random offset (±0x80) with a third of its velocity | — |
| 0x1f | shrink 4/tick, floor 0x10 | 1 |
| 0x20 | `w,h = tri(DAT_0052ad61) * 8 + 100` (the 1-in-16 counter as a triangle wave); on `c2` ticks while drawn and L > 4 spawn 0x4d in 2 with random spin | — |
| 0x21 | shrink `per/2`/tick, floor 1 | 1 |
| 0x22 | grow `per`/tick | 7 |
| 0x23 | flat floor: `w = vy/64 + 0xfa, h = 0xfa - vy/64` (swapped when rotation bit 0x400); land: bounce vy*3/4, sound 0x71; mark | — |
| 0x24 | ride Buzz at ±sin(yaw)/10 (sign from spin), rising `(0x18 - L) * 0x120`; grow 4/tick | 1 |
| 0x25 | shrink `per`/tick, `h = w/2` | 1 |
| 0x26 | level-specific bounds on x (-0x5aa13, -0x36a56, -0x42754) that reflect vx; land: vy = -vy/2, sound 0x71; mark | — |
| 0x27 | sound 0x40; light; on 1-in-4 ticks while drawn and L > 4 spawn 0x5a in 2, random spin | 3 |
| 0x28 | shrink `per`/tick | 3 |
| 0x29 | on 1-in-4 ticks while drawn and L > 4 spawn 0x62 in 2 | — |
| 0x2a | cap vy at 0x180 and on 1-in-32 ticks re-aim vx/vz randomly; `w = sin(L*0x40) / per` | — |
| 0x2b | rotation = 0x7ff - yaw; hover 0x800 above the floor; on `c2` ticks, 1-in-4, while drawn spawn 0x6b in 2 with that rotation | — |
| 0x2c | floor; die 0x1000 below it; while drawn and L > 4: 1-in-4 spawn 0x2c in 4 with 2/3 of its velocity, 1-in-6 spawn 0x69 in 2 with its rotation, 1-in-8 spawn 0x6a in 2 rotated ±0x180..0x280 randomly | — |
| 0x2d | shrink `per`/tick, `h = w/2` | 2 |
| 0x2e | grow `per`/tick; light (b, b/2, 0) | 1 |
| 0x2f | level 12's ball (`FUN_0042b090`): trail 0x6e in 2 behind it on 1-in-4 ticks; inside the pit x (-0x256d6, 0xe0aa) z (-0x1b3e9, 0x1b297) it has a floor at y -0x12bd3 which it lands on and bounces off at 7/8, outside it none; the room's walls x (-0x29b56, 0x2a62a) z (-0x230e9, 0x22b97) reflect it; within 1,024 level units of (-0xbd7c, 0x99) in x/z it dies; any bounce sounds 0x43 | — |
| 0x30 | level 12's other ball (`FUN_0042b250`): the same "dies near (-0xbd7c, 0x99)" test, trail 0x6f in 2 | — |
| 0x31 | sound 0x40; place object 0x19 at the record and face it along the yaw (`FUN_004cce30`, `FUN_004ccc70`); on `c2` ticks while L > 4 spawn 0x2e with its own velocity | — |
| 0x32 | colour ramps up over the first 0x12 ticks (from L 0x52) | 2 |
| 0x33 | on 1-in-4 ticks while L > 4 spawn kind `per/2` in 2 with random spin; `per` == 0x76 fades | 2 if per == 0x76 |
| 0x34 | level 10's bouncer (`FUN_00425ad0`): kept inside x (-0x169eb, 0x16915) z (-0x16cef, 0x16991), each wall reflecting it with sound 0x4a | — |
| 0x35 | `w = sin(L*0x40) / per`; on 1-in-16 ticks while L > 4 spawn 0x2e in 2 with life 0x30 and size 0x2000/per | — |

**Fades**, applied after the mode, scale the template colour by the life:
1 over the last 0x20 ticks, 2 over 0x40, 4 over 0x100; 3 fades red over
0x20 and green/blue over the 0x10 before that (fire cooling); 5 the same
in three stages (red under 0x10, blue from 0xd, green from 0x19); 6 a
random 50..100% flicker each tick; 7 fades IN over the first 10 ticks (from
L 0x2a) then as 1.

### Death codes (`FUN_00410b80`)

0 nothing. 1, 2, 4: `FUN_00410850(record, 0/1/2)` — sound 0x4a (or 0xc on
level 1, 100 elsewhere, for code 1), five sparks of kind 0xd (0x1e for code
2) in mode 9 with a random period 6..12 and life period x 5, plus one kind
0xe (0x38) in mode 2 for codes 1 and 2. 3: five 0x25 in 0x11 at the top of
the card, one 0x28 in 2, a point light, sound 0xb. 5: five 0x29 in 0xf
scattered ±0x20 x 0x3c with random spin and life, a point light. 6: five
0x3e in 9. 7: three 0x25 in 0x11, sound 0xb. 8: as 3 without the 0x28.
9: three 0x11 in 4 at size 0xfa with random spin and life, sound 0xb.
10: one 0x78 in 2 at the top of the card. 11: one 0x75 in 0x1c with random
spin. Negative: one kind `-code` in mode 2.

The **point light** is `FUN_0049ee50(x, y, z, colour, lifetime, owner)`.
Rechecking the allocator corrects the earlier radius/8-slot interpretation:
records at `DAT_00830d60` are 24 bytes, with temporary slots 2..5, reserved
slots 0/1 and a transition record at slot 6. It replaces the temporary slot
with least remaining lifetime (first wins ties). `FUN_0049eee0` selects a
nearby light for Buzz's character lighting, not map illumination.

## Drawing (`FUN_00445980`)

For each record with life and a sprite: the sprite header gives the sheet
and the frame's texel rect (frame = +0x31); colour = the record's r, g, b
with alpha 0x40 for blend 0 and 0xff otherwise; blend word 0xc40 for 0 and
0x60, 0x4840 for 0x20, 0x20840 for 0x40. Without `flat`, a billboard
(`FUN_004b8e60`, the coin's) at rotation x 16, size width x height; with
it, a flat card (`FUN_004b8a30`, the coin shadow's) 10 level units below
the record with the rotation negated. `drawn` is set. Positions are game
units x 1/32.

## Touching Buzz (`FUN_004100f0`)

Each tick, for every live record with `hurts`, if Buzz's centre (0x1cc0
game units above his position, with y weighted half) is within `width +
100` level units of it, the **sprite** says what it is:

| sprite | it is | effect |
|---|---|---|
| 0, 1, 0x13 | a shot | Buzz is hurt (`FUN_004071e0(angle, 3)`), the record is left alone |
| 4, 5, 0x33, 0x34 | a missile | the record dies by its death code and Buzz is hurt... |
| 7 | | ...only while `DAT_0052f39c` (a per-level switch) |
| 0x10 | **a coin** | coins += 1 (`DAT_0052f39e`, to 99), the coin counter shows for 0xb4 ticks, sound -1 (a sequence), the fifty-coins fanfare 0x4f at exactly 50 |
| 0x15 | | dies with death code 4 |
| 0x16 | | sets `DAT_005281a4` from its life while `DAT_0052f38e` |
| 0x35, 0x36 | | death code, Buzz hurt (0x35 only while `DAT_0052f39c`) |
| 0x37 | | Buzz hurt |

But when Buzz is spinning (`DAT_0053c650 >= 0x15` and `DAT_0053c83c >
-0x78`) a missile is **deflected** instead: `hurts` and `homing` cleared,
vy = -0x400, gravity 0x30, life 0x32, vx/vz away from Buzz at 0x100 a
tick, sound 7. The hurt itself uses the angle from the last touching record
to Buzz.

## Normal wrist laser: beams, not disk effects

Corrected after the user identified the homing disks. `FUN_00434990` calls
`FUN_004a5d30` for the ordinary wrist weapon; it calls `FUN_004a4960` only
when the disk-ammo counter is nonzero. The earlier effects research and
implementation had mistaken the disk branch for the default weapon.

`src/sim/laser.ts` implements the separate four-record beam pool:

- Maximum range 0x20000 game units (4096 level units), with a 32-tick fade.
- Hits are resolved at firing time against scenery and animated creature
  ellipsoids. The nearest hit clips the beam; it does not chase an enemy.
- Aim assistance is limited to 0x80 angle units from the facing, with pitch
  clamped to ±0x40. Only creatures whose vulnerability includes bit 4 qualify.
- Normal shots are red, half-width 32 level units, damage kind 2; charged
  shots are yellow, half-width 64, damage kind 3. The temporary powered
  laser is green, half-width 32, and also uses damage kind 3.
- The tail retracts 0x800 game units per tick while the endpoint stays fixed.
- Drawing uses sprite 9 from the install, tiled over 400-level-unit segments,
  with frame 2 at the tail and frame 1 after it. U follows the beam's length;
  V runs across its glowing core. Mapping those axes the other way made bars.

With disk ammo, the port instead launches one disk and consumes one round.
At zero ammo the next shot is a beam again. Active disks are capped at six;
rejected launches do not spend ammunition. `tools/beam-probe.ts` checks beam
geometry, hit order, wall occlusion, aim limits, colours, fading and UV axes;
`tools/disk-probe.ts` checks the separate particle trajectory and placement.

Browser verification on level 4: collected a real category-7 pickup for ten
rounds, fired ten disks with ammo 9, 8, …, 0, and confirmed the next shot
created a red beam with no disk effect. A captured side view confirms the
beam's texture runs along its length instead of producing transverse bars.

Remaining differences: the muzzle uses an approximate body-relative origin,
the beam/scenery query reuses the swept-sphere implementation, and the
original's reflected beam and special first-person targeting are not ported.
Floating-point segment/ellipsoid intersections replace the integer routine.

## The disk launcher (`FUN_004a4960(aim)`, from `FUN_00434990`)

Requires disk ammunition (`DAT_00882964`) and a free disk permit
(`DAT_00882968`, initially 6); both counters drop by one when fired. Unless the camera is in modes 3+ (then the
target comes from `DAT_0050a4fc`), the nearest live creature whose
placement's vulnerable byte is nonzero, whose `+0x70` is not negative and
whose flags have both bits 0x1 and 0x2, within 4096 level units, becomes
the target: spawn kind **0x47** at the wrist (`DAT_0050a0a0/a4/a8`) with
the yaw in the gravity word (`yaw << 2`, quartered back), the target in
+0x10 and the aim in +0x20. With no target, kind **0x48** flies straight
along the yaw at `0x4000/3` a tick, rising by the aim's sine over three.
Sound 0x54 either way.

## Known spawn sites

| who | kinds |
|---|---|
| the disk launcher | 0x47, 0x48 |
| the stomp (`FUN_00434d20`) | 0x12 in 0xb, 0x13 in 0xc, 0x400 above Buzz, sound 0xf |
| the spin (`FUN_00434eb0`) | 0x16/0x17 in 2 (charge trails, rotation from the spin counter), 0x14/0x15 in 2 at 0x3000 up |
| a creature dying (`FUN_00405d20`) | 0x3d (the coin, floor set at once), 99 in 4 or 14, 0x11 in 4, 0x23 in 0xe |
| the hover bot (`FUN_00406220`) | 0x26 from each gun on animation frames 0xb6 and 0xa6, sound 0xd |
| creature exhaust (`FUN_004064a0`) | 0x27 in 2, two nozzles |
| creature beam (`FUN_00406a90`) | 0x61, then 100 in 0xf |
| creature handlers `FUN_00410540`/`FUN_004106c0` | 0x7d, then 0x7e and 0x7f together |
| push block dust | 2 |
| secrets (path tag 58) | 0x71, 0x73; `FUN_0049fab0` ends one by kind when its marker is spent |
| bosses (levels 6, 14, 15) | 0xc, 0x66 with the pitch set (homing at Buzz) |
| levels 1, 2, 6, 7, 8, 10 ticks | many: every level script decorates its rooms |

## What is not settled

The names of the two light-like helpers are read from their shape:
`FUN_0044f200` projects the point, tests the line to the camera and keeps
up to eight per frame (a glow drawn later); `FUN_0049ee50` keeps eight
positions with a colour and a countdown that the character lighting reads
(a point light). `FUN_0049e660` with a negative event number plays a sequence from
`PTR_DAT_00503828` rather than an event; the coin pickup is one.

## Ported

`src/sim/effects.ts` is the pool, the spawner, the child spawner, the tick
in the order above with every mode the switch names, the seven fades, the
twelve death codes and the touch test. `src/main.ts` fires beams or disks according to ammo, feeds
the creature port's shots and sparks in, hands hits to `damageCreature`,
turns a touched coin into a coin and a shot that landed into
`hurtPlayer()`. The cards are drawn by two additive `SpriteBatch`es beside
the coins' translucent one, with the template's spin.

Historical disk-path check in the browser on level 1 (before ammo gating):
firing with nothing in range spawns kind
0x48 and its mode-0x1e trail, one 0x2c spark per 3-tick gate; firing at a
creature spawns kind 0x47, which homes in three axes and, against one whose
`vulnerable` byte is 4, **bounces** — losing `hurts` and `homing`, taking
mode 0x1e and spawning that same trail, exactly as the decode says. Against
a creature with `vulnerable` 7 the bolt closed from 1,148 level units to
149 and landed damage kind 4, taking it from 4 health to 2, which is the
2 that `DAMAGE_KINDS[4]` carries.

Two things are not as the original has them, and each is named at its
site (modes 0x2f, 0x30 and 0x34 were read and ported on 2026-09-07): the
bolt's starting pitch is aimed at its
target because where `FUN_00434990` gets the aim it passes was not read,
and level it passes over anything much above the wrist; and the disk launcher
targets the nearest creature that is in this tick's near list rather than
the original's "near list AND explicitly awake", which would leave it with
almost nothing to aim at.

One thing the port had to get right that the decode only implies: the
original re-reads the target's hit-shape centre EVERY tick, so a bolt
tracks what it is chasing. Snapshotting it at spawn leaves the bolt
orbiting the spot a flier has left.

### Prop feedback: guide points and sound sequences

`src/sim/guide-sparkles.ts` reads path 58 without modifying the source data.
The zero point separates primary kind `0x71` hints from secondary kind `0x73`
hints. `FUN_0049fb40` runs on the 16-tick gate, visits one of four interleaved
point groups, and emits only within the original squared camera-distance
threshold. `FUN_0049fab0` retirement prevents future emission and kills live
hints at the exact authored position. Pushable engagement retires its primary
index; the chair launch retires secondary 0; a trailer paint control retires
secondary 0–2. Other prop scripts need retirement hooks as they are ported.

`src/audio/sequences.ts` implements the shared global sequence slot from
`FUN_0049e910` / `FUN_0049e9d0`. It reads the six pointers and shared script
pool from the user's executable, skips the three rumble-header words, and
processes effect/pitch/volume/delay records, termination and backward jumps.
The delay comparison is strictly negative: a delay of 5 spaces notes six
simulation ticks apart. A new cue replaces the old one. Paint success is -5;
error is -6, whose jump reuses -5's final volume-16 note. Playback resolves
one-based effect IDs directly, applies positional attenuation and script
volume, and retains the PC path's ignored SPU pitch. Sequence sounds are
preloaded when audio starts. Simulation pause freezes their clock; level
loads, respawn and selector entry clear the active slot and guide state.

`tools/prop-feedback-probe.ts` verifies actual script timing, the shared tail,
looping control flow and guide cadence/lifetime. The stomp probes verify cue
triggers and retirement, including duplicate-colour reset and all mixtures.

## Animated texture regions (2026-09-13)

`src/sim/texture-animation.ts` ports the seven common level scroll scripts
for levels 1, 2, 3, 5, 8, 11 and 13. The callsites are respectively
`00418471`, `0041a722`, `0041b38b`, `0041f76c`, `00423cc0`, `0042aef7`
and `0042cde3`. Level 1 runs only in camera zone 6; level 11 only in player
zone 5. Their gated phases hold outside those zones. Other phases advance
each gameplay tick, even with the graphics option disabled.

The `0049b260` / `004ce510` wrappers feed `004afd30`: x/y name the
destination rectangle, while x+dx/y+dy locate its source. The source wraps
within its rectangle before copying. The PC vertical path takes precedence
over horizontal scrolling whenever scrollY is nonzero. The port preserves
all RGBA channels, snapshots the source to handle overlap, rejects invalid
bounds without mutation and marks changed DataTextures for GPU upload.
Original pixel arrays and scene clocks are restored on respawn, level load
and selector entry. These clocks are local to the scene in the browser port.

The graphics row uses the original on/off strings and persists the setting;
turning it off skips copies without stopping script phases. Level 2's supplied
PC replacement sheet has a solid-colour source region, so repeated scrolling
there produces no visible movement after the initial copy.

Two known calls remain unported: level 8's `00424227` depends on the
unimplemented `0052c9b8 & 1` prop flag (page 18, destination 64,0, size
20x64, source offset 20,0); Cosmic Shield's `004a5331` depends on shield
activation/rendering (page 16, destination 128,192, size 64x64, source offset
0,-64). The seven common scripts do not imply full texture-effect parity.

`tools/texture-animation-probe.ts` checks wrapping, vertical precedence,
overlapping copies, invalid bounds, zone gates and 256 ticks of all seven
local sheets with unchanged pixels outside each destination. The browser
`tools/texture-animation-flow-check.js` verifies enabled and disabled pixels,
GPU upload versions, menu persistence and exact pixel restoration on respawn.
Both browser cases and the menu probes pass, as does the production build.


## Gamma colour gain (2026-09-13)

`src/render/gamma.ts` implements the PC's linear RGB gain: `004b3740`
constructs a 256-byte lookup by stepping a 16.16 accumulator; `004b37b0`
substitutes RGB and preserves alpha. Gains are 2.0, 2.5 and 3.0. This is a
clamped colour multiplier before texture modulation, not a display gamma
power function or whole-screen filter. Channels above 127 at the default
setting saturate before multiplying the texture. Earlier HUD documentation
saying that colour 255 could double a texture was a PSX approximation and
does not match this PC path.

Immediate calls `004b8a30` (flat cards), `004b8e60` (billboards), and
`004b8cc0` (screen quads, except its 0x80000000 bypass mode) use the lookup.
The static loader also multiplies by the configured float at
`004cbb33/5f/8b`, rather than an unconditional factor of two. The port applies
gain to level, player and creature vertex attributes and both sprite
renderers. Original float colour arrays remain available to rebuild GPU
attributes when the option changes; disposed attributes are weakly held.
The browser updates already-loaded geometry immediately for preview, while
the PC applied static-geometry gain during loading. HUD tint caches clear
when gamma changes, and neither sprite opacity nor texture alpha is changed.

The renderer reconstructs byte modulation from its existing 0x80-neutral
inputs. Level geometry still comes from DAT rather than NGN vertices;
untextured DAT colours approximate NGN's conversion/halving and can differ
by a byte. This milestone does not establish byte-exact DAT/NGN colour
parity. Fog is now covered by the follow-up below. The clear-colour path
(`004b2c80`) and screen quad bypass mode still need comparison with the
port's backdrop/fade paths.
The lens-flare follow-up below now covers the renderer and six callsites.
Its entry points
are `0044f420` (candidate filtering/queue, up to eight) and `0044f580`
(projection, attenuation and the 17-entry sprite chain at `004f72d8`). Do
not claim full source parity until the remaining conditional calls are ported.

Validation: `tools/gamma-probe.ts` checks all 768 lookup entries and menu
limits/labels/cancellation; `tools/gamma-flow-check.js` verifies real menu
persistence, preview/rollback, canvas texels, existing geometry restoration,
and world-sprite colours with unchanged alpha. The production build, menu
probes and animated-texture disabled/reset browser regression also pass.


### Fog follow-up (2026-09-13)

`004b2cf0` passes the packed fog RGB through `004b37b0` before storing it.
Level 14 supplies 0x101010 and a 24000–46000 level-unit band; its rendered
fog colour is therefore 0x202020, 0x282828 or 0x303030 across the three gamma
settings. `Viewer.setFog` keeps the unadjusted source so changes and rollback
do not compound the gain. Clearing fog also clears that source.

`004b2d80` submits mode 3 (linear) at `004b2da4`. Three.js r169's built-in
fog chunk uses smoothstep instead. `GameMaterial` replaces only that factor
with a clamped linear view-depth fraction. This covers the viewer's basic
mesh materials, including textured, alpha-tested and blended geometry;
world-sprite ShaderMaterials still use their existing unfogged path.
The latter needs a separate retail fog-enable comparison.

Clear-colour research: `00440f70` packs the same halved source, but chooses
clear flags 2 when a backdrop flag is set (depth only), and flags 3 otherwise
(colour plus depth). Every shipped scene enables a backdrop flag. Applying
an arbitrary gamma multiplier to the port's fallback scene background would
not reproduce that draw sequence. The unported backdrop/clear path and the
screen-quad bypass remain open.

Lens-flare source research: `0044f200` takes position, RGB and a size term.
Before queuing, it tests a segment from camera `0052adc0/c4/c8` extending
90 percent toward the source through `0048c860`, then rejects off-screen
and out-of-depth-range projections. Sixteen calls exist in level/creature
scripts; six are now connected by the follow-up below.


`tools/fog-flow-check.js` loads the actual level 14 fog band, checks all
three gamma colours and rollback, and reads GPU pixels from `GameMaterial`
at seven depths, including quarter points that distinguish linear fog from
smoothstep. It also checks fog-disabled rendering and the real pause →
summary → selector flow, including changing gamma after fog is cleared.
Those checks, the gamma lookup/menu browser regressions and production
build pass. Browser probes reuse loaded Vite module URLs so HMR query
strings cannot create a second gamma state or Three.js instance.


## Lens-flare renderer (2026-09-13)

`src/sim/lens-flare.ts` reads the 17 six-short records at `004f72d8` from
the user-supplied executable: sprite index, X/Y scales and RGB multipliers.
Ten entries draw sprite 4, 5 or 7; zero entries still advance the chain.
`0044f580` steps from source to screen centre and beyond in eighths. Its
strength is `0x103ff - min(0xffff, dx*dx + dy*dy)`; scale adds the source's
size to strength divided by half of the remapped depth plus one. RGB uses
signed integer products shifted by 23. The draw helper's flag 0x20 selects
additive blending at full alpha.

The host projects with the active browser camera into 512x256 space and
maps normalized depth to `50 + 47950*z`. It rejects sources outside the
screen/depth range and tests a zero-radius collision sweep from camera to
90 percent of the source displacement. Eight visible sources are accepted.
This uses the port's existing collision sweep; exact parity with the PC
`0048c860` mask/filter and its double-buffered projection timing remains
unverified. The browser uses its current camera clip planes rather than
reconstructing a separate retail projection matrix.

Connected sources are the five effect glow calls (behaviours 7, 0xe, 0x1a,
0x27 and 0x2e, size 48) and level 3's unconditional fixed light at `0041b418`
(size 128, RGB 128). Behaviour 0x1a sends green for both red and green, as
`00411ab8/ab9` do. Glow collection no longer shares an early cap with point
lights: visibility rejection occurs before the renderer's eight-source cap.

`Viewer.setLensFlares` builds screen-space additive batches on a separate
orthographic scene, rendered after the world and before the DOM HUD. It
uses the original atlas frames and gamma modulation. Drawing additively
inside the transparent HUD canvas is insufficient: black texels would still
cover the world when that canvas is composited. The WebGL pass adds directly
to the world framebuffer. Scene changes, respawn and leaving play clear the
batches and texture references. Nothing persists into the selector.

The original lens-flare option is now first at y75, followed by detail,
gamma and animated textures at y100/125/150. It supports preview, rollback
and persistence under `ts2.lensFlare`, default on. This does not imply all
sources were ported by that milestone alone. The follow-ups below now
connect all sixteen recovered calls; projection, collision and pose parity
limits still apply.

Validation: local table/art and visibility probe; actual arena source in
Chromium with ten sprites; off preference persistence; looking away removes
the source; additive framebuffer checks; real pause/summary/selector cleanup.
Gamma and animated-texture navigation regressions and production build pass.

### Path-light follow-up (2026-09-13)

`pathFlareSources` connects seven level-tick calls using the DAT path table
at `00559c70[tag]`. Points shift left five into game units. Camera-minus-light
deltas each shift right eight with signed arithmetic before squaring; the
distance cutoff is strict. Level numbers follow the dispatch table in
docs/LEVELS.md, including Zurg as level 12.

| Level | Call | Path tag | RGB | Size | Squared distance cutoff |
|---|---|---|---|---|---|
| 5 | `0041fdc4` | 17 | 64,48,32 | 128 | 1,000,000 |
| 10 | `00425ff0` | 13 | 128,128,128 | 64 | 1,000,000 |
| 11 | `0042addd` | 19 | 32,32,32 | 128 | 1,000,000 |
| 12 | `0042b443` | 0 | 128,128,128 | 64 | 1,000,000 |
| 13 | `0042d2c3` | 10 | 48,64,80 | 64 | 1,000,000 |
| 14 | `0042f1e6` | 40 | yellow/cyan, faded | 128 | 262,144 |
| 15 | `004307d1` | 0 | white, third point red | 128 | 1,048,576 |

Level 11 skips these lights in camera zone 4. Level 14 selects points 0–15
when `(player.x >> 8)^2 + (player.z >> 8)^2 < 0x8e5144`, otherwise points
16 onward. Intensity is `128 - (trunc(sqrt(distanceSquared)) >> 2)`:
inner points send (intensity,intensity,0), outer points (0,intensity,intensity).
Level 15's zero-based point index 2 sends (128,0,0). Authored point order
survives filtering, ahead of the renderer's visibility/eight-source cap.

Validation: lens-flare-probe reads all seven installed DATs, verifies real
source positions, strict/signed distance boundaries, room gate, airport
band selection/fade and finale colours. Browser `?flares=paths` exercises
an authored level 10 light, checks additive framebuffer pixels, and exits
through pause/summary to a clean selector. Production build passes.

### Level 4 flicker (2026-09-13)

`0041c286` initializes intensity 0, target 128, timer 60. `0041d8b0`
subtracts elapsed ticks; strictly below zero it toggles target between 0/128
and consumes one random byte masked with 63 for the next interval. Intensity
approaches the target by twice elapsed ticks, clamped. Zero emits no source;
1–64 sends (2i,2i,0), 65–128 sends (128,128,2i-128). Path 6 lights use size
64 and the same strict 1,000,000 camera-distance cutoff as other path lights.

The port steps this state during gameplay with the creature simulation's
shared random stream, regardless of the graphics preference. HUD redraws
only read it; pause freezes it and spawning resets it. This recovers local
timing, not the exact global random cursor of all still-unported scripts.
The probe covers timer-zero behavior, random consumption, fade clamps,
colours, darkness and the installed path. Browser `?flares=flicker` verifies
timing and additive pixels, plus pause, respawn and selector cleanup.

Source dependencies (type 20 now ported below): `00406880` belongs to type 20's handler
`00406620`, during its active beam interval (private timer 100..280).
`0042537d` belongs to level 9's boss laser, gated by spin cooldown and
player proximity (docs/LEVELS.md). Both are green beam-impact lights,
size 32 and 64 respectively; their rays/attacks belong together.

### ZPOD beam and impact (2026-09-13)

Type 20 (`ZPOD`, handler `00406620`) now emits sustained beam requests during
timer 100..280 inclusive. Outside its chase box it resets to 360. Below zero,
it resets to 360 and chooses heading +/-0x200 using a random byte, setting
X/Z drift to sine/cosine shifted right four. Hover lean clamps the handler's
forward component to +/-512 and eases by `(hover+lean)*dt/16`. Sound 0x5b
runs while not dying; each active beam raises impact sound 0x5c.

The host poses part-zero's (0,0,-100) attachment, casts delta
`(sin(heading)*4,96000,cos(heading)*4)` with radius 256, and draws a green
sprite-9 strip of half-width 32, with flare size 32 at its endpoint. Damage
uses `0049f400`'s strict 25-step endpoint radius, each signed delta shifted
eight before squaring, and reaction 3. Existing player invulnerability applies.
Two-tick gates spawn kind 4/mode 4 sparks, four-tick gates kind 0x46/mode 2;
the 32-tick gate emits the green character light described below.

`stopAtFirstContact` is an opt-in collision query: beams stop instead of
sliding along terrain. Ordinary movement keeps its previous behavior. The
sustained beam list is rebuilt per simulation tick, frozen on pause and
cleared on respawn/exit; it does not occupy wrist-laser slots or retract.

Limits: attachment posing uses the browser's floating animation matrices
rather than the retail fixed-point routine; collision uses the browser hull
and character shading retains the shared triangle-normal approximation. Level 9's separate boss laser is connected by the follow-up below. Tests cover timer edges, drift/reset, muzzle transforms, first-hit
terrain clipping versus movement sliding, impact radius, a real level 4 pod,
damage/invulnerability through the attack resolver, and pause/selector cleanup.

### Level 9 boss laser (2026-09-13)

The fight state in `pod-boss.ts` now gates `0042537d`: no beam during the
entrance, helper-release cuts, spin cooldown or death; the active boss also
requires Buzz within 400 signed 256-unit steps. Its part-zero muzzle uses
(0,0,-400), and aiming clamps to +/-0x200 of heading. The negative wrap
subtracts 4095, matching `00425217`, rather than the usual 4096.

The same downward delta and first-contact terrain cast as ZPOD drive a
sprite-9 beam with half-width 128 and a green size-64 endpoint flare.
Impact sound is 0x87, damage radius 30 steps, reaction 3; a fresh hit raises
0x84 and the 0xd7 voice with its 1200-tick cooldown. Existing spark gates
apply; green impact lights now use the shared temporary pool (below). The full arena regression
covers entrance, beam/flare, six helper waves, final phase, delayed death,
victory movie/summary and clean selector return. See docs/LEVELS.md for
remaining fight presentation differences; all sixteen recovered flare
calls being connected does not imply complete renderer parity.

### Pod burst character lighting (2026-09-13)

`00424faf` requests RGB (240,128,0), lifetime 32 at the BUB's ground point
once the release cut is strictly below 60 ticks. The host now retains this
request in the four temporary slots instead of losing it when effect outputs
clear. Each simulation tick decrements life before selection. Distances use
signed deltas shifted eight from (Buzz.x, Buzz.y-8192, Buzz.z); squared
distance above 0x8000 immediately expires the slot. The nearest living source
wins, with the first slot winning ties. RGB is attenuated by
`(channel * (65536 - squaredDistance)) >> 16`. Pause does not age the pool;
spawn, respawn and level exit reset it.

Buzz's renderer adds directional colour to the posed triangles before gamma
and texture modulation. This is explicitly a shading approximation: it derives
face normals from triangles and retains the existing base colours. Retail's
normal lighting, scripted reserved-light overrides and the other effect/beam light callers
remain open. Owner-based transitions are connected by the follow-up below.
The light does not tint the map or create another lens flare.

`tools/point-light-probe.ts` checks allocation, lifetime, range, attenuation
and directional colour. `tools/player-light-flow-check.js` checks actual
framebuffer RGB and reset. The full pod browser test positions Buzz near each
opening and verifies orange light selection across all six waves, expiry and
victory/selector cleanup.

### Temporary-light return transitions (2026-09-13)

`0049f026..0049f2bb` compares the selected records' owners, not just their
slot numbers. Equal owners retain the previous slot, including if that record
has expired while another record with the same owner is closer. A new temporary
owner takes effect immediately. Returning to a reserved light captures the
outgoing interpolated world position and RGB and begins a 64-tick transition.
Each component is `destination + trunc((snapshot-destination)*remaining/64)`;
the counter decreases after producing the sample. Distance attenuation follows
interpolation. A new temporary light interrupts a return immediately.

The pod burst uses its retail boss owner identity. The browser now runs this
transition state. Its initial zero-additive-RGB destination has been replaced
by the authored base light in the follow-up below. Retail normal shading is
still approximate. Resetting the light pool
also resets the owner, snapshot and counter. Rendering alone never ages it.

The light probe verifies first/mid/final samples, interruption and owner retention.
Chromium verifies peak/first-return pixels match, midpoint dims, and completion
restores base pixels. The full encounter verifies six return transitions finish
before the final phase, then passes victory and selector cleanup.

### Authored base character light (2026-09-13)

Reserved slot 0 now reads the user's executable at `0050387c + level*20`
for levels 1..15. The first three signed words become X/Y/Z offsets after
shifting left four; packed RGB comes from +16. The +12 word is not consumed
by this path. At each tick the offset is added to (Buzz.x, Buzz.y-8192, Buzz.z).
`0049f350` initializes RGB and owner 0; `0049eee0` moves the source with Buzz.
Unlike temporary lights, the base light is a fallback rather than a distance
candidate. It still receives the final distance attenuation.

The host loads the profile on spawn and preserves it when resetting temporary
lights on respawn. Level exit removes the profile. The 64-tick burst return now
restores the authored offset and colour. The parser validates level/buffer
bounds and supports sliced byte arrays; no table or assets ship in the build.
All 15 records were read from the local executable. The character-light probe
checks signed direction, colour, tracking and reset; Chromium checks reserved
RGB pixels and the full six-wave return to level 9's base light.

The queued level-script sources and level 3's dynamic slot-0 override are now
connected below. Remaining: retail normal shading and the other temporary-light callers. The
renderer still adds light to existing vertex colours using posed triangle
normals, so this is not a claim of complete retail lighting parity.

### Level 10 scripted lamp light (2026-09-13)

`00425f60..004260d0` now supplies reserved slot 1 from path 13. Each point
shifts left five into game units. Camera-minus-point components shift right
eight, with squared distance strictly below 1,000,000 required before considering
the point. Among those candidates the nearest to (Buzz.x, Buzz.y-8192, Buzz.z)
wins; the script shifts player-minus-point components and requires squared
distance strictly below 65536. Equal distances retain the first point. RGB is
(255,255,255); point identity substitutes for the retail path-point address.

Reserved slot 1 is enabled by the script, not aged as a temporary light. The
shared selector compares its distance with temporary sources; a temporary source
must be strictly closer to replace it. Entry and return use the existing
64-tick reserved-light blend. Disabling the slot retains its old sample for
the transition back to slot 0. Spawn/respawn/exit reset it with the pool.
The lens flare remains a separate source with its own visibility rules.

`tools/scripted-light-probe.ts` covers source selection, strict cutoffs, ties,
reserved lifetime and temporary competition. The path variant of
`tools/lens-flare-flow-check.js` visits an authored level 10 lamp, checks the
settled character-light state and redraw independence, verifies additive flare
pixels and exits cleanly to the selector. Subsequent scripted sources are covered below.

### Level 5 and 11 scripted lamps (2026-09-13)

The shared path selector now also connects level 5 path 17, RGB (128,96,64)
(`0041fd41..0041fea3`), and level 11 path 19, RGB (127,127,127)
(`0042ad4d..0042aeb9`). Both use the same strict camera/player distance gates
and first-point tie rule as level 10. These character-light colours differ
from their screen-flare colours and remain separate.

Level 11 camera zone 4 jumps past both assignment and disabling of reserved
slot 1. The host therefore retains the old source there; it does not clear it
as the flare renderer clears its sprites. Outside that zone, missing or
out-of-range path points disable the source normally. The probe covers this
distinction and each level's path/RGB mapping. The browser lamp check accepts
`lightLevel=5` or `11` with `flares=paths`, using the shared scene mapping
(level 11 is `level01/level1`). Character shading remains approximate.

### Level 12 and 13 scripted lamps (2026-09-14)

Level 12 path 0 supplies white RGB (255,255,255), from
`0042b3b1..0042b528`. Level 13 path 10 supplies RGB (111,127,143), from
`0042d241..0042d3ae`. Both now use the shared reserved-slot selector: camera
distance strictly below 1,000,000, Buzz-head distance strictly below 65536,
signed component shifts, and the first point on equal distances. Missing or
rejected points disable the source. Level 13's character tint is distinct from
its flare colour (48,64,80). Scene mapping is `level02/level1` for level 12
and `level03/level1` for level 13. The probe and browser lamp harness cover
both mappings; the other special sources are covered below.

### Level 4 flickering character lamps (2026-09-14)

The path-6 source now shares the existing simulation flicker intensity with
the character-light selector (`0041d916..0041dab6`). For intensity 1..64,
RGB is (2i,2i,0); for 65..128 it is (128,128,2i-128). Camera/player range
gates and nearest selection match the other path lamps. At intensity zero,
`0041d918` jumps past both assignment and disabling, retaining the previous
reserved light. Nonzero intensity with no eligible point disables it normally.
No second timer or random stream is introduced.

The scripted-light probe covers ramp boundaries, zero retention and rejected
points. The flicker browser check visits an authored lamp and checks colour
synchronization, respawn reset, pause and selector cleanup. Shading remains the
documented approximation.

### Level 3, 14 and 15 special character lights (2026-09-14)

All three remaining queued sources are connected. Level 14's path 40
(`0042f0e7..0042f2ff`) selects points 0..15 inside a squared X/Z radius of
`0x8e5144`, using Buzz's coordinates shifted right eight. At or outside that
boundary it selects points 16 onward. Inner lamps are RGB (255,255,0); outer
lamps are (0,255,255). Camera squared distance must be strictly below
`0x40000`. Level 15 path 0 (`00430736..00430908`) instead uses a strict
`0x100000` camera gate and RGB (255,0,0) for point 2, white for every other
point. Both retain the shared strict head-distance gate of 65536, first-point
ties, stable original point identities and reserved-slot transitions.

Level 3 (`0041b4ae..0041b5c2`) supplies green RGB (0,255,0) from the first
live kind-0x3f projectile in pool order, including life 1. Its owner is -3;
no live blob disables slot 1. The base light retains authored RGB (192,192,0)
while its direction updates toward game point (13453,-210651,-12501), distinct
from the fixed flare position. The vector from Buzz's feet shifts right seven,
normalizes to 4096 with truncation (`00451fd0`), shifts right two and then left
four for the shared base-light host. Floating-point normalization and posed
triangle-normal shading remain approximations of the retail renderer.

`tools/special-light-probe.ts` checks radial/index boundaries, colours, strict
camera gates, normalization, first-live-blob selection and return blending.
The browser harness with `flares=paths&lightLevel=14` or `15` visits both
colour groups and checks settled transitions and redraw independence. Its
`slimeLight&cleanup` variant observes a natural boss projectile, verifies the
moving base source and resets the light pool. All three scenarios also verify
additive flare pixels and clean exits to the level selector. Shared lighting
probes and the full slime combat regression pass.

### Pod beam impact character lights (2026-09-14)

Regular ZPOD and level 9 boss beam endpoints now feed the temporary light
pool directly. Calls at `0040685e` and `0042535d` both pass RGB (0,192,0),
lifetime 16 and owner -2, gated by the global 32-tick divider. The previous
host queued an unused RGB (0,128,0) request without lifetime or ownership.
The new source uses the shared range culling, immediate temporary selection,
attenuation and 64-tick reserved return; the endpoint flare stays separate.

The pod-beam probe covers the emission gate, lifetime, owner, attenuated
colour and expiry transition. Browser checks exercise both authored attacks,
verify a live green source selected for Buzz, and ensure drawing does not age
it. The boss check also covers six helper waves, orange burst competition,
death and selector return. Effect-death and other temporary-light callers
remain open, along with exact retail normal shading.

### Effect-death character lights (2026-09-14)

Death hooks 3 and 8 (`00410c4d`, `00410e28`) now emit RGB (160,0,0)
for 24 ticks at `(x, y + height*32, z)`. Their owner is the effect's stable
pool-record identity. Hook 5 (`00410d13`) emits RGB (96,64,0) for 16 ticks
at the effect origin. Its owner is deliberately the X coordinate: the retail
routine overwrites ESI with X before passing it as the owner. This preserves
the shared selector's same-owner behavior, including coordinate collisions.

Previously these hooks produced unused requests without lifetime/owner, and
the red requests used the wrong height. A separate temporary-light queue now
captures each request and the host drains it after the effect tick. It uses
the existing four-slot allocation, attenuation and reserved return blending.
Screen glows remain on their existing rendering path. Range culling suppresses
death lights just as it suppresses the rest of the death hook.

The effect-light probe checks all three hooks, positions, identities, colours,
lifetimes, one-shot emission, range removal and fade-back. Hooks 3 and 8 use
authored templates; no supplied template selects hook 5, so that hook is
invoked explicitly in tests. The framebuffer check runs the effect simulation
and verifies red/amber pixels and full fade-back on a synthetic triangle.
Disk/flare regressions and the full pod-boss browser encounter also pass.
Creature-death and other temporary-light call sites still need auditing;
exact retail normal shading remains open.

### Ordinary creature-death flashes (2026-09-14)

The positive-burst branch of `00405d20`, calling `0049ee50` at `00405f57`,
now carries RGB (240,128,0), life 32 and stable entity ownership with the
death event. The source is the creature position plus its hit-shape X/Y/Z
offsets (`00405ee1..00405f03`), not the model origin. Slot identity uses the
retail record base `0x52c840` and stride `0x9c`. The host allocates directly
into the temporary pool before processing effect updates, replacing a request
that previously vanished when the effect output list cleared.

The existing positive-burst type mapping controls emission. Spark-only and
nonburst deaths emit no orange light; repeated death notifications and removal
without the death-effect bit do not replay it. The unit probe covers these
branches, distinct owners, offsets, attenuation and expiry. The level 4 pod
browser check kills an authored creature and verifies the source, selection,
redraw/pause stability and selector cleanup. The full six-wave pod-boss
encounter passes with helper-death flashes enabled. This change does not
claim a fresh audit of every per-type death animation or burst mapping.

Temporary-light call-site checklist: the local executable contains 15 direct
calls to `0049ee50`. Seven are connected: `00405f57`, `0040685e`, `00410c4d`,
`00410d13`, `00410e28`, `00424faf`, `0042535d`. `004104be` now has its pickup
collection caller connected below; its other callers remain open. Seven still
need their trigger/position/owner paths traced and connected: `00410a70`,
`00416c01`, `00420d12`, `00422885`, `00422a53`, `00422fc0`, `004271ae`.
Similar colours do not establish equivalent callers. Reserved lights are
updated separately and are not part of this count.

### Pickup collection burst (2026-09-14)

`004a1252` calls the shared `00410410` burst before dispatching a touched
pickup's category, including hint signs. The host now does the same for pickup
events: five kind-0x29 particles in mode 15, scattered equally on X/Y/Z by
`((random & 63)-32) * ((reach & 127)+14)`. That spread draw advances three
random bytes; each particle then receives signed random spin and life 24..54.
The helper's `004104be` call emits RGB (96,64,0), life 16, at the pickup's
position shifted left five. X is the owner, matching the executable.

Light selection now runs once after pickup processing so the collection frame
includes the new light. Build and effect probes pass; the authored pickup
browser check verifies particles, source selection, redraw independence and
respawn reset. Other calls to this helper (pickup reappearance and level scripts)
remain pending. Earned-token reveals use the separate sequence below. The
separate `004109f0` red-burst helper at `00410a70` has no
direct call references in the disassembly; indirect use is not ruled out.

### Earned-token reveal sequence (2026-09-14)

Tracing `004a0db0` corrects the earlier assumption that earned-token reveals
use the amber pickup burst. Nonquiet reveals start a 132-tick timer. Crossing
100 emits sound 0x33 and sixteen kind-0x2b particles (`004a16e1..004a1776`).
Their signed directions come from sixteen triples at `005039c4`, divided by
four with truncation before the shared effect spawner; gravity is 32, rotation
zero and spin is a random byte minus 128. No character light is requested.

The object's uniform scale reads the old timer: hidden above 96, a table-driven
growth segment at 96..88 and a damped oscillation below 88. The last tick leaves
scale 4052/4096, matching the executable rather than rounding to one. The
profile reads the user's local executable, including the signed scale lookups
used by `004a1778..004a17e2`; it ships no table data. Quiet startup reveals stay
full-size and produce no ring. Repeated reveals do not restart the timer.

Dialogue rewards, task rewards and the paint reward now request the animated
sequence. Simulation advances it once per gameplay tick; drawing only applies
its current scale alongside the existing pickup rotation. The unit probe checks
local data, sliced buffers, bounds, quiet/repeated reveals and timer crossings.
The authored-token browser check observes sixteen particles at tick 32 and
checks redraw independence, pause, completion and reset. Camera framing remains
separate presentation work; idle sparkles are connected below.

### Idle-token sparkles (2026-09-14)

`004a0fa3..004a1082` emits one kind-0x29 particle in mode 9 per eligible
token on the shared 16-tick gate. It visits token slots 0..4 in order, skips
unrevealed/collected tokens and tokens whose saved bit is set, and requires
camera-minus-token deltas shifted right eight to have squared distance strictly
below `0x90000`. The PC helper `004cd110` always returns one, so it adds no
screen visibility gate. Existing effect rendering/culling still applies.

Each sparkle starts at the token position with spin random-byte minus 128
and lifetime `(random-byte & 15)*2+24`. It emits no point light. The host uses
the saved level bits as well as this visit's collection bits, and simulation
alone advances the gate. Tests cover signed range boundaries, slot ordering,
saved/hidden/collected exclusions and particle parameters. The token browser
check observes idle emission after the reveal finishes and verifies redraw
independence alongside reveal pause/reset behavior.
