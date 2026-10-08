// Place registry: the playable places and the thumbnail renderer that uses
// the same builders.
import * as THREE from 'three';
import { World } from '../engine/World.js';
import { buildTheme } from './themes.js';

export const PLACES = {
  teapots: () => import('./teapots.js'),
  paintball: () => import('./paintball.js'),
  obby: () => import('./obby.js'),
  mummy: () => import('./mummy.js'),
  crossroads: () => import('./crossroads.js'),
  personal: () => import('./personal.js'),
  warzone: () => import('./warzone/index.js'),
  heist: () => import('./heist/index.js'),
  disasters: () => import('./disasters/index.js'),
  megaobby: () => import('./megaobby/index.js'),
  hotel: () => import('./hotel/index.js'),
  elevator: () => import('./elevator/index.js'),
  outbreak: () => import('./outbreak/index.js'),
  ragdoll: () => import('./ragdoll/index.js'),
};

export async function loadPlace(script) {
  const loader = PLACES[script];
  if (!loader) throw new Error('Unknown place ' + script);
  return (await loader()).default;
}

/** Render a place thumbnail (2008 place thumbnails were in-game screenshots). */
export async function renderPlaceThumbnail(renderer, data, w, h) {
  // a place too big to build just for its picture brings one with it
  if (data.script && PLACES[data.script]) {
    const place = await loadPlace(data.script);
    if (place.thumbnailImage) return fitImage(place.thumbnailImage, w, h);
  }
  const world = new World(null, { renderer });
  let view;
  if (data.script && PLACES[data.script]) {
    const place = await loadPlace(data.script);
    const built = place.build(world, { theme: data.theme, thumbnail: true, build: data.build });
    view = built?.thumbnail || place.thumbnail;
  } else {
    view = buildTheme(world, data.theme, data.name || '');
  }
  view = view || { cam: [30, 20, -30], look: [0, 0, 0] };
  world.camera.fov = 70;
  world.camera.aspect = w / h;
  world.camera.updateProjectionMatrix();
  world.camera.position.set(...view.cam);
  world.camera.lookAt(new THREE.Vector3(...view.look));
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 1);
  // make sure dynamic parts are where the builder put them
  for (const p of world.dynamicParts) p.syncFromBody();
  if (world.skyMesh) world.skyMesh.position.copy(world.camera.position);
  renderer.render(world.scene, world.camera);
  return renderer.domElement.toDataURL('image/png');
}

/** An image URL drawn to fill w x h (cropped to fit), as a PNG data URL. */
function fitImage(src, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const k = Math.max(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
      c.getContext('2d').drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });
}
