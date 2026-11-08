// STUB — replaced by the coach exterior module.
import * as THREE from 'three';
import { COACH } from '../core/constants.js';
export async function init(app) {
  const h = COACH.roofY - COACH.roadY - 0.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(COACH.width, h, COACH.length), new THREE.MeshStandardMaterial({ color: 0xe8f1ef, roughness: 0.35 }));
  body.position.y = COACH.roadY + 0.4 + h / 2;
  body.visible = false;
  app.aircraftRoot.add(body);
  const setV = (v) => { body.visible = v; };
  return { stub: true, setBodyVisible: setV, setFuselageVisible: setV };
}
