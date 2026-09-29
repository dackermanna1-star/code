import * as THREE from 'three';
import { Engine } from './core/Engine';
import { TextureBaker } from './render/TextureBaker';
import { MaterialLib } from './world/Materials';
import { Restaurant } from './world/Restaurant';
import { CameraRig, shot } from './core/CameraRig';
import { FoodKit } from './food/FoodKit';
import { buildFoodGallery } from './debug/FoodGallery';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';

const VIEWS: Record<string, ReturnType<typeof shot>> = {
  order: shot([-1.0, 1.62, -2.1], [0.2, 1.15, 3.0], 50),
  grill: shot([-3.0, 2.05, -4.25], [-3.0, 0.92, -5.62], 45),
  build: shot([-0.28, 2.1, -4.25], [-0.28, 0.93, -5.55], 45),
  serve: shot([2.2, 1.55, -2.25], [2.2, 1.25, 0.0], 42),
  exterior: shot([-2.5, 1.8, 14.5], [0.4, 2.6, 6], 48),
  overview: shot([0, 9, 9], [0, 0, 0], 55),
  kitchen: shot([2.5, 2.4, -1.8], [-2, 0.9, -5.5], 55),
  dining: shot([5.5, 1.7, -0.2], [-3, 1.0, 4], 60),
  food: shot([-0.3, 1.45, -4.75], [-0.3, 0.97, -5.5], 45),
  foodClose: shot([-0.45, 1.13, -5.05], [-0.4, 1.0, -5.45], 38),
};

async function boot() {
  await document.fonts.load('700 40px "Fredoka Variable"');
  await document.fonts.load('600 20px "Nunito Variable"');
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const engine = new Engine(canvas, (params.get('q') as any) || 'high');
  engine.autoQuality = false;
  const baker = new TextureBaker(engine.renderer);
  const mats = new MaterialLib(baker);
  const t0 = performance.now();
  const r = new Restaurant(engine, mats);
  console.log('world built in', (performance.now() - t0).toFixed(0), 'ms');
  if (params.get('food')) {
    const kit = new FoodKit(baker);
    buildFoodGallery(kit, engine.scene, new THREE.Vector3(-0.3, 0.935, -5.45));
  }
  const view = VIEWS[params.get('view') || 'order'];
  const rig = new CameraRig(engine.camera, view);
  const hour = parseFloat(params.get('hour') || '12');
  r.setHour(hour, 0);
  engine.onUpdate((dt, t) => {
    r.update(dt, t);
    r.hour = hour;
    rig.update(dt);
  });
  engine.start();
  (window as any).__engine = engine;
  setTimeout(() => {
    const info = engine.renderer.info;
    console.log('calls', info.render.calls, 'tris', info.render.triangles, 'geos', info.memory.geometries, 'tex', info.memory.textures, 'programs', info.programs?.length);
  }, 3000);
}
boot();
