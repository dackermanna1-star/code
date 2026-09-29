import * as THREE from 'three';
import { Geo } from '../world/Builder';
import { canvasTexture, FONT_DISPLAY } from '../render/CanvasTex';

const decals = new Map<number, THREE.MeshStandardMaterial>();

/** Round "🔒 RANK n" sticker lying flat (+y up), shared per rank. */
export function lockDecal(rank: number, size = 0.12): THREE.Mesh {
  let mat = decals.get(rank);
  if (!mat) {
    const tex = canvasTexture(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#2a1d16';
      c.beginPath();
      c.arc(w / 2, h / 2, 46, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffd35a';
      c.font = `700 30px ${FONT_DISPLAY}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('🔒', w / 2, h / 2 - 8);
      c.font = `700 20px ${FONT_DISPLAY}`;
      c.fillText(`RANK ${rank}`, w / 2, h / 2 + 22);
    });
    mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6 });
    decals.set(rank, mat);
  }
  const m = new THREE.Mesh(Geo.plane(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}
