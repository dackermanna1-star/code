// "Bank Heist": rob the First Robloxia Bank. Plan the job and pick your crew,
// mask up, control the hostages, crack the vault gate, drill the vault door,
// bag the cash and gold, fight your way out to the van and lose the cops on
// the highway. A user-made place in this 2008 ROBLOX (it uses its own GUI and
// modern effects on purpose), built on Desert Strike's guns.
import * as THREE from 'three';
import { buildBank } from './map.js';
import { buildCity } from './city.js';
import { envMap } from './models.js';
import { S } from './state.js';
import { setupHeist, updateHeist } from './mission.js';

function citySky() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#3a6eb8'); g.addColorStop(0.3, '#7aa4d8'); g.addColorStop(0.47, '#d8dce0'); g.addColorStop(0.5, '#c8c4bc'); g.addColorStop(1, '#8a8478');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 24; i++) { x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.ellipse(Math.random() * 1024, 90 + Math.random() * 120, 60 + Math.random() * 120, 10 + Math.random() * 14, 0, 0, 7); x.fill(); }
  const sg = x.createRadialGradient(700, 80, 0, 700, 80, 80); sg.addColorStop(0, 'rgba(255,255,240,1)'); sg.addColorStop(0.15, 'rgba(255,250,225,0.8)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
  x.fillStyle = sg; x.fillRect(0, 0, 1024, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default {
  build(world, ctx = {}) {
    envMap(world.renderer);
    const bank = buildBank(world);
    const city = buildCity(world);
    world.setSky(citySky());
    world.scene.fog = new THREE.Fog(0xc8ccd0, 400, 2600);
    world.ambient.color.set(0xe8eef8); world.ambient.groundColor.set(0x8a8478); world.ambient.intensity = 1.1;
    world.sun.color.set(0xfff4e4); world.sun.intensity = 2.4;
    world.fill.intensity = 0.3;
    if (!ctx.thumbnail) {
      world.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      world.renderer.toneMappingExposure = 1.05;
    }
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, { bank, city });
    return { thumbnail: bank.thumbnail };
  },
  setup(game, ctx) { setupHeist(game, ctx); },
  update(game, dt) { updateHeist(game, dt); },
  onExit(game, close) { S.onExit ? S.onExit(close) : close(); },
};
