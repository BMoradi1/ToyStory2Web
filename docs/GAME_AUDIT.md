# Whole-game parity audit

Reviewed 2026-10-05. This is the current audit index; older roadmap entries
may describe work that has since shipped. The first pass covers all 15 scenes,
their creature dispatch hooks, authored collision objects, existing task/prop
controllers, original level motion calls, and browser entry/exit. **It is not
a completed original-versus-port playthrough.**


## 2026-10-05 — All four timed collect-five challenges

Construction Yard, Alleys and Gullies, Al's Penthouse and Airport Infiltration
now hide their five category-9 items until acceptance. Dialogue closes before
the countdown starts; native clock values are 150/130/127/160, with failure
strictly below 100. Penthouse also fails outside camera rooms 1/4/8. Failure
hides the items, retry restores all five, and collecting the fifth still
requires returning to the giver before expiry. Restored the offer/completion
sound events and Penthouse's hurry cue, and connected the shared HUD clock.
Completed challenges cannot issue another reward while its reveal is pending.

`collect-five-probe.ts` checks all four installed sets through real pickup
collision, initial hiding, dialogue delay, full timeout including the zero
boundary, partial failure/retry, Penthouse's room rule and one-shot reward.
`collect-five-flow-check.js` passes actual NPC/item contacts, timeout, retry,
reward reveal, pause, restart and exit across all four worlds. Contacts use
protected teleports; this is not a natural timed-route playthrough. The shared
task divider still uses its existing level-local 64-tick phase rather than
the original global divider phase. Sources: 0041c190/0041e880/0042a130/0042ca60.

## 2026-10-05 — Shared rain and Alley weather

Extracted the existing native `0044ed90` drop pool into `rain.ts` and reused
it for Alley. Tarmac retains sprite 0x33; Alley uses its installed sprite
0x34/page 8. Both retain the 64-slot pool, four random bytes per new drop,
vertical speed adjustment, quota and camera-zone floor cap. Alley adds its
water-clipped eighth-tick ground splashes and above-water RainLoop event.

Shared/Alley probes pass pool, bounds, clipping, underwater rejection and
random-byte checks. Alley browser tests verify live installed-sprite cards,
RainLoop, water/emitter behavior and pause/restart/exit. The Tarmac weather
browser regression also passes rain cards, ground splashes, actual framebuffer
lightning, thunder, pause, restart and reentry. Build passes. Native global
fade-byte suppression of ambient audio and underwater camera tint/warp remain
unimplemented; this change does not claim complete presentation parity.

## 2026-10-05 — Alley water and environmental emitters

Connected `0041e880`'s water heights to player physics and shared liquid
effects: 0x10000 normally, 0x70000 strictly beyond Z 0xf329f. This restores
swimming gravity, entry splashes, ripples and bubbles through existing shared
controllers. Artwork 39/40/44/49/50 hides below the camera's water plane and
returns above it. Underwater camera tint/warp remains open; Alley rain is covered above.

Restored paired path-14 projectiles: advance two nodes before emission, use
the next point for velocity, force lifetime 128, then wait 20 ticks (21 ticks
between emissions). Room 2's kind-93 emitter uses the camera zone and shared
32-tick gate, with five active counts per eleven-gate cycle. Both raise event
0xa4 only after a successful spawn.

Installed probes cover all nine path pairs, cadence, successful/culled sound
gates, strict water boundaries, swimming gravity, shared splash entry and
underwater artwork. Browser checks observe live projectiles, room-2 effects,
audio, both water branches and pause/restart/exit. The second height is tested
at a protected out-of-route position with the stale fall-out flag cleared;
this is not natural traversal evidence. All eight real collision platform
landing/riding probes still pass with water enabled. Build passes.

## 2026-10-05 — Alley bridge and distant crates

Restored the bridge gate in `0041e880`: push block 2's nonzero run disables
collision 18, enables collision 19, stops the push and starts the bridge's
accelerating quarter-turn. Block 1's run stays reset until activation. The
finish hides artwork 41/42 and emits twenty randomized kind-13 debris
particles with events 0x34/0x3a. Three pushable props now update their native
distant artwork partners: 14→15, 0→1 and 51→52.

The installed probe checks real collision sweeps before/after the swap,
crate gates, one-shot completion and restored geometry. Browser tests use
actual push input for the bridge and all three visible crates, verify debris,
sound and near/far transforms, and pass pause/restart/exit. A release frame
between teleports is required to avoid carrying the previous test's held
crate into the next test. All Alley controller probes, the production build
and the 15-level selector/lifecycle regression pass. Natural bridge crossing
and full original-versus-port visual comparison remain unverified.

## 2026-10-05 — Alley bubble machine and moving attachments

Restored `0041e880`'s ground-pound machine: collision-4 switch compression,
guide 0, motor ramp, oscillating head, rotor and paired bubble artwork. The
first bubble grows before activation; the active machine starts subsequent
bubbles in alternating windows. Both grow, oscillate vertically, accelerate
sideways, pop and reset with their original sound events and near/far shifts.

Bubble poles use `00414600`'s stored height: moving the top changes the bottom
by that height. Acquisition gates follow growth, height and coyote state;
attached Buzz follows the moving bubble, stays attached while new grabs are
disabled, and releases on the reset tick after a pop. Restart restores both
pole records and the compressed switch hull.

Installed probes cover idle/active cycles, growth, emission/pop/recycle,
attachment acquisition/carry/release and restoration. Browser checks use an
actual ground pound and actual pole acquisition, ride a bubble for over 60
ticks until it pops/releases Buzz, observe both bubbles recycle, compare all
nine artwork transforms, and verify pause/restart/exit. Build passes. Tests
reposition Buzz to the switch and bubble; a complete natural route and exact
native camera comparison remain open. Dynamic motor pitch is not yet ported.

## 2026-10-05 — Alley seesaws and spring

Restored collision 1/2's weight-responsive tilt using `0049ec00`: side of the
pivot, radial distance and pre-landing vertical speed determine the force;
friction, unoccupied recentering, ±1792 raw-angle limits and 3/4 rebound follow
the original. Near/far artwork 4–7 shares the resulting angles. Floor and
ledge passengers rotate with the collision. Collision 3 launches normal
landings at -2432 and ground pounds at -3072, consumes guide 1 and plays 0x1c.
`00434090` leaves normal air control in place.

Installed probes cover both seesaws in both directions, landing force, limit
rebound, ledge handling and restored geometry, plus actual collision-driven
normal/stomp spring landings. Browser tests trigger both seesaws through real
landings, check paired artwork, both spring impulses/sound, pause, restart and
exit. Build passes. Full natural traversal and exact original camera framing
remain unverified. The bubble machine and bridge remain separate audit work.

## 2026-10-05 — Alleys and Gullies lane platforms

Restored eight platforms from `0041e390/0041e150/0041e020`: collision 5–12,
authored paths 0/5/2/3, initial 0/60-node spacing, separate lane speeds and
12 artwork objects. The shared helper's signed-X advance condition is verified
against `0041e204` (JGE); it is deliberately not a distance threshold. Each
pair freezes its next velocity while either ledge is held. Platforms carry
standing passengers, leave airborne Buzz independent and recycle at the
native path limit. Reset restores original collision geometry before rebuilding.

The installed probe covers 6,000 ticks/full cycles on all eight paths, speed
bounds, interpolation, paired ledge freeze, carry and restoration. Physical
collision checks land and ride all eight for over 100 ticks. The browser
checks full cycles, all 12 artwork offsets, pause, restart, exit and reentry.
Build passes. Tests position/protect Buzz; water interactions and an unassisted
crossing remain unverified. The level's seesaws, bubble machine, spring,
bridge and remaining effects are separate open audit items.

## 2026-10-05 — Elevator Hop rescue poses

Restored `004259b0`'s placement-selected orientation: slots 1/2/5 set model
pitch to 0xc00 and roll to 0x800 when placement acceleration is below 128.
Slots 3/4 and speakers 0/22 remain upright. The shared creature renderer now
accepts the previously omitted X rotation, with zero preserving other models.
The installed-record probe and browser checks cover all seven placements,
rendered angles, pause, restart and exit. Build passes. Exact visual comparison
against the original camera remains unverified.

## 2026-10-05 — Rescue ambience, duck effects and missing hit geometry

Replaced the shared rescue chirp with the ten native handlers' separate idle
sounds, intervals and health gates. Andy's House and Tarmac remain silent
while idle. Neighborhood ducks use the shared 32-tick chance and their
visibility-gated kind-121 emission, including native random-byte consumption,
velocity, gravity, spin and sound-on-success behavior. Pickup still produces
one rescue count/burst and its level's cue without enemy death rewards.

The browser audit exposed a shared loading bug: models without a trailing
hit-shape group were marked unloaded. `0043b9b0` actually supplies a default
sphere and ellipsoid before optional model-specific geometry replaces them.
Restoring that fallback makes all five Construction Yard LTYKE rescues active
and collectible, and prevents the same error for other loaded models.

Validation: installed-model probe covers 62 available configured models and
362 placements across 15 levels, including actual LTYKE contact. Rescue probes
cover all ten handlers, timing, health, random consumption and particle motion.
All ten rescue levels pass browser idle/collection/restart/exit checks;
neighborhood particles are observed in the live effect pool. The 15-level
entry/exit regression and production build pass. Browser tests reposition Buzz
and dismiss dialogue; they do not constitute full mission playthroughs.
Elevator Hop's special rescue orientation is covered by the follow-up above.
Still open: exact native ordering between deferred emissions and other users of the random stream.

## 2026-10-04 — Toy Barn hoops and first-fetch bounce

Restored slots 10/11's level-owned hoop rules from `00421340`: the native
unsigned X minimum, signed Z minimum, crate-dependent side/corner limits and
-2304 Z reversal. A hoop must have been visible before crossing the lane end
or disappearing can recycle it. Nearby recycling uses removal without death
rewards; distant recycling zeros health. Both retain their installed respawn
intervals. Also restored the first fetch completion's one-shot -1536 bounce.

`toy-barn-hoops-probe.ts` verifies installed bounds, strict corner equality,
reversal, seen/unseen behavior, reward-free recycling and shared respawn.
The browser checks real model visibility, disappearance/reappearance, boundary
positions after normal movement, pause, restart and exit, without injecting
hoop health or flags. The fetch browser test now collects its first objective
through actual contact, verifies the bounce, then completes timeout, retry and
second-run token collection. Build passes. Tests reposition/protect Buzz;
unassisted crate/hoop traversal and exact camera comparison remain open.

## 2026-10-04 — Toy Barn timed stomp cannon

Restored switch collision 15/art 33 and cannon collision 0/art 0/1 from
`00421340`. A stomp starts 2700 ticks, presses the switch and retires guide 0.
Motor speed ramps to 512, then coasts down after expiry; the phase drives
vertical motion and roll. Landing on the active cannon launches Buzz at yaw
`0xb90`, vertical impulse -3072 and sine/cosine velocity divided by 7, with
recoil and recovery. Near/far art uses native 32/128-unit quantization.
Crossing Z `-0x11202` ends the timer and restores the button immediately.
The HUD uses the cannon's 60-tick clock; an active fetch blocks its switch,
and the fetch task cannot claim the timed slot while the cannon is active.

`toy-barn-cannon-probe.ts` checks the full countdown, spin up/down, fetch gate,
collision/art motion, launch/recoil/recovery, early termination and restoration.
It also physically stomps the installed switch and lands on the moving cannon.
The browser check passes those physical triggers, controller clock, rendered
poses, pause, region exit, the subsequent real NPC offer, restart and exit.
The NPC is outside the cannon region, so reaching him first ends its timer;
the synthetic task probe separately verifies the shared-slot exclusion rule.
Build passes. Dynamic pitch, full destination traversal and exact launch
camera/input-lock parity remain open.

## 2026-10-04 — Toy Barn fetch failure and retry

Fixed three shared-fetch state rules against `00421340`: the offer stays in
phase 1 until its dialogue closes, first completion requires the watched
creature's health zero (not the dying 999 sentinel), and second-run failure
withdraws the uncollected slot-2 token, clears the task bit and cancels its
reveal. This closes the timeout-reward gap identified in the barrier pass.
A collected reward takes precedence over the failure-zone test.

`toy-barn-fetch-probe.ts` checks both offers, dialogue-held clocks, death
sentinel, full deadline and forbidden-zone failures, token/reveal withdrawal,
retry and success using installed creatures/pickups. The expanded barrier
browser regression passes withdrawal after an actual deadline, a new offer,
actual token collection, both barrier completion states and lifecycle cleanup.
Tarmac timed-path and Space Land saucer probes still pass; build passes.
Later entries above cover the first-stage bounce and shared cannon-timer
interaction.

## 2026-10-04 — Toy Barn timed-fetch barrier

Restored collision 18/art 31 from `00421340`: starting a fetch run raises
artwork 16384 game units in 512-unit steps. Collision is disabled as soon as
height leaves zero and restored only once fully closed. First-run completion
and either timeout close it; second-run success leaves the height target open.
The init call `0043d9d0(19,18)` is a PC no-op (`ret`), so it does not justify
an inferred portal or collision replacement.

`toy-barn-barrier-probe.ts` verifies actual sphere sweeps against the installed
hull, opening/closing timing, both success states and restoration. The browser
check follows NPC offers/dialogue, injected first objective removal, a full
second-run timeout, retry, actual token collection, rendered motion, pause,
restart and exit. Build passes. It positions Buzz for NPC/token contacts;
unassisted challenge traversal remains open. This pass identified the second-run timeout reward gap; the later fetch
failure/retry entry above records its fix.

## 2026-10-04 — Toy Barn boarding rides

Restored collision 10/art 11's accelerating, bouncing one-way ride and
collision 14/art 24's returning ride from `00421340`. Real floor contact
starts each ride, retires its guide and starts motor sound `0x7a`. At the
far end, a rider receives vertical impulse -2560 and yaw `0x81e`, with the
ride-specific horizontal velocity. The return ride reverses at seven-eighths
speed and decelerates after its return threshold; it does not snap to its
initial position. Artwork follows quantized collision position, including the
second ride's initial difference between authored artwork and collision pivot.

`toy-barn-launch-platforms-probe.ts` checks full routes, acceleration/bounce,
launch/return, contact gates, carry, collision and restoration. It also
physically boards and rides both installed hulls to their final launches.
The browser check passes those complete physical rides without injected
contacts, rendered alignment, pause, return/deceleration, restart and exit.
Build passes. Tests position Buzz above each starting platform; reaching the
platforms and destinations unaided, dynamic motor pitch and exact retail
launch camera/input-lock timing remain unverified.

## 2026-10-04 — Toy Barn spring launchers

Restored surface 8's stomp-only launcher and surface 9's bounce pad from
`00421340`. The first launches four ticks after the impact, with vertical
impulse -3072, yaw `0x81e`, and horizontal sine/cosine velocity divided by 8.
The second launches immediately at -2432, or -3072 after a stomp, while
preserving air steering. Artwork 2/30 follows the delayed spring timer;
artwork 3 uses the native signed, decaying sine scale. Absolute native scale
writes compensate for object 30's non-unit authored scale.

`toy-barn-springs-probe.ts` physically lands/stomps on both installed collision
surfaces, verifies trigger timing/impulses, ordinary landing rejection on the
first spring, guide/sound, animation decay and scale. The browser check passes
all three launch cases, rendered poses, pause, restart and exit. Build passes.
Full destination traversal and the original launch camera/input-lock timing
remain unverified.

## 2026-10-04 — Toy Barn path effects

Restored `00421340`'s two emitters on the shared 64-tick divider. Path 6
advances before spawning kind 86 with spawn mode 25, floor zero and sound
`0x74`. Path 7 selects one of six points using `(byte & 7)` with 6/7 mapped
to 0/1, then spawns kind 80 with spawn mode 24 and caller-selected quarter-turn
rotation. Both preserve strict XZ activation bounds and the original random
consumption when a spawn is culled. Spawn modes configure initial velocity;
the installed templates still supply their own ongoing behavior modes.

`toy-barn-effects-probe.ts` verifies every path point, wrap/random/boundary
rules, divider timing, sound/floor/rotation and installed effect animation.
`toy-barn-effects-flow-check.js` verifies both regions' live sprites in their
level texture batches, sound, pause, restart and exit. The disk-lock browser
regression still passes with these emitters active; all 15 levels also pass
load, short simulation and exit. Production build passes. Exact retail camera
framing, global divider phase and natural traversal through the effects remain
unverified.

## 2026-10-04 — Toy Barn disk-gated locks

Resolved `00882968` as the six shared disk permits. `00421340` sets lock
slots 7–9 to vulnerability 4 when no disk is active, and 5 while a disk is
in flight. Restored this rule before the platform scripts and creature update.
Installed-data checks use real spin damage: closed locks reject it, open locks
enter health 999/death animation, and the shared death timer reaches health
zero, which releases their platform. Other creatures' masks stay unchanged.

`toy-barn-guards-flow-check.js` collects and fires real disk ammo, observes
all three locks opening, injects the three spin hits, follows their authored
deaths and checks platform activation, disk expiry, restart and exit. Build
passes. This verifies the combat gate and death handoff, not an unassisted
three-lock traversal or naturally landed attacks.

## 2026-10-04 — Toy Barn rotating machinery

Restored collision objects 1–4 and art 7/6/4/5 from `00421340`, with native
raw angular velocities 36/44/36/44 (9/11/9/11 artwork angle units per tick).
Collision vertices and normals rotate from captured rest geometry; grounded
and attached-ledge passengers move about the pivot. Pause freezes rotation,
and restart restores the original collision hulls before rebuilding controllers.

`toy-barn-rotors-probe.ts` checks all vertices/normals through 4096 ticks,
exact speeds/wrap, standing and ledge carry, airborne isolation and restoration.
The extended Toy Barn browser regression passes rendered rotation/rates,
pause/restart/exit alongside the six scripted platforms and two real crate
pushes. Build passes. Sustained natural traversal on these thin rotating rims
is **not verified**: a centroid-drop experiment produced only 0–2 contact ticks
before Buzz slipped off. The carry test uses explicit contact states; it does
not close this traversal gap or prove original-game behavior on the rims.

## 2026-10-04 — Toy Barn distant crate models

Connected push-crate art 8/9 to far models 21/22, matching `00421340`'s
128-game-unit position quantization. The shared push renderer already owns
movement, separation and reset, so this restores the missing level mapping.
The extended Toy Barn browser check physically pushes both crates, verifies
far-model displacement and restart restoration, then reruns all six scripted
platform cycles and lifecycle checks. Production build passes.

## 2026-10-04 — Toy Barn scripted platforms

Restored all six `0048acc0` platforms from the installed scripts at
`0xf294c..0xf2a00`: collision 7–9/art 15–17 run continuously; collision
13/12/11 and art 12–14 begin only when creature slots 7/8/9 have health zero.
The latter start extended by 790 level units while retaining the original
script target origin. Near artwork and far objects 18–20 follow the moving
hulls with the native 32/128-game-unit position quantization.

`toy-barn-platforms-probe.ts` checks complete out/back/wait cycles, exact
health gating, initial extension, near/far poses, standing and climbing carry,
airborne isolation, restart restoration, and actual collision-solver landing
and riding on all six hulls. `toy-barn-platforms-flow-check.js` passes full
cycles, injected enemy defeats, rendered alignment, pause, restart and exit.
Production build passes. Natural combat to release the three platforms and
full traversal routes remain unverified; other Toy Barn machinery remains
open. The preceding all-15-level browser load/simulate/exit check also passed.

## 2026-10-04 — Space Land buggy projectile model

Connected mode `0x31` to scene object 25 (`004124ba..004124f3`): the live
kind-114 record supplies quantized position, yaw plus 1024 and pitch as model
roll. The last live effect-pool slot wins if hazards overlap; the level's
original off-world position hides the model when none remain. Restart restores
that idle pose. Also corrected the exhaust's XZ velocity: the caller halves
it before `spawnEffect` halves it again, giving quarter rather than half speed.

Installed-data checks verify negative-coordinate rounding, orientation, pool
ordering, expiry/reset and positive/negative exhaust velocities. The full buggy
browser flow now verifies the model's rendered position/orientation during a
natural attack, alongside intro, lasers, hit recovery, defeat, reward/save,
pause and restart/exit. The production build and buggy probe pass. Exact
retail framing and one-frame death/render ordering remain unverified.

## 2026-10-04 — Space Land rocking block and distant crates

Resolved `0053c6e6` as push-block 2's `tipPoint` (base `0053c680`, 40-byte
stride, offset `0x16`). The room-4 rocking object 19 now pitches until Buzz
lands within its strict XZ/height trigger, then starts the existing push-block
slide/drop with `tipPoint = -1` and stops rocking. This keeps its artwork and
collision on the same shared path controller. Added the native far copies:
object 17 follows block art 0, and object 18 follows art 15 with arithmetic
128-game-unit coordinate quantization (`004241b1..00424206`).

Installed-data tests physically land Buzz on collision 4, complete the block's
slide/drop, check its moving hull and one-shot/boundary rules. Browser checks
physically push both other crates and compare far-art displacement, then land
on the rocking block and follow its whole fall; pause/restart/exit pass.
Production build passes. Exact global-byte rocking phase alignment and natural
passenger traversal during the drop remain unverified.

## 2026-10-04 — Space Land ball pit

Added the type-3 volume from `00423f29..00423ff2`: strict XZ bounds and surface
`-0x8200`, slow shared movement, 64/tick sinking cap and shallow escape jump.
The movement code now distinguishes water, mud and balls, while types 2/3
share their native movement overrides. Forward speed above 32 or absolute
vertical speed above 32 scatters kind-95 balls on the four-tick gate, with
colours read from the installed executable. Type 3 does not inherit water
splashes, bubbles, mud droplets or wet footprints.

Installed-data checks cover volume/depth boundaries, movement/jump/exit,
scatter speed/cadence/colour and culled random-byte consumption. The browser
verifies slow movement, sinking, rendered scatter, escape jump and lifecycle.
Shared player checks (24/24), water/mud probes and both existing liquid browser
flows pass, as does the production build. Native model clipping at the ball
surface and natural traversal remain unimplemented/unverified.

## 2026-10-04 — Space Land projectile volley

Restored `00423ff2..004241b1`: room 2 and strict X gating, 200 active ticks
before a volley, one path-16 emitter per sixteen-tick gate, then a fresh delay
after all nine positions. Only nearby 3D emitters fire. The original integer
ballistic calculation feeds kind 96 with gravity 128 and sound 13; a
coincident-XZ guard avoids the original division by zero.

The installed-data probe exercises every emitter and follows the executable's
real effect templates through player collision/damage. Browser checks confirm
the initial delay, live projectile rendering and launch sounds, frozen timers
outside the region and while paused, plus restart/exit cleanup. Production
build passes. Natural avoidance and retail visual trajectory comparison remain
unverified.

## 2026-10-04 — Space Land paired laser displays

Ported `00422d20` and its strict XZ activation box. The two emitters traverse
paired paths 14/15 using the original 8–15 tick periods and random node steps,
retarget Buzz only below the height threshold and within the 3D aim radius,
and draw retracting red/cyan sprite-9 strips. New targets emit five kind-4
sparks with authored lifetime randomization, sound 7 and red/cyan temporary
character lights. Damage is restricted to the new-target tick and the original
25-unit downshifted sphere. Outside the box, beams disappear and timers hold.

Installed-data checks cover gates, targeting/damage, geometry/retraction,
colour, node wrap, event cadence and random-byte consumption even when effects
are culled. Browser checks see both rendered beam colours, light flashes and
actual player-health loss, then verify region exit, pause, restart and level
exit. Claw and saucer browser regressions and the production build pass.
Natural avoidance along the complete route remains unverified.

## 2026-10-04 — Space Land saucer challenge

Replaced the finish-box-only placeholder with `00423303..004235db`: slot 1
follows path 13 with 16/tick acceleration capped at 3000, fixed-point segment
interpolation, vertical bob and engine sound. Dialogue holds the race clock;
acceptance hides the saucer and the path endpoint restores it. The strict
finish/start boxes and height cutoff are gated by player `+0x9c` (coyote),
not the grounded flag. Missing the deadline or landing outside the permitted
area fails; leaving the saucer's near radius retires it through the shared
respawn mechanism so the challenge can be offered again. A win awards slot 2
once and the saucer continues its route.

Installed-data tests cover the full deadline, acceleration, dialogue hold,
height/X/Z boundaries, airborne versus coyote-state results, post-win movement
and actual shared-creature respawn. Browser checks accept the real dialogue,
run a complete losing race, retry, then land on authored finish collision to
reveal the reward; pause/restart/exit pass. Production build and buggy task
regression pass. The browser uses positioning for route setup; unassisted
zip-line traversal, dynamic engine pitch and original race music switching
remain unverified/unimplemented.

## 2026-10-04 — Space Land scenery and display sounds

Restored eight hanging toys (objects 2–9) with independently integrated sine
rotation, plus room-4 displays 20–23 with their authored X/Y oscillation,
original sound choices, source positions and randomized delay. Leaving room 4
freezes its display positions and sound timer; hanging toys continue globally.
The page-5 claw-room texture now observes that same native room gate, while
Mother's independent visibility-gated page-18 strip continues normally.

Installed-data checks cover complete sine periods, unchanged authored pitch/
roll, all motion axes/amplitudes, random-byte consumption and sound timing.
Browser checks verify rendered transforms, room/texture gating, pause and
restart/exit; the real three-stomp claw/token browser regression also passes
with the additional random-stream consumers. All seven texture-level probes
and the production build pass. Object 19's activation behavior, other moving
machinery and the saucer course remain separate audit work.

## 2026-10-04 — Space Land claw machine

Restored `00423640..00423bca`: surface-8 ground pounds advance X travel,
Z travel, then lowering. The 60-tick button lockout, mirrored tracks, delayed
claw closure, strict grab radius, missed-grab retry, successful return to the
chute, gravity/bounce delivery, guide retirement and original motor/claw sound
events now run in room 4. Pickup 53 follows the moving prize, including its
restricted reach inside the machine and full reach after release. Restart and
level exit reset the controller and both button/claw art variants.

The installed-data probe uses a real player/collision ground pound and checks
both grab outcomes through collection. The browser check times three real
ground pounds, verifies artwork offsets throughout delivery, collects the
token, and checks pause/restart/exit. Production build passes. Dynamic motor
pitch and the original projected claw shadow remain unimplemented; natural
player traversal to the machine has not been compared against retail.

## 2026-10-04 — Shared mover flag operand width

Corrected the movement interpreter's wait/set/clear masks to unsigned 16-bit
operands, matching `0048acc0`. Script storage is signed for movement offsets;
reusing that signed value for `0x8000` flags incorrectly treated unrelated
upper-word bits as part of the mask. The regression reproduces the false
wait completion and verifies all four flag opcodes preserve unrelated bits.
Installed shuttle and linked-lift cycles still pass; production build passes.

## 2026-10-04 — Space Land Mother texture animation

- Identified `0052c9b8 & 1` as entity slot 2's visible flag: runtime entity
  base `0052c840`, stride `0x9c`, flags offset `0x40`. The installed slot is
  MOTHER. Unlike the Construction portal table, this call really is a
  texture-region scroll (`00424206..0042422c`, calling `0049b260`).
- Added the gated page-18 strip (destination 64/0, size 20×64, source offset
  20/0) alongside Space Land's existing page-5 scroll. Its byte-wrapped tick
  phase continues while hidden; the NPC visibility flag controls copying.
- Installed texture probe checks the gate, byte wrap, changing pixels and
  untouched surroundings. Browser checks actual visible/hidden NPC states,
  GPU texture updates, exact pixel bounds, pause/restart/exit. Build passes.
  Exact phase alignment against a retail capture remains unverified.

## 2026-10-04 — Construction Yard mud mechanics

- Added the native ground-level mud region, including strict X/Z edges and
  height gate. Shared liquid movement now supports type 2: slower running,
  slow sinking, shallow jumping and jump permission while sinking.
- Shared liquid effects select mud splash/droplet/ripple/footprint kinds,
  entry sound, timing gates and random consumption. Leaving the region marks
  Buzz's feet for 180 ticks; restart and exit clear the state. Water retains
  its original depth gate, movement, bubble and underwater ambience behavior.
- Installed mud probe and browser checks pass movement, particles/sound,
  escape jump, pause/restart/exit. Existing player checks pass 24/24; water
  movement/effects probes, Penthouse water browser regression and production
  build pass. Native liquid-surface
  model clipping and full surface-dependent footstep audio remain open.

## 2026-10-04 — Construction Yard stomp-selected lift

- Restored the three switches (collision 22–24/artwork 65–67) and their
  shared lift (collision 21/artwork 68) from `0041dac0..0041dd73`. Stomps
  pitch switches −384 angle units and retire guide points 4–6 once each.
- The highest pressed switch selects one of three upper thresholds. Native
  acceleration/braking (8 per tick, speed cap 1024), direction-bit changes,
  lower reversal threshold and stopping overshoot are retained. Hull and
  artwork move together; standing/climbing passengers receive translation.
- Installed probe uses real stomp collisions for all six activation orders
  and exercises complete lift cycles after each press, including all three
  height selections, precedence, bounds, guide retirement and collision
  restore. Browser verifies all switches, top-height round trip, artwork,
  guide state, pause/restart/exit. Lift/bridge regressions and build pass.
- Collision IDs 13/25 remain review leads. Natural route completion and
  exact retail crush/contact behavior are still unverified.

## 2026-10-04 — Construction Yard trailer portal gating

- Corrected the earlier interpretation of `0054f3bc`: it belongs to the
  renderer's room portal lists, not texture commands. The loader `0043e6e0`
  writes pairs of portal ID/destination at `0054f39c + room*32`; `0043f3d0`
  traverses them. No texture effect is implied by this native block.
- Restored the init-time reorder and proximity gate from `0041c190/0041c640`:
  room 1's trailer doorway comes last and is disabled while Buzz is far away;
  approaching also swaps the first two room-2 apertures without changing
  their destination bytes. Both zone updates and visibility walks use the
  active list, while parsed source data stays unchanged.
- Installed regression verifies actual portal-walk visibility, interior
  ordering and reset. Browser checks approach/departure, pause/restart/exit.
  Existing portal validation and production build pass. Global portal-culling
  preference is unchanged; this restores the level-specific portal graph.

## 2026-10-04 — Slime encounter regression unblocked

The recorded Slime Time probe failure came from adding the face-only and
body-only mesh sizes. Joint seams spanning those layers resolve only in the
combined pose, so that sum omitted 12 triangles (108 position components).
The probe now compares every paired animation frame with the complete
installed static model, asserts that cross-layer seams are added and checks
finite vertices. No production rendering change was needed. The full probe
now passes entrance, spit, jumps, all five combat stages, regrowth, defeat,
reward/victory timing and hit-geometry preservation. This remains a scripted
encounter check, not an unassisted fight.

## 2026-10-04 — Construction Yard proximity scenery

Restored the object-63/64 height animation at the start of `0041c640`:
strict 250-unit 3D proximity, eight-tick collapse and eight-tick restoration.
Installed probes cover all axes, diagonal exclusion, boundary and endpoint
clamps. Browser checks both artwork scales, repeated approaches, pause,
restart and exit; production build passes. The companion portal-list mutation is implemented in the entry above; the
earlier texture-command interpretation was incorrect.

## 2026-10-04 — Push-block distant artwork

The Construction Yard crate moved artwork 12 but left its distant copy 13
at its authored position. Shared push-block configuration now supports
follower artwork, with the original coordinate quantization for scaled
copies. Browser verification pushes the real crate, checks the distant
model follows, and checks pause/restart/exit. Existing physical push-block
regression and the production build pass.

## 2026-10-04 — Construction Yard linked lift assemblies

- Restored four path-4 lift routes from installed wordcode, including the
  shared flag-256 synchronization between the second and third lifts.
  Primary collision 1–4 and follower collision 7/8/9/6 move with the assemblies.
- Ported linked near/far platforms, undersides, overhead supports, lateral
  rails and stretching cables from `0041bee0`. Far coordinates retain the
  original integer shifts. Moving hulls carry passengers; ledge grabs pause
  route scripts. Tilt uses the recovered lever/landing-speed formula,
  damping, empty-platform restoring force and ±224-angle bounce limits.
- Installed probes cover all routes, synchronization, linked positions,
  ledge pause, tilt limits/landing force, airborne independence and restore.
  All four platforms also pass 180-tick physical landing/ride simulations
  using the real player solver without injected contacts or mover state.
  Browser checks all routes, flag changes, all 28 artwork transforms/cable
  scales, pause, restart and exit. Production build passes.
- Natural traversal, edge/crush response and retail visual comparison remain
  unverified; this is controller coverage, not a completed level playthrough.

## 2026-10-04 — Construction Yard scripted shuttles

- Restored all four shuttles (artwork 41–44, collision 14–17) using the
  installed movement wordcode and recovered shared interpreter `0048acc0`.
  Acceleration, braking, endpoint waits and random timing follow the scripts.
- Moving hulls carry standing/climbing passengers; artwork follows the same
  positions. Restart restores the captured collision and resets the scripts.
- Installed probes verify all four out/back/wait cycles, collision alignment,
  passenger versus airborne motion, exact restore and shared flag/wait timing.
  Browser checks all four cycles, artwork alignment, pause, restart and exit.
  Production build passes.
- The four connected tilting lift assemblies still need implementation.
  General crush/contact response remains shared mover behavior, not proven
  frame-for-frame retail parity. These checks are not a natural playthrough.

## 2026-10-04 — Construction Yard stomp drawbridge

- Restored surface-36 stomp activation, guide 3 retirement, lowering, hold,
  return and repeat activation from `0041c640`. Collision 26 and artwork 28/29
  follow the recovered angular speed and angle conversion; the small native
  lower-stop overshoot is retained.
- Moving collision carries standing/climbing passengers through the same roll;
  airborne Buzz remains independent. Restart restores the captured hull and
  initial near/far artwork angle. Start/stop and motor sounds use the original
  camera-relative sound position.
- Installed probe triggers through an actual stomp collision and checks cycle
  boundaries, passenger motion and exact hull restore. Browser checks real
  stomp activation, both artwork transforms, sound/guide, repeat use, pause,
  restart and exit. Rotating-floor regression and production build pass.
- Remaining Construction Yard scripted movers still require porting. General
  crush/contact response is the shared mover implementation, not a proven
  frame-for-frame reproduction of retail collision.

## 2026-10-04 — Rotating collision slope cache

`transformCollisionGroup` now recomputes walkability from the transformed
normal. Previously pitch/roll changed the geometry while ground queries kept
the rest pose's floor classification. The regression checks floor-to-wall and
wall-to-floor transitions through actual ground queries, plus yaw and restore.
Platform interaction and paint-can regressions and the build pass. This shared
fix prepares rotating-platform work; it does not itself add the drawbridge.

## 2026-10-04 — Construction Yard debris emitters

- Restored the rolling kind-67 emitter on path 0 and thrown kind-84 debris
  on path 1 (`0041cc00..0041cf79`). Both use the installed route coordinates,
  original range/height gates, random delays and spin, and shared effects.
- Rolling debris cycles eight endpoint pairs and receives the original stored
  axis velocity of ±384. Thrown debris randomly selects eight trajectories,
  with the recovered ballistic velocity and gravity 144 before pool scaling.
- Preserved the retail rolling loop's extra visit at the path count as an idle
  step; the port does not read the next path header as an out-of-bounds point.
  Degenerate throw pairs are skipped instead of dividing by zero.
- Installed probes pass every route and timing/gating boundary. Browser checks
  each rolling route on its emission tick, thrown debris, pause/restart/exit.
  Paint-can and jackhammer regressions and the production build pass.
  Remaining moving platforms and natural traversal still require review.

## 2026-10-03 — Construction Yard outdoor paint cans

- Restored all three lid controllers from `0041bc20`, with staggered start
  clocks 0/33/66 and cycle limits 300/327/349. Lids rise, hold at 51200 game
  units, accelerate down and bounce at one-quarter impact speed.
- Collision objects 10/12/11 switch on for the closed lid and off while open;
  their original spatial-index membership is restored before a restart.
  Artwork 36/37/38 and shadow copies 54/55/56 follow the lid positions.
- Strong impacts emit kind 25 plus eight randomized kind-66 particles, sound
  0x69 and distance-scaled camera shake. Reopening emits 0x6a. Controllers
  freeze beyond the original strict 1152-by-256-unit player distance.
- Installed probe passes all cycles, collision boundaries and exact restore.
  Browser checks all three lids, effects/sound, drawn transforms, distance
  freeze and pause/restart/exit. Existing stomp/paint-mixing probe and build
  pass. Remaining Construction Yard platforms and debris emitters stay open.

## 2026-10-03 — Kite tail physics and rendering

- Restored the 16-point chain (`0044e620/0044e710`): 4096-unit initial spacing,
  signed-short velocities, 30/32 damping, two-sided constraint correction,
  gravity 96 and the original local roof surface/edge response.
- The tail follows the animated kite attachment, freezes outside the camera's
  strict 800-by-256-unit range, falls after defeat and hides at reward phase 200.
- Restored `0044eb90` rendering: 15 red line segments with decreasing intensity
  and sixteen 140-by-140 bow cards from the level's sprite 51. No game artwork
  was added to the repository. The shared viewer clears the tail on restart/exit.
- Physics probe passes range, movement, signed velocity, roof and defeat
  boundaries. Neighborhood browser flow passes bent-chain geometry, all bow
  cards, pause, defeat/reward and exit cleanup. Visual inspection confirms the
  chain hangs from the kite and rests on the roof. Build passes.
- Coincident points use a downward fallback instead of the original undefined
  divide-by-zero result. PC line rasterization/antialiasing differs from WebGL.

## 2026-10-03 — Tarmac blacksmith presentation and cleanup

- Completed the split blacksmith controller's alternating hit flash and
  90-tick boss-bar hold/expiry. Defeat clears the pending axe timer immediately.
- The installed combat/attack probes and browser lifecycle regression pass,
  including rendered material brightness, actual axe release, reward,
  pause/restart and exit/re-entry. Production build passes.
- The static inventory now recognizes the composed Tarmac implementation in
  `creatures.ts` and `tasks.ts`. No named creature hook remains entirely absent;
  this does **not** establish complete game parity. Effects, scenery, special
  tasks and natural progression still need their independent checks below.

## 2026-10-03 — Space Land buggy fight

- Added the missing slot-40 boss task: grounded player-room-5 taunt, script
  wake-up, attack clocks and delayed slot-4 token. The final nine health points
  belong to the collapse script; waiting for generic creature removal could
  never complete this fight.
- Restored laser bursts, narrow player damage window, dropped kind-114 hazards,
  engine/skid sounds, paired tire smoke, hit protection/flash, arena camera
  focus, boss bar, collapse burst/light and broken-vehicle sparks.
- Original sources: `00422660` handler and `00423200` level tick. Laser clock
  starts at 600, resets below zero to 240, emits below 40 on the eight-tick gate;
  rear hazards reset below zero to 400. Defeat seeks script 35 word 34 while
  retaining the script wait. Reward advances phase 3 through 120, then 200.
- Installed-data probe and browser flow pass natural intro/attacks, injected-hit
  recovery/flash, defeat and token/save, plus pause/restart/exit. Build passes.
  This is not a full natural playthrough. Laser visuals use the shared beam
  renderer and wall clipping; incidental damage to other creatures is not yet
  reproduced. Dynamic engine pitch and other Space Land scenery/tasks remain
  open. At this checkpoint the inventory listed Tarmac SMITH as the remaining incomplete hook.

## 2026-10-03 — Neighborhood lawnmower and kite

- Restored lawnmower sound, visibility-gated ground marks and grass clippings,
  including two-/sixteen-tick dividers, original random-byte reuse, velocity,
  colour and rotation. Its level-owned update range follows Buzz's rectangle.
- Restored kite roll/bob, player-facing steering, dive/retreat behavior, height
  limits, health-change response, camera-look request and 10-health bar.
- Restored post-removal falling-tail particles and the delayed slot-4 reward.
  The segmented tail was restored in the follow-up above; moving scenery and
  the Neighborhood's full natural routes remain open.
- Applied the already-computed creature roll to drawn models. Previously the
  simulation/attachments leaned while creature meshes stayed upright.
- Installed-data probes pass emitter random/gate boundaries, flight branches,
  taunt/bar, falling tail and token timing. Browser checks pass mower effects,
  natural kite intro/movement/roll, injected-hit flash/defeat, token/save and
  pause/restart/exit. Production build, pod muzzle/lean probes and the three-level
  shared-enemy browser regression pass.

## 2026-10-03 — Emitter timing cross-check

A follow-up against the documented native divider and effect-record fields
corrected jackhammer debris to the 32-tick gate, jackhammer dust to lifetime
32, and dinosaur collapse smoke to lifetime 24..54. These are lifetime writes,
not animation-period writes. Probes now verify those fields and the actual
64-tick/two-emission cadence. Both boss browser flows and the build pass.

## 2026-10-03 — Toy Barn dinosaur

- Restored `00420af0`: animated part-one breath, original random consumption,
  room gate, attack sound and first-particle damage/shake; health-change
  protection, hurt sound, alternating flash and the nine-point-offset bar.
- At nine health the dinosaur now enters its authored collapse script, becomes
  harmless and emits the five-particle burst/orange light. Defeat sparks and
  frame-10 smoke continue in room 4; remaining attack timers drain normally.
- The reward clock now advances after that scripted defeat, without requiring
  the dinosaur model to disappear. Its final nine health points are not another
  round of combat.
- Installed-data probes pass breath/damage, recovery, collapse, light/smoke,
  taunt and delayed token boundaries. Browser checks pass natural intro/breath,
  injected-hit recovery/flash, nine-health defeat/light, reward collection/save,
  pause, restart and exit. Build passes. Full natural traversal remains open.

## 2026-10-03 — Construction Yard jackhammer

- Implemented `0041b780`: arena grid entry constraints from runtime tables,
  floor clamp, contact/engine events, proximity camera shake, alternating hit
  lighting and the original vulnerability rule tied to active disks.
- Restored four-tick dust and 32-tick debris emission, including the
  aimed ballistic branch, shared random order, sprite size/spin and damage.
  Coincident horizontal positions skip the retail divide-by-zero branch.
- Matched the level tick's height-dependent update range, 30-health bar,
  removal delay and slot-4 reward through the existing taunt/collection flow.
- Probes pass arena entry axes, disk vulnerability, shake thresholds, debris
  trajectories/damage and reward boundaries. Browser checks pass the natural
  intro, real disk pickup/fire and spin window, debris, flash, injected defeat,
  delayed token collection/save, pause, restart and exit. Build passes.
- This completes known Construction Yard creature dispatch coverage; outdoor
  paint cans, moving scenery and full natural traversal remain open.

## 2026-10-03 — Alleys boat cannons and clown combat

- Restored ZBOAT (`0041df70`) shells: first active update, then each strict
  201-tick cycle; posed part-zero muzzle, heading-based velocity, original
  upward launch/gravity and installed kind-92 projectile damage.
- Added CLOWN (`0041ddb0`) health-change protection, alternating hit flash,
  contact sound and rooftop-room health-bar timer. The bar now uses its actual
  20-health range. Existing wordcode owns its movement/attack cycle.
- Matched level `0041e880` removal and delayed slot-4 token timing, keeping
  the existing taunt and token collection/save flow.
- Installed-data probes pass all four boats, projectile damage and clown
  combat/reward boundaries. Browser checks pass boat firing, natural clown
  intro/movement, injected-hit recovery/flash, defeat, reward collection/save,
  pause, restart and exit. Build and plane/gunslinger regression probes pass.
- All known Alleys creature dispatch hooks now have implementations. This does
  not cover the level's still-unmapped moving scenery or full token traversal.

## 2026-10-03 — Box-launched planes in Alleys and Toy Barn

- Implemented the shared BOX (`004068e0`) and BPLANE (`00406960`) handlers.
  Each launcher chooses the first dormant plane in its authored pair, starts
  its 30-tick spawn countdown and selects the original open/busy script branch.
- Planes take off from their current parent box, target its elevated flight
  height, play event 0x5d, crash on one-health contact and emit kind-88 exhaust
  through animated part zero on the original visibility/eight-tick gates.
- Newly created posed models now receive their live position immediately,
  avoiding a frame at the origin on respawn or scripted summons.
- Probes pass all five installed box/plane pairs (ten plane placements), natural
  script launches, occupied-pair handling, spawn timing, takeoff, crashes and
  exhaust gates. Browser checks pass every launcher in levels 5 and 7, live
  trails/sound, mesh position, pause, restart and exit. Production build passes.
  Buzz is positioned and protected for these focused checks; full traversal
  and the levels' other missing handlers remain open.

## 2026-10-03 — Shared Zurg cars and cross-level creature rendering

- Implemented `004064a0` for all 17 Zurg-car placements in levels 2, 4, 8
  and 9: health-change recovery, original sound events and wheel smoke gates.
- Restored renderer-owned visibility flag 0x1 with original distance hysteresis.
  Frustum membership uses posed mesh bounds; the retail hit-radius sphere is
  not reproduced exactly. Dynamic sound-pitch propagation is still omitted.
- Fixed shared creatures becoming invisible after a level change: artwork and
  hit-data caches now clear together so the next level reloads both.
- Installed-data probes pass handler boundaries and recovery. Browser checks
  pass four consecutive level visits, live wheel smoke, pause, restart and exit;
  the boss car test injects damage to advance to its summon wave. Existing gun
  and buzzard browser checks and the production build pass.

## 2026-10-03 — Water particles and wet footsteps

`water-effects.ts` implements the water particle section of `004a2d80` using
installed effect templates and the shared effect gates/random stream.

- Crossing the surface produces five splash particles, or twenty during a hard
  fall, with original frame periods/lifetimes/rotation and splash event 0x3a.
- Shallow movement produces ripples; submerged Buzz emits bubbles, with faster
  emission during spin. Underwater camera ambience uses event 0x5f and surface
  particles. Camera colour/warp treatment remains unimplemented.
- Emerging starts the 180-tick wet-footstep timer. The existing animation's
  left/right footfall opcodes now provide a mask for correctly positioned wet
  marks on the original eligible surfaces. Drips expire and reset on respawn.
- Installed-effect probes pass transitions, gates, depth boundaries, footprints
  and both footfall markers. Browser checks pass live entry splashes, bubbles,
  wet-state timing, pause, restart and the existing water/movement interactions.
- Remaining water parity includes underwater camera colour/warp and other
  levels' water/slime region controllers; this is not a full-game water audit.

## 2026-10-03 — Penthouse collision variants and ambient scenery

- Collision 25/26 now switches with Buzz's hit-stun state, matching the level
  tick. The inactive hull leaves the collision grid; recovery and restart
  restore the appropriate captured geometry without duplicate grid entries.
- Distant artwork 64/87 follows the two associated push blocks through their
  live collision positions, keeping near and far models aligned.
- Camera room 2 emits alternating kind 76 debris on the original timer;
  player room 1 emits kind 101 particles on the shared gate, with original
  camera range and random offsets.
- Installed probes pass collision activation/restoration, both distant poses,
  emitter timing, alternation and strict room/range boundaries. Browser checks
  pass hurt/recovery state, distant artwork, both emitters and lifecycle.
  Production build and existing Penthouse controller probes pass.
- Remaining: water presentation, light/texture-specific helpers and review of
  dynamic collision 24. Full natural traversal remains unverified.

## 2026-10-03 — Penthouse spring and guard doors

- Collision 12 launches Buzz at -2432 on an ordinary landing and -3072 on
  a stomp, with the original floor-normal check, guide 13 and event 0x1c.
  It clears the stomp and uses the existing launched-player movement state.
- Guards in creature slots 9/10 each open their own door when health changes
  from 1. Collision 22/23 rotates to the original open pose; paired artwork
  swings through the sine-driven opening sequence and remains open.
- Installed-data probes pass actual spring landings, both launch strengths,
  independent guard triggers, collision rotation and exact restart restoration.
  Browser checks pass normal/stomp launches, real creature damage opening both
  doors, visible mesh rotation, pause, restart and exit. Build passes.
- Remaining Penthouse leads: water presentation, alternate hurt collision,
  far push-block artwork and ambient effects; full natural traversal is open.

## 2026-10-03 — Water-aware player movement

The shared player controller now reads a level-supplied water plane. Penthouse
supplies its live plane, including disabling it when drained.

- `00436220` sets the wet movement flag only when Buzz's origin is strictly
  more than 8192 game units below the surface. It clears on leaving/draining.
- Water movement overrides hit-stun values before airborne/skid/launch values,
  preserving the original order. Gravity is 16, fall cap 1024, ground jump
  -768, and jump release/double-jump arithmetic uses divisor 4.
- Depth-boundary, entry/exit/drain, speed, friction and jump probes pass;
  existing land movement passes 24/24 checks. The browser verifies the live
  Penthouse plane drives gravity/fall caps and restores land motion on drain.
- Remaining water presentation includes player entry splashes, bubbles,
  dripping and underwater camera/audio treatment; these are not yet claimed.

## 2026-10-03 — Penthouse train routing

`penthouse.ts` now hosts the train route controller `00428e70`, switch-mask
updates `00428890` and track-indicator flash `00428ba0`.

- Three real stomp switches toggle/cycle the seven track branches, update
  route endpoints, rotate switch arms, retire guides and flash button artwork.
- The train follows installed paths 1–12, including reverse links, heading
  smoothing and matching near/far artwork. Contact slows it; the movable block
  stops it until the block clears and the original delay expires.
- Nearby train smoke and whistles use the shared effect gate/random stream.
  Restart rebuilds route links and state from the executable.
- Installed-data checks pass all 12 configurations, real switch stomps,
  blocked/resumed motion and two configurations reaching the route end.
  Browser checks pass all switches, track cycling, near/far mesh motion,
  route completion, smoke, pause, restart and exit. Production build passes.
- The original enables collision object 27 at completion; the supplied
  Penthouse collision data has no object 27. This optional hull is guarded,
  and no substitute geometry or guessed reward was added.
- Remaining Penthouse work includes water presentation, the spring,
  opening doors and other ambient helpers; full natural traversal is unverified.

## 2026-10-03 — Penthouse water selectors and floating props

The water section of `0042a130`, selector helper `004292c0`, flash helper
`004293d0` and floating-prop helper `00429fb0` now run in `penthouse.ts`.

- Four real stomp selectors lower only the selected collision, update guides,
  and select water height. Filling rises 64 game units per tick; draining
  lowers 512. The exit proximity trigger selects the drained state.
- Five authored surface meshes follow the original height thresholds and hide
  below the camera. Bubble artwork grows at the middle setting. Effect spawns
  receive the live water plane for their existing water interactions.
- Four floating hulls rise with water, bounce when stomped, create splashes,
  and carry floor/ledge passengers through the normal player sweep. Motion is
  capped at 2048 game units per tick; restart restores original collision.
- Installed-data probes pass all selectors, surface/camera boundaries, drain
  reset, all four real floating-prop stomps, passenger carrying and splashes.
  Browser checks pass all selectors, mesh motion, bubble growth, pause, restart
  and exit. Production build passes.
- Later checkpoints cover underwater movement and mechanism routing. Water
  presentation and a full-level playthrough remain open.

## 2026-10-03 — Penthouse tracking hazards

`penthouse.ts` implements the six room-gated tracking hazards (`004295b0`),
their stomp switches (`00429910`), disable sequence (`00429800`) and projectile
helper (`00428700`). Model and switch mappings come from the user's executable.

- Hazards turn toward Buzz, fire kind 92 projectiles on the shared 300-tick
  cycle, and apply contact damage. Projectile aim includes the two random
  offsets visible in the original assembly but omitted by the decompiler.
- Real stomp contacts lower each switch's collision, squash its artwork,
  retire its guide and start a camera cut. After 60 ticks the active model pair
  is replaced with damaged artwork, an explosion and smoke; firing stops.
- Scripted camera cuts now keep particle spawning/culling around the displayed
  target, so remote switch explosions remain visible while Buzz stays behind.
- Restart restores original switch collision and fresh hazard state; exit
  releases the controller. Installed-data probes exercise all six real stomp
  landings, room gates, attack arithmetic, projectile damage and reset.
- Production build and browser checks pass all six rendered hazards, real stomp
  switches, disable bursts/model swaps, pause, restart and exit. Both gunslinger
  fight/reward browser regressions pass with the shared camera-effects change.
- Later checkpoints cover water controls/floating props and mechanism routing;
  natural full-level traversal remains unverified.

## 2026-10-03 — Elevator fan scenery and airflow

`elevator-fans.ts` restores the fan portion of `00425f60` and particle helper
`00425eb0`, using paired paths 0/1/2/8/10 from the installed scene.

- Four timed wall fans accelerate, coast and stop; switched shaft fans and the
  continuously running fan rotate; the arena fan group follows the boss spin.
- Stomps on collision objects 4/5 activate the two shafts and retire guides 0/4.
  Both the switch artwork and its collision rotate, with spatial-index and normal
  updates. Restart restores the captured collision and fresh switch state.
- Fixed shafts accelerate upward by 128 with the original height/radius checks;
  eight boss columns scale their reach and acceleration with spin. Airflow clears
  stomp/ground state. Wall wind ramps into the normal player sweep and respects
  opposing contacts and climbing attachments.
- Wind particles use kinds 78/79, shared 16/7-tick gates, authored velocities,
  spin and shared 32-tick orientation. Nearby active vents raise event 0x8c.
- Installed-data probes pass actual stomp landings, a continuous 60-tick shaft
  ascent, airflow boundaries/caps, fan timing and collision reset/indexing.
  Existing lift/Airport interaction and Tarmac plane physics probes pass.
  Production build and both gunslinger browser lifecycle regressions pass.
- Browser checks pass actual mesh rotation, both real stomp switches, shafts,
  particles/sound, boss spin/arena lift, pause, restart and exit. These position
  Buzz to isolate interactions; full natural level traversal remains unverified.
- Remaining: exact original external-force/contact solver comparison, ambient
  zone-specific debris emitters and other Elevator effects. `00830e3c` receives
  fan values that the sound dispatcher reads as dynamic pitch; earlier notes
  calling it camera feedback were incorrect. No guessed camera shake was added.

Penthouse follow-up now has concrete original routines to work from: water-level
switches and four floating/bouncing props (`00429fb0`, collision 13–16/artwork
39–42); six tracking hazards (`004295b0`, artwork 50–54/58 plus paired models),
their stomp switches (`00429910`) and disable effects (`00429800`); the mechanism
mask/rotations (`00428890`) and moving prop with far artwork (`00428e70`, 38/80).
The six tracking hazards and their switches are covered in the newer entry above;
later checkpoints above also cover water and mechanism helpers.

## 2026-10-03 — Elevator and Penthouse gunslinger combat

`gunslinger.ts` now implements the level-owned type 31 and type 45 routines
(`00425700`, `004282d0`), independently of Final Showdown's gunslinger.

- Elevator Hop: 30-point health bar, 60-tick recovery and height gate, timed
  homing emitter plus five arcing shots, authored muzzle, hover/ground animation
  changes driven by the original spin clock and central box. Actual creature
  removal starts the delayed reward and retires remaining homing emitters.
- Penthouse: 20 combat health points, recovery/height gates, alternating bone
  15/16 shots with aim-cone limits, two firing cues and muzzle puffs, changing
  patrol rectangles, authored defeat and delayed token reward. Defeat cancels
  a pending burst. Both bosses brighten on hits without changing size.
- `tools/gunslinger-probe.ts` verifies installed intros, timing and boundary
  conditions, attack cycles, actual death wordcode/removal, delayed rewards and
  reset, plus movement/damage from all three installed projectile templates.
  Prospector, Tarmac Smith and Finale regressions pass, as does production build.
- `tools/gunslinger-flow-check.js` passes both real intros and authored attack
  cycles, pause, hit brightness/recovery, defeat/reward collection/save, restart
  and exit. Buzz is positioned/protected and laser hits are injected; attack
  wordcode is not skipped. The emitter check includes invisible live effects.
- Fan scenery/airflow follow-up is recorded above. Remaining scope includes
  other Elevator effects; Penthouse prop helpers/hazards; exact intro camera
  timing, original-versus-port visual/audio comparison and unassisted traversal.
  These combat hooks do not imply either entire level is complete.

## 2026-10-03 — Airport Prospector fight

Airport Infiltration now installs its own `0042be60` controller for type 61,
slot 32, independently of Final Showdown's Prospector.

- Authored chase/throw animation, 44-tick pick release, projectile and sound;
  20 combat health points, 60-tick recovery, hit brightness and voice cues.
- Defeat cancels pending throws and enters the authored death script. The level
  reward timer continues after the model disappears, then reveals token slot 4.
  The HUD now uses this encounter's 20-point combat range.
- `tools/prospector-probe.ts` verifies intro gating, damage/recovery boundaries,
  throw timing/cancellation, defeat/reward/reset, and installed pick movement and
  damage. The Tarmac Smith regression and production build pass.
- `tools/prospector-flow-check.js` verifies the actual intro and authored attack,
  pause, projectile/sound, hit brightness without enlargement, reward collection
  and save, restart, exit and re-entry. It positions Buzz and injects laser hits;
  an unassisted fight and full-level traversal remain unverified. Exact voice
  overlap, intro camera timing and original-versus-port visual parity remain open.
- Elevator Hop and Penthouse follow-up is recorded above.

## 2026-10-03 — Shared late-game gun enemies and buzzards

Original `00406a90` and `00406c70` now dispatch through `CREATURE_HANDLERS`.
These cover 30 gun enemies and 26 buzzards across Al's Penthouse, Airport
Infiltration and Tarmac Trouble (internal levels 11, 13, 14).

- Gun enemies consume the wordcode firing request, use the authored offset muzzle
  and +/-256-angle aim cone, emit projectile kind 97, derive its lifetime from a
  terrain cast, and raise sound 0x56 plus five conditional muzzle puffs. Spawn-mode
  randomness precedes each puff's spin byte, using the existing shared stream.
- Buzzards switch animation 0/1 with chase state, emit sustained flight event 0x57,
  and emit 0x58 once per health change after initializing the health cache.
- `tools/shared-enemy-probe.ts` verifies trigger consumption, aim-cone boundaries
  and wrap, muzzle/terrain lifetime, installed bullet motion/damage, buzzard state
  and damage cues, and request cleanup. `tools/shared-enemy-flow-check.js` verifies
  actual projectile spawning, sounds, buzzard animation, restart and exit in all
  three levels. The browser positions/protects Buzz and seeks the existing firing
  opcode; it does not claim a natural fight or unassisted playthrough.
- Build and existing ZPOD beam regression pass. Exact acoustic/visual comparison
  and whole-game random-stream scheduling remain unverified. The separate Elevator
  Hop and Penthouse boss controllers are covered in the later entry above.

## 2026-10-01 — Elevator Hop and Airport platforms

`src/sim/level-platforms.ts` follows Elevator tick `00425f60`, movement helper
`0048acc0`, Airport init/tick/helpers `0042c930`, `0042ca60`, `0042c2b0`,
`0042c3e0`, spring launch `00434090`, and the ledge identity written at `0043611d`.

- Elevator Hop: wire stomp puzzle, collision barrier release, both compound lifts,
  near/far artwork and cables, random waits from the shared game byte stream
  (base 96/32 plus byte & 127), 128-tick barrier shrink, 64-tick warning cycle,
  warning point light, movement hum/bells and guide retirement.
- Airport: five authored paths/headings, node-8 third-vehicle start, loop recycling,
  swept truck/player obstruction, reverse acceleration, paired truck reversal and
  rear-position correction. Acquired ledges pause the relevant truck pair or lift.
  This corrects the earlier assumption that these controllers should always carry
  an acquired ledge: the original checks the grabbed object separately from floors.
- Both fixed airport springs and three truck springs respond to real stomp impacts
  with the original -3072 launch, sound, 16-tick artwork recovery, guide retirement
  for fixed springs and exhaust shutdown for stomped vehicles. Three exhaust
  emitters use kind 115/mode 2 and camera-distance culling.
- Shared: floor carry, jumping off, compound-hull seam protection, collision index
  updates, reset restoration, pause and exit cleanup. Hull-restricted sphere casts
  test incoming truck collisions without touching the static world query behavior.
- `tools/level-platforms-probe.ts`: landing/riding/jumping, a 2,100-tick lift ride,
  ledge pauses, seam protection, long route cycles, reset and spatial-index cleanup.
- `tools/platform-interactions-probe.ts`: wait-range boundaries, warning/barrier
  timing, sound cues, paired ledge pause, a physical truck obstruction without
  injected contact flags, paired reversal, all five spring launches using real
  collision landings, exhaust state and artwork recovery. Spring translation is
  frozen for those five isolated landing tests; the browser covers a moving truck.
- `tools/level-platforms-flow-check.js`: actual mesh transforms, wire impacts,
  warning/barrier artwork, moving-truck spring launch/roll, live exhaust effects,
  sound events, pause, reset and exit. It positions Buzz and seeds stomp state.
- Production build, player probe (24 checks), Tarmac plane regression, and all-15
  entry/exit smoke pass. No unassisted full-level completion claim. Exact original
  collision solver equivalence, route-script instruction scheduling and an audible
  comparison remain unverified; the missing behaviors above now have controllers.

## Evidence and status rules

- **Verified:** a named check exercises the behavior and asserts its result.
  State whether inputs, damage, inventory or positions were injected.
- **Partial:** implementation exists, but known branches or feedback are absent.
- **Missing:** original behavior has evidence and its corresponding port path
  is absent. Missing creature hooks do not mean the whole creature is absent:
  shared wordcode can still animate or move it.
- **Investigate:** there is a lead, not enough evidence to claim parity or a bug.
- **Unreviewed:** no behavior-level comparison yet. Never interpret as passed.

Every fix needs an original function/data reference, affected internal level and
object/creature IDs, a trigger, expected observable result, and a regression
covering reset and level exit. Keep copyrighted executable dumps outside git.

## Repeatable checks

```sh
node --import tsx tools/game-audit.ts 'Toy Story 2'
node --import tsx tools/game-audit.ts 'Toy Story 2' --json
# Optional original-motion inventory from tools/ghidra/DumpAll.java output:
node --import tsx tools/game-audit.ts 'Toy Story 2' --decompile /tmp/toy2_levels.c
npm run build
# With the development server running:
node --import tsx tools/browser-shot.ts 'Toy Story 2' /tmp/game-audit.png --eval-file tools/game-audit-flow-check.js
```

The install is read-only. JSON output supports comparing inventories as handlers
are added. Parse failures produce a nonzero exit. Missing handlers remain an
explicit backlog, not a scene-load failure. Optional decompile mode follows
available level-local helpers and lists position/rotation mutation call sites;
it cannot establish branch reachability, timing or indirect calls. Seed all 15
tick addresses listed in the JSON when preparing a Ghidra dump.

[Generated inventory](GAME_INVENTORY.md) records this pass, including original
function addresses, creature slots, unmapped collision IDs and task controllers.
Regenerate it when those mappings change. A collision ID without a mapped
controller is an investigation lead: it might be fixed or controlled elsewhere.
The inventory maps push blocks and Tarmac collision object 0 to their controllers.

Validation on this pass: production build passed; all 15 DAT/terrain/creature
inventories parsed; Chromium launched all 15 scenes in selector order, simulated
ten ticks each, checked the visor, exited through the pause menu and verified
selector backdrop cleanup. The harness unlocks levels by setting disposable
save token bits. It does **not** verify collecting those tokens or progression.

## Level-by-level review queue

Names below use selector order; internal IDs swap levels 3 and 6. Every row
still needs the full checklist below. Existing tests are coverage anchors,
not evidence for untested interactions.

| Play order | Level | Confirmed gaps / implementation evidence | Next behavior comparison |
|---|---|---|---|
| 1 | Andy's House | Tin intro/fight/reward integration tested; hover wobble/sparks partial. Chair stomp and pushables implemented. | Remaining numbered props and platforms; all five token routes. |
| 2 | Andy's Neighborhood | Lawnmower effects, kite flight/combat/reward and ZGCAR hook implemented. | Moving scenery and natural race/token routes. |
| 3 | Bombs Away (internal 6) | `stepBossFight` exists. | Complete boss attacks, damage windows, defeat, token and replay. |
| 4 | Construction Yard | DRILL combat/reward and ZGCAR implemented; trailer paint, outdoor lids, debris, stomp bridge, four shuttles, four linked tilting lifts, stomp-selected lift, distant crate, proximity scenery/portals and mud movement/effects implemented. | Review collision IDs 13/25; natural traversal/token routes. |
| 5 | Alleys and Gullies | BOX/BPLANE launch cycle, boat cannon, clown combat/reward, eight lane platforms, two seesaws, spring, bubble machine, moving bubble attachments, push-triggered bridge, distant crates, water, rain and timed environmental emitters implemented. | Underwater camera treatment and remaining scenery/effects and natural pole/zip-line routes. |
| 6 | Slime Time (internal 3) | Dedicated slime controller exists. | Full encounter, arena effects, reward and replay comparison. |
| 7 | Al's Toy Barn | Dinosaur breath/combat/defeat/reward and BOX/BPLANE launch cycle implemented. | Original moving-collision calls and full token routes. |
| 8 | Al's Space Land | Buggy fight/reward/projectile model, ZGCAR, claw puzzle/token delivery, saucer course/deadline/retry, hanging toys/display motion/sounds, paired laser hazards, projectile volley, ball-pit movement/scatter, rocking-block trigger/far crates and visibility-gated Mother texture animation implemented. | Remaining ambient/projectile effects and natural route validation. |
| 9 | Toy Barn Encounter | Dedicated pod controller, beam tests and ZGCAR hook implemented. | Full natural fight/summon cycles and reward traversal. |
| 10 | Elevator Hop | Wire puzzle, compound lifts, GUNSP combat/reward, fan switches/rotation/airflow implemented. | Other ambient effects, exact collision/script/force timing and full-level traversal. |
| 11 | Al's Penthouse | Shared enemies, GUNSL combat/reward, hazards, water/floats, train routing and underwater movement implemented. | Underwater camera colour/warp, light/texture helpers and collision 24 review. |
| 12 | The Evil Emperor Zurg | Entrance, attacks, recovery, defeat, save bit and victory/movie handoff implemented in `zurg-boss.ts`. Installed-data and focused browser checks pass. | Unassisted combat, original-versus-port camera/render comparison and detail-dependent particles. |
| 13 | Airport Infiltration | Five authored transport routes, shared gun/buzzard handlers and Prospector fight/reward implemented. | Exact collision/script timing comparison and full-level traversal; distinct from Tarmac. |
| 14 | Tarmac Trouble | Plane motion/collision, wheels/fans, ground/climbing passengers, wheel hazards and helicopter hover/rotors/token motion and light puzzle/lowering implemented and tested. Slinky timed-path rules and retry implemented. Near/far scenery sway, rain/plane sound, rain particles and lightning/thunder restored. Blacksmith recovery, defeat and delayed reward implemented; axe throws, hit flashing and bar expiry implemented. Shared gun enemy and buzzard handlers implemented. | Other ambient effects and natural token routes; pitch/roll attachment on other movers. |
| 15 | Final Showdown | Stage and three fighter controllers implemented in `finale.ts`; rendered entrance, attacks, rescue, completion save, ending/credits and replay tested. | Natural combat completion; exact roll/framing and voice/pitch parity. |

## Prioritized work

1. **Tarmac plane and moving ledge attachment — implemented.**
   `src/sim/tarmac-plane.ts` ports `0042dcb0` (tick `0042e790`): near IDs 0–15
   excluding helicopter 3, IDs 84–86, far IDs 16–30, independent fans/wheels,
   smoothed collision object 0 and wheel damage. Shared absolute collision
   transforms and `moving-platform.ts` carry floor contacts and acquired moving
   ledges without attaching unrelated airborne players or wall contacts. The node probe verifies
   orbit/LOD poses, wheel bounds, collision reset/indexing, angle wrap, landing,
   riding, walking and jumping. The browser check verifies actual near/far
   vertices, landing/riding/jumping, pause, restart, wheel damage/invulnerability,
   fall respawn and selector exit/re-entry. Both position Buzz for focused checks;
   this is not a full Tarmac playthrough. The expanded browser regression also
   acquires an actual moving ledge, follows the climb, pauses/resumes and lands
   aboard. `ledge-probe.ts` covers moving anchor stability and early damage/death
   release. Helicopter helper `0042e1d0` is now ported in `tarmac-helicopter.ts`: hover,
   near/far rotors and token artwork/collection coordinates. The node and combined
   Tarmac browser regressions cover motion, phase wrap, pickup collection, pause,
   reset and re-entry. The light puzzle and helicopter sound are now implemented too:
   `tarmac-lights-probe.ts` validates 200 generated boards and original timing;
   `tarmac-lights-flow-check.js` uses real pad ground-pounds for failure/retry,
   success/lowering/camera, pause, reward collection, restart and exit. It
   positions Buzz above pads and at the lowered token; this is not an unassisted
   traversal. Pitch/roll attachment and the original climb-camera transition
   remain open.
   Slinky's slot-2 challenge now ports `0042e790`: offer/reminder, clock,
   jump/slime/timeout failure, token withdrawal and retry. The node probe
   `tarmac-path-probe.ts` checks original boundaries and reward lifecycle.
   `tarmac-path-flow-check.js` uses actual dialogue, jump input, slime collision,
   timeout, retry, token collection, pause, restart and exit, with positions
   supplied for focused checks. Idle chatter and full-route traversal remain open.
   Near/far scenery 69/70 now sways using the original tick's relative-angle
   helper. A shared sound-bank parser fix preserves unused slots, restoring
   Tarmac's rain/thunder/plane mappings; rain and plane-engine event calls now
   run alongside the helicopter. `tarmac-scenery-probe.ts` checks 4096 phases
   and all 17 banks. `tarmac-scenery-flow-check.js` checks rendered motion,
   decoded audio, voice reuse, pause/mute, reset and exit/re-entry. Thunder
   scheduling, lightning and rain particles are now implemented by the weather pass below.
   Weather now ports `0044ed60/0044ed90/0044f010` and the weather portion of
   `0042e790`: bounded rain pool, installed page-23 rain artwork, ground splashes,
   lightning envelope and delayed thunder. Secondary sprite-page batching fixes
   the wrong-sheet rendering path. Node probes and the weather browser check
   cover timing, actual cards/splashes, framebuffer brightening, pause/reset and
   mid-flash exit/re-entry. The latter positions Buzz for focused checks. Exact
   brightness modulation across the separate HUD/backdrop layers remains open,
   along with the absent shared creature hooks. Beacon flares and nearby Buzz
   lighting already exist in `lens-flare.ts` and `scripted-light.ts`; the
   `00830d78..00830d8e` registers describe lighting, not aiming targets.
   `special-light-probe.ts` checks Tarmac's radial colour split and cutoff.
   Blacksmith combat is now **partial**: the level-local subset of `0042d3e0`
   and `0042e790` restores 60-tick hit recovery, the health-below-10 defeat
   script entry, contact-hazard removal, sound sequence -2 and slot-4 reveal
   after the original phase countdown. The HUD uses its 20-point health span.
   `tarmac-smith-probe.ts` reads the installed placement and executes the defeat
   wordcode; it covers recovery boundaries, reward after model removal, reset
   and finale isolation. `tarmac-smith-flow-check.js` checks actual taunt/wake,
   recovery, defeat/reward, restart and exit/re-entry in Chromium. Both inject
   hits; the browser also positions Buzz. Axe attacks now follow the original
   chase/range gate, animation 3/script 24, 63-tick release and frame-47 movement
   handoff (`0042d47f..0042d57d`). Kind 0x66 leaves animated part 4 at offset
   (180,-150,-50), homes horizontally on Buzz and raises sound 0xa7.
   `tarmac-smith-attack-probe.ts` checks boundaries, repeat/cancel/reset,
   finale isolation and installed projectile movement/contact damage. The
   browser regression reaches the attack through authored wordcode and checks
   release/sound, pause during windup and restart cleanup. Hit flash and bar
   expiry now pass too; this is not a complete encounter playthrough.
   The inventory recognizes this composed implementation; recovery/defeat live
   in the Tarmac task controller and attack runs after shared movement. The
   finale has its own controller and remains isolated from this path.
2. **Other level motion.** Use the original mutation call inventory to account
   for each object/controller, starting with traversal-critical platforms in
   Elevator Hop and both airport scenes. Share transform/collision integration;
   keep authored timing and state transitions specific to each level.
3. **Progression blockers.** Named creature handlers now have implementations,
   including mower/kite, drill, boat, dinosaur, buggy and gunslingers. Audit
   remaining special tasks and natural routes independently; handler coverage
   does not establish that every token can be earned through normal play.
   Zurg's controller is now implemented from `0042b300/0042b3a0`, including
   entrance and death cuts, both projectile types, 60-tick hit recovery,
   retaliation, inner-radius constraint, falling death, boss-save bit and
   movie/victory handoff. `zurg-boss-probe.ts` checks installed placement,
   exact timing/selection boundaries and one-shot progression requests.
   `zurg-boss-flow-check.js` exercises entrance, pause, authored volleys,
   recovery/defeat, save, movie exit, restart and replay. It positions/protects
   Buzz and injects damage; natural combat completion remains unverified.
   `zurg-projectile-probe.ts` checks installed bouncing/homing effects, trails,
   spin deflection and contact damage. All 15 scenes still pass entry/exit.
   The pre-existing `slime-probe.ts` mesh-size assertion is resolved above:
   cross-layer seams explain 2385 versus 2277 position components. The full
   scripted encounter regression now passes.
   Older decode notes incorrectly described descent as rising, the inner
   clamp as an outer bound, and lighting as aiming; these are corrected.
   Final Showdown now ports `0042faa0/0042fc50` and `0042f310/0042f530/0042f7b0`:
   staged entrance with retained near/far mesh identity, bounce/wobble, all three
   attacks, recovery/defeat, spacing/bounds, camera roll, rescue, save and the
   existing ending/credits handoff. Shared level cleanup now runs before credits,
   not only upon selector reload. `finale-probe.ts` checks installed wordcode,
   exact timers, two-shot gunslinger bursts, all six defeat orders, rescue/win
   timing and reset. `finale-flow-check.js` follows authored attacks, measures
   stage vertex movement/pause/reset, and checks save, credits and replay.
   The browser positions/protects Buzz and injects damage. An unassisted win
   remains unverified; dynamic sound pitch, exact camera-roll/framing comparison
   and per-character voice overlap gating remain open.
4. **Puzzles, hazards and rewards.** Remaining prop flags,
   all token routes, power-up unlocks, collectible counts and replay behavior.
5. **Presentation parity.** Triggered effects and spatial sounds, texture gates,
   Tin cosmetics, camera/cutscene transitions and near/far visibility.

## Required checklist for each level

Track these separately; one passing screenshot cannot close a level.

| Area | Required observations |
|---|---|
| Moving scenery | Each authored render/collision mutation accounted for; motion phases, triggers, near/far meshes, camera zones. |
| Traversal | Moving-platform passengers, jumping off/on, ledge attachment, poles, zip lines, power-up routes and checkpoints. |
| Enemies / bosses | Every placed type and level-owned controller; wake/sleep, attacks, damage windows, death, respawn and rewards. |
| Puzzles / progression | Each token's actual acquisition route, challenge start/fail/retry, power-up part/unlock, save and replay. |
| Hazards | Contact, damage/knockback, invulnerability timing, death and restoration of prop state. |
| Effects / audio | Ambient and triggered sounds, particles, texture animations, lights, render distance and cleanup. |
| Lifecycle | Pause/dialogue freeze, death, restart, exit/re-entry, selector cleanup, save/load and final transitions. |

Reuse focused probes and browser checks already under `tools/`. Add a behavior
check when closing a gap, then reference it here. Natural transitions matter:
the Tin regression now follows the authored intro and attack cycle, although it
still positions Buzz and injects damage. Do not revive the old claim that its
intro handoff is missing. Full unassisted completion of all levels remains
unreviewed, including completion using only naturally obtained unlocks.

Tarmac regressions: `node --import tsx tools/tarmac-plane-probe.ts 'Toy Story 2'`
and `tools/tarmac-plane-flow-check.js` through the browser harness. Existing
`tools/push-blocks-probe.ts` also passes after the spatial-index change.
