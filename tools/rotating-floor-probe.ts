/** Ground queries must follow a moving hull's current slope, not its rest slope. */
import assert from 'node:assert/strict';
import {buildCollisionWorld,captureCollisionGroup,transformCollisionGroup,groundBelow,type CollisionGroup} from '../src/formats/collision.ts';
const group:CollisionGroup={position:{x:0,y:0,z:0},dynamic:true,objectNumber:0,surface:0,zone:null,
 meshes:[{bounds:{xMin:-100,xExt:200,zMin:-100,zExt:200},polys:[{vertices:[{x:-100,y:0,z:-100},{x:100,y:0,z:-100},{x:0,y:0,z:100}],triangle:true,normal2:null,normal:{x:0,y:-1,z:0}}]}]};
const w=buildCollisionWorld([group]),rest=captureCollisionGroup(w,0);
assert.equal(w.polys.length,1);assert(groundBelow(w,0,-200,0));
transformCollisionGroup(w,rest,rest.origin,0,0,Math.PI*70/180);
assert(!w.polys[0]!.walkable);assert.equal(groundBelow(w,0,-200,0),null,'steep rolled floor cannot be ground');
transformCollisionGroup(w,rest,rest.origin,0,0,Math.PI/4);
assert(w.polys[0]!.walkable);assert(groundBelow(w,0,-200,0),'floor becomes walkable again');
transformCollisionGroup(w,rest,rest.origin,0,Math.PI*70/180,0);
assert(!w.polys[0]!.walkable);assert.equal(groundBelow(w,0,-200,0),null,'pitch uses the same slope rule');
transformCollisionGroup(w,rest,rest.origin,Math.PI/2);
assert(w.polys[0]!.walkable);assert(groundBelow(w,0,-200,0),'yaw preserves a floor');
transformCollisionGroup(w,rest,rest.origin,0);
assert.deepEqual(w.polys[0]!.vertices,rest.polys[0]!.vertices);assert(w.polys[0]!.walkable);
console.log('PASS: rotated collision ground queries track pitch/roll slope, reopen after flattening, and preserve yaw/rest behavior');
