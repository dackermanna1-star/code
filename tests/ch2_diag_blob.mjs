// Ch2 diagnostic (engine report repro): at QUALITY=medium the pistol viewmodel blows out to a white blob when facing the pawn shop from Kent St (yaw -2.8).
export default async ({ page, evalg, wait, shot }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=1');
  for (let i = 0; i < 120; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  await evalg(() => { const g = window.game; g.director.enabled = false; g.cheats.botsIdle = true; g.cheats.god = true; for (const s of g.survivors) if (s !== g.player) s.teleport(-6, 0, 3, 0); g.hud.show(false); window.session.menu.clear(); });
  const probe = () => evalg(() => {
    const g = window.game, THREE_ = g.scene.constructor;
    const cam = g.renderer.camera; const cp = cam.getWorldPosition(cam.position.clone());
    const out = [];
    g.scene.traverse((o) => { if (o.isLight && o.intensity > 0 && o.visible) { const wp = o.getWorldPosition(cp.clone()); const d = wp.distanceTo(cp); if (d < 8) out.push([o.type, +o.intensity.toFixed(1), +d.toFixed(2), o.parent === cam ? 'cam' : '']); } });
    const meshes = [];
    g.scene.traverse((o) => { if (o.isMesh && o.visible && o.material && (o.material.emissiveIntensity > 0.5 || o.material.type === 'SpriteMaterial')) { const wp = o.getWorldPosition(cp.clone()); const d = wp.distanceTo(cp); if (d < 4) meshes.push([o.name || o.material.type, +d.toFixed(2), o.material.emissiveIntensity]); } });
    return { flash: g.player.flashlight, lights: out, emissive: meshes.slice(0, 10), slot: g.player.slot, weapon: g.player.weapon?.type };
  });
  for (const [name, x, z, yaw, fl, env, vm] of [['blob_a', 250, 80, -2.8, false, 1, 1], ['blob_c', 247, 82, -2.8, false, 1, 1]]) {
    await evalg(([x, z, yaw, fl, env, vm]) => { const g = window.game; if (!env) g.scene.environmentIntensity = 0; else g.scene.environmentIntensity = g.level.env.envIntensity ?? 0.08; g.vmLight.visible = !!vm; g.player.teleport(x, 0, z, yaw); g.player.pitch = 0.05; g.player.flashlight = fl; g.advance(0.4); }, [x, z, yaw, fl, env, vm]);
    await wait(500);
    console.log(name, JSON.stringify(await probe()));
    await shot(name);
  }
};
