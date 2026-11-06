// a persistent orange point light (like a fire / flare) 3 m in front of the player at night: the lit area
// must glow orange, never turn black (Vector3.copy(Color) -> NaN bug)
const P = g.player;
await window.__qa.scene({ x: 497, z: 516, y: 21, yaw: 0, h: 23.5, day: 3, wait: 3000 });
const pos = { x: P.x - Math.sin(P.yaw) * 3, y: P.y + 0.6, z: P.z - Math.cos(P.yaw) * 3 };
g.addFlashLight(pos, 0xff8a30, 2.5, 9, 30);
await window.__qa.frames(6);
const mu = await import('/src/render/materials.js');
const c = mu.globalUniforms.uPLC.value[0];
return { count: mu.globalUniforms.uPLCount.value, color: [c.x, c.y, c.z].map((v) => (Number.isFinite(v) ? +v.toFixed(2) : String(v))) };
