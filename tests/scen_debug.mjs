export default async ({ shot, evalg, wait }) => {
  await wait(4000);
  const r = await evalg(() => {
    const g = window.game;
    const f = g.flashlight;
    const THREE = g.renderer.camera.constructor; 
    const wp = f.getWorldPosition(g.camPos.clone());
    const tp = f.target.getWorldPosition(g.camPos.clone());
    return { int: f.intensity, wp: wp.toArray(), tp: tp.toArray(), cam: g.renderer.camera.position.toArray(), visible: f.visible, parent: f.parent?.type, castShadow: f.castShadow, player: g.player.pos.toArray(), yaw: g.player.yaw, pitch: g.player.pitch };
  });
  console.log(JSON.stringify(r));
  await evalg(() => { window.game.player.pitch = -0.5; });
  await wait(1000);
  await shot('d1');
};
