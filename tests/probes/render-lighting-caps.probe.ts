// Probe: engine caps relevant to lighting/shadows/post + default values of key classes.
import {
  Engine, Scene, Vector3, FreeCamera, HemisphericLight, PointLight, DirectionalLight, SpotLight, MeshBuilder,
  StandardMaterial, PBRMaterial, ClusteredLightContainer, CascadedShadowGenerator, ShadowGenerator,
  SSAO2RenderingPipeline, DefaultRenderingPipeline, SceneInstrumentation, EngineInstrumentation, GlowLayer,
  ImageProcessingConfiguration,
} from "@babylonjs/core";

export async function probe(): Promise<any> {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  const cam = new FreeCamera("c", new Vector3(0, 2, -6), scene);
  cam.setTarget(Vector3.Zero());
  const caps = engine.getCaps() as any;
  const feats = (engine as any)._features;
  const out: any = {
    webGLVersion: engine.webGLVersion,
    version: (engine as any).version,
    isWebGPU: engine.isWebGPU,
    caps: {
      maxTextureSize: caps.maxTextureSize,
      maxCubemapTextureSize: caps.maxCubemapTextureSize,
      maxRenderTextureSize: caps.maxRenderTextureSize,
      maxVertexUniformVectors: caps.maxVertexUniformVectors,
      maxFragmentUniformVectors: caps.maxFragmentUniformVectors,
      maxUniformBuffersPerShaderStage: caps.maxUniformBuffersPerShaderStage,
      maxMSAASamples: caps.maxMSAASamples,
      textureFloat: caps.textureFloat,
      textureFloatRender: caps.textureFloatRender,
      textureFloatLinearFiltering: caps.textureFloatLinearFiltering,
      textureHalfFloatRender: caps.textureHalfFloatRender,
      textureHalfFloatLinearFiltering: caps.textureHalfFloatLinearFiltering,
      colorBufferFloat: caps.colorBufferFloat,
      blendFloat: caps.blendFloat,
      texelFetch: caps.texelFetch,
      shaderFloatPrecision: caps.shaderFloatPrecision,
      drawBuffersExtension: caps.drawBuffersExtension,
      depthTextureExtension: caps.depthTextureExtension,
    },
    features: {
      supportCSM: feats.supportCSM,
      supportShadowSamplers: feats.supportShadowSamplers,
      supportDepthStencilTexture: feats.supportDepthStencilTexture,
    },
    isMobile: (engine as any).hostInformation?.isMobile,
    hardwareScaling: engine.getHardwareScalingLevel(),
    renderSize: [engine.getRenderWidth(), engine.getRenderHeight()],
  };

  // Defaults
  const std = new StandardMaterial("std", scene);
  const pbr = new PBRMaterial("pbr", scene);
  out.defaults = {
    stdMaxSimultaneousLights: std.maxSimultaneousLights,
    pbrMaxSimultaneousLights: pbr.maxSimultaneousLights,
    clustered: {} as any,
  };
  const pl = new PointLight("pl", new Vector3(0, 2, 0), scene);
  out.defaults.pointLight = { range: pl.range, radius: pl.radius, falloffType: pl.falloffType, intensity: pl.intensity, intensityMode: pl.intensityMode, shadowEnabled: pl.shadowEnabled };
  const dl = new DirectionalLight("dl", new Vector3(-1, -0.3, 0.5), scene);
  out.defaults.directional = { autoUpdateExtends: dl.autoUpdateExtends, autoCalcShadowZBounds: dl.autoCalcShadowZBounds, shadowFrustumSize: dl.shadowFrustumSize, shadowOrthoScale: dl.shadowOrthoScale, shadowMinZ: dl.shadowMinZ, shadowMaxZ: dl.shadowMaxZ, position: dl.position.asArray() };
  const sl = new SpotLight("sl", new Vector3(0, 2, 0), new Vector3(0, -1, 0), Math.PI / 3, 2, scene);
  out.defaults.spot = { angle: sl.angle, exponent: sl.exponent, innerAngle: sl.innerAngle };
  const hemi = new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  out.defaults.hemi = { intensity: hemi.intensity, groundColor: hemi.groundColor.asArray() };

  // Clustered container support
  const clc = new ClusteredLightContainer("clc", [], scene);
  out.defaults.clustered = {
    isSupported: clc.isSupported,
    batchSize: (clc as any)._batchSize,
    horizontalTiles: clc.horizontalTiles,
    verticalTiles: clc.verticalTiles,
    depthSlices: clc.depthSlices,
    maxRange: clc.maxRange,
    IsLightSupported_point: ClusteredLightContainer.IsLightSupported(pl),
    IsLightSupported_spot: ClusteredLightContainer.IsLightSupported(sl),
    IsLightSupported_dir: ClusteredLightContainer.IsLightSupported(dl),
  };

  // Shadow generators
  out.csmIsSupported = CascadedShadowGenerator.IsSupported;
  const sg = new ShadowGenerator(1024, sl);
  out.defaults.shadowGenerator = { bias: sg.bias, normalBias: sg.normalBias, darkness: sg.darkness, filter: sg.filter, filteringQuality: sg.filteringQuality, frustumEdgeFalloff: sg.frustumEdgeFalloff, mapSize: sg.mapSize, textureType: (sg as any)._textureType, refreshRate: sg.getShadowMap()!.refreshRate, transparencyShadow: sg.transparencyShadow, forceBackFacesOnly: sg.forceBackFacesOnly };
  const csm = new CascadedShadowGenerator(1024, dl);
  out.defaults.csm = { numCascades: csm.numCascades, lambda: csm.lambda, stabilizeCascades: csm.stabilizeCascades, shadowMaxZ: csm.shadowMaxZ, cascadeBlendPercentage: csm.cascadeBlendPercentage, depthClamp: csm.depthClamp, autoCalcDepthBounds: csm.autoCalcDepthBounds, filter: csm.filter, usePCF: csm.usePercentageCloserFiltering, filteringQuality: csm.filteringQuality, penumbraDarkness: csm.penumbraDarkness, bias: csm.bias, normalBias: csm.normalBias, darkness: csm.darkness, useRedTextureType: (csm as any)._useRedTextureType };
  const pointSg = new ShadowGenerator(512, pl);
  pointSg.usePercentageCloserFiltering = true;
  out.defaults.pointShadowPCFRequest = { filterAfterSettingPCF: pointSg.filter, usePoisson: pointSg.usePoissonSampling, isCube: pointSg.getShadowMap()!.isCube };
  pointSg.dispose();
  csm.dispose();
  sg.dispose();

  // Pipelines
  out.ssao2IsSupported = SSAO2RenderingPipeline.IsSupported;
  const drp = new DefaultRenderingPipeline("drp", true, scene, [cam]);
  out.defaults.drp = {
    samples: drp.samples, fxaaEnabled: drp.fxaaEnabled, bloomEnabled: drp.bloomEnabled, bloomThreshold: drp.bloomThreshold,
    bloomWeight: drp.bloomWeight, bloomKernel: drp.bloomKernel, bloomScale: drp.bloomScale, imageProcessingEnabled: drp.imageProcessingEnabled,
    sharpenEnabled: drp.sharpenEnabled, grainEnabled: drp.grainEnabled, grainIntensity: drp.grain.intensity, grainAnimated: drp.grain.animated,
    chromaticAberrationEnabled: drp.chromaticAberrationEnabled, caAmount: drp.chromaticAberration.aberrationAmount,
    depthOfFieldEnabled: drp.depthOfFieldEnabled, glowLayerEnabled: drp.glowLayerEnabled,
    sharpenEdge: drp.sharpen.edgeAmount, sharpenColor: drp.sharpen.colorAmount,
    hdrTextureType: (drp as any)._defaultPipelineTextureType,
  };
  const ip = scene.imageProcessingConfiguration;
  out.defaults.imageProcessing = {
    isEnabled: ip.isEnabled, applyByPostProcess: ip.applyByPostProcess, toneMappingEnabled: ip.toneMappingEnabled, toneMappingType: ip.toneMappingType,
    ACES: ImageProcessingConfiguration.TONEMAPPING_ACES, NEUTRAL: ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
    exposure: ip.exposure, contrast: ip.contrast, vignetteEnabled: ip.vignetteEnabled, vignetteWeight: ip.vignetteWeight, vignetteStretch: ip.vignetteStretch,
    vignetteCameraFov: ip.vignetteCameraFov, vignetteColor: ip.vignetteColor.asArray(), ditheringEnabled: ip.ditheringEnabled, ditheringIntensity: ip.ditheringIntensity,
    whiteBalanceEnabled: ip.whiteBalanceEnabled, temperature: ip.temperature, tint: ip.tint,
  };
  out.cameraPostProcesses = cam._postProcesses.map((p) => p?.name + ":" + p?.getClassName());

  const gl = new GlowLayer("glow", scene);
  out.defaults.glow = { intensity: gl.intensity, blurKernelSize: gl.blurKernelSize, mainTextureRatio: (gl as any)._options?.mainTextureRatio };
  gl.dispose();

  // Fog defaults
  out.defaults.fog = { fogMode: scene.fogMode, fogDensity: scene.fogDensity, fogStart: scene.fogStart, fogEnd: scene.fogEnd, NONE: Scene.FOGMODE_NONE, EXP: Scene.FOGMODE_EXP, EXP2: Scene.FOGMODE_EXP2, LINEAR: Scene.FOGMODE_LINEAR, stdFogEnabled: std.fogEnabled };

  // Instrumentation
  const si = new SceneInstrumentation(scene);
  si.captureFrameTime = true;
  si.captureRenderTime = true;
  si.captureActiveMeshesEvaluationTime = true;
  si.captureRenderTargetsRenderTime = true;
  si.captureCameraRenderTime = true;
  const ei = new EngineInstrumentation(engine);
  ei.captureGPUFrameTime = true;
  ei.captureShaderCompilationTime = true;
  MeshBuilder.CreateBox("b", { size: 1 }, scene).material = std;
  MeshBuilder.CreateSphere("s", { diameter: 1 }, scene).material = pbr;
  await scene.whenReadyAsync();
  for (let i = 0; i < 10; i++) scene.render();
  out.instr = {
    drawCallsCurrent: si.drawCallsCounter.current,
    frameTimeAvg: si.frameTimeCounter.average,
    renderTimeAvg: si.renderTimeCounter.average,
    activeMeshesEvalAvg: si.activeMeshesEvaluationTimeCounter.average,
    rttTimeAvg: si.renderTargetsRenderTimeCounter.average,
    cameraRenderAvg: si.cameraRenderTimeCounter.average,
    gpuFrameTimeCurrent: ei.gpuFrameTimeCounter.current,
    gpuFrameTimeAvg: ei.gpuFrameTimeCounter.average,
    shaderCompileTotal: ei.shaderCompilationTimeCounter.total,
    shaderCompileCount: ei.shaderCompilationTimeCounter.count,
    fpsAfterManualRender: engine.getFps(),
    deltaTime: engine.getDeltaTime(),
    activeMeshes: scene.getActiveMeshes().length,
    activeIndices: scene.getActiveIndices(),
    totalVertices: scene.getTotalVertices(),
    capturePhysicsTimeWithoutPhysics: (() => { si.capturePhysicsTime = true; return si.capturePhysicsTime; })(),
  };
  // run the real render loop for ~1s to see getFps
  await new Promise<void>((resolve) => {
    let n = 0;
    engine.runRenderLoop(() => { scene.render(); if (++n >= 40) { engine.stopRenderLoop(); resolve(); } });
  });
  out.instr.fpsAfterRunRenderLoop = engine.getFps();
  out.instr.deltaTimeAfterLoop = engine.getDeltaTime();
  out.instr.drawCallsAfterLoop = si.drawCallsCounter.current;
  out.instr.frameTimeLastSecAvg = si.frameTimeCounter.lastSecAverage;
  return out;
}
