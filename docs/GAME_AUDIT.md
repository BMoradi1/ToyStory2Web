# Whole-game parity audit

Reviewed 2026-10-04. This is the current audit index; older roadmap entries
may describe work that has since shipped. The first pass covers all 15 scenes,
their creature dispatch hooks, authored collision objects, existing task/prop
controllers, original level motion calls, and browser entry/exit. **It is not
a completed original-versus-port playthrough.**


## 2026-10-04 — Construction Yard proximity scenery

Restored the object-63/64 height animation at the start of `0041c640`:
strict 250-unit 3D proximity, eight-tick collapse and eight-tick restoration.
Installed probes cover all axes, diagonal exclusion, boundary and endpoint
clamps. Browser checks both artwork scales, repeated approaches, pause,
restart and exit; production build passes. The companion texture-command
swap in that native block still needs separate implementation.

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
| 4 | Construction Yard | DRILL combat/reward and ZGCAR implemented; trailer paint, outdoor lids, debris, stomp bridge, four shuttles, four linked tilting lifts, distant crate and proximity scenery implemented. | Review collision IDs 13/21–25 and proximity texture-command swap; natural traversal/token routes. |
| 5 | Alleys and Gullies | BOX/BPLANE launch cycle, boat cannon and clown combat/reward implemented. | Moving scenery/collision; 37 poles and 11 zip lines need route checks. |
| 6 | Slime Time (internal 3) | Dedicated slime controller exists. | Full encounter, arena effects, reward and replay comparison. |
| 7 | Al's Toy Barn | Dinosaur breath/combat/defeat/reward and BOX/BPLANE launch cycle implemented. | Original moving-collision calls and full token routes. |
| 8 | Al's Space Land | Buggy fight/reward and ZGCAR implemented; prop-gated texture effect missing. | Claw machine, saucer course, `0052c9b8 & 1` effect trigger and natural route validation. |
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
   Broader validation found a pre-existing `slime-probe.ts` triangle assertion
   failure (2385 actual versus 2277 expected), reproduced from unchanged commit
   `fbfaf47`; investigate the probe/model expectation separately.
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
