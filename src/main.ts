const params = new URLSearchParams(location.search);

async function boot() {
  // the realistic models' textures (Scarlet's) before any character library is built
  try {
    const m = await import('./character/realBody');
    await m.preloadRealModels();
  } catch (e) {
    console.warn('realistic models unavailable', e);
  }
  const viewer = params.get('viewer');
  if (viewer === 'pose') {
    const m = await import('./debug/poseViewer');
    m.runPoseViewer(params);
    return;
  }
  if (viewer === 'sheet') {
    const m = await import('./debug/sheetViewer');
    m.runSheetViewer(params);
    return;
  }
  if (viewer === 'graffiti') {
    const m = await import('./debug/graffitiViewer');
    await m.runGraffitiViewer(params);
    return;
  }
  if (viewer === 'atlas') {
    const m = await import('./debug/atlasViewer');
    m.runAtlasViewer(params);
    return;
  }
  if (viewer === 'loco') {
    const m = await import('./debug/locoViewer');
    m.runLocoViewer(params);
    return;
  }
  const m = await import('./game');
  await m.startGame(params);
}
boot().catch((e) => {
  console.error(e);
  const d = document.createElement('pre');
  d.style.cssText = 'color:#f66;position:fixed;left:10px;top:10px;white-space:pre-wrap;font:12px monospace;z-index:99';
  d.textContent = String(e?.stack ?? e);
  document.body.appendChild(d);
});
