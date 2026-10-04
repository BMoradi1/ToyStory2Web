# Whole-game parity audit

Reviewed 2026-10-03. This is the current audit index; older roadmap entries
may describe work that has since shipped. The first pass covers all 15 scenes,
their creature dispatch hooks, authored collision objects, existing task/prop
controllers, original level motion calls, and browser entry/exit. **It is not
a completed original-versus-port playthrough.**


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
  fan feedback values, but its PC consumer is not established; earlier notes
  calling it camera feedback were premature. No guessed camera shake was added.

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
| 2 | Andy's Neighborhood | LAWN, ZKITE and ZGCAR hooks absent. | Lawnmower/kite state machines, moving scenery and race/reset behavior. |
| 3 | Bombs Away (internal 6) | `stepBossFight` exists. | Complete boss attacks, damage windows, defeat, token and replay. |
| 4 | Construction Yard | DRILL and ZGCAR hooks absent; trailer paint implemented, outdoor cans missing. | Drill, outdoor paint and collision movement, then token routes. |
| 5 | Alleys and Gullies | BOX, BPLANE, CLOWN and ZBOAT hooks absent. | Boat/plane and clown behavior; 37 poles and 11 zip lines need route checks. |
| 6 | Slime Time (internal 3) | Dedicated slime controller exists. | Full encounter, arena effects, reward and replay comparison. |
| 7 | Al's Toy Barn | DINO, BOX and BPLANE hooks absent. | Dinosaur encounter and original moving-collision calls. |
| 8 | Al's Space Land | BBUGGY and ZGCAR hooks absent; prop-gated texture effect missing. | Buggy challenge, `0052c9b8 & 1` effect trigger and reward paths. |
| 9 | Toy Barn Encounter | Dedicated pod controller and beam tests exist; ZGCAR hook absent. | Full fight/summon cycles and reward; determine the absent hook's role. |
| 10 | Elevator Hop | Wire puzzle, compound lifts, GUNSP combat/reward, fan switches/rotation/airflow implemented. | Other ambient effects, exact collision/script/force timing and full-level traversal. |
| 11 | Al's Penthouse | Shared enemies, GUNSL combat/reward, hazards, water/floats, train routing and underwater movement implemented. | Water presentation, spring/doors and other ambient helpers. |
| 12 | The Evil Emperor Zurg | Entrance, attacks, recovery, defeat, save bit and victory/movie handoff implemented in `zurg-boss.ts`. Installed-data and focused browser checks pass. | Unassisted combat, original-versus-port camera/render comparison and detail-dependent particles. |
| 13 | Airport Infiltration | Five authored transport routes, shared gun/buzzard handlers and Prospector fight/reward implemented. | Exact collision/script timing comparison and full-level traversal; distinct from Tarmac. |
| 14 | Tarmac Trouble | Plane motion/collision, wheels/fans, ground/climbing passengers, wheel hazards and helicopter hover/rotors/token motion and light puzzle/lowering implemented and tested. Slinky timed-path rules and retry implemented. Near/far scenery sway, rain/plane sound, rain particles and lightning/thunder restored. Blacksmith recovery, defeat and delayed reward implemented; axe throws implemented; hit flashing missing. Shared gun enemy and buzzard handlers implemented. | Remaining creature hooks and other ambient effects; pitch/roll attachment on other movers. |
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
   release/sound, pause during windup and restart cleanup. Hit flashing remains
   missing; this is not a complete encounter playthrough.
   The shared SMITH hook stays listed as absent in the generated inventory:
   recovery/defeat live in the Tarmac task controller; the level-gated attack
   runs after the shared creature update. The finale controller remains absent.
2. **Other level motion.** Use the original mutation call inventory to account
   for each object/controller, starting with traversal-critical platforms in
   Elevator Hop and both airport scenes. Share transform/collision integration;
   keep authored timing and state transitions specific to each level.
3. **Progression blockers.** Missing challenge handlers (lawnmower/kite, drill, boat, dinosaur, buggy, gunslingers). There are
   16 distinct absent shared hooks across the install. Determine what shared
   wordcode already does before replacing any behavior.
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
4. **Puzzles, hazards and rewards.** Outdoor paint cans, remaining prop flags,
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
