// Procedural helicopter with spinning rotors, searchlight and path animation.
import * as THREE from 'three';

export class Helicopter {
  constructor(game, o = {}) {
    this.game = game;
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: o.color ?? 0x2a3a4a, roughness: 0.45, metalness: 0.5 });
    const stripe = new THREE.MeshStandardMaterial({ color: o.stripe ?? 0xd8d8d0, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
    // fuselage (capsule-ish)
    const fus = add(new THREE.CapsuleGeometry(1.25, 3.2, 8, 16), body, 0, 1.6, 0, Math.PI / 2, 0, 0);
    fus.scale.set(1, 1, 0.95);
    add(new THREE.SphereGeometry(1.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.75, -2.2, -Math.PI / 2, 0, 0).scale.set(0.95, 0.9, 0.8);
    add(new THREE.BoxGeometry(2.3, 0.3, 4.2), stripe, 0, 1.05, 0.2);
    // tail boom
    add(new THREE.CylinderGeometry(0.22, 0.45, 6.5, 10), body, 0, 2.1, 5.2, Math.PI / 2 - 0.06, 0, 0);
    add(new THREE.BoxGeometry(0.15, 1.6, 1.0), body, 0, 2.8, 8.3, 0.3, 0, 0);
    add(new THREE.BoxGeometry(1.8, 0.1, 0.6), body, 0, 2.2, 7.6);
    // skids
    for (const sx of [-1.05, 1.05]) {
      add(new THREE.CylinderGeometry(0.06, 0.06, 4.6, 8), dark, sx, 0.1, 0, Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), dark, sx * 0.85, 0.55, -1.2, 0, 0, sx * 0.3);
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), dark, sx * 0.85, 0.55, 1.2, 0, 0, sx * 0.3);
    }
    // mast + rotor
    add(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 8), dark, 0, 3.05, 0);
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 3.4, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 6.2), bladeMat);
      b.position.z = 3.1;
      const piv = new THREE.Group(); piv.rotation.y = i * Math.PI / 2; piv.add(b);
      this.rotor.add(piv);
    }
    // motion blur disc
    const disc = new THREE.Mesh(new THREE.CircleGeometry(6.3, 32), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    this.rotor.add(disc);
    g.add(this.rotor);
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(0.25, 2.9, 8.4);
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.15), bladeMat); b.rotation.x = i * Math.PI / 2; this.tailRotor.add(b); }
    g.add(this.tailRotor);
    // lights
    this.navRed = add(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2010 }), -1.2, 1.3, -0.5);
    this.navGreen = add(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0x20ff40 }), 1.2, 1.3, -0.5);
    this.beacon = add(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3020 }), 0, 3.3, 1.0);
    // landing lights + lit cabin so the chopper reads at night
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff4d8 });
    this.lamps = [add(new THREE.SphereGeometry(0.14, 8, 6), lamp, -0.5, 0.75, -2.3), add(new THREE.SphereGeometry(0.14, 8, 6), lamp, 0.5, 0.75, -2.3)];
    add(new THREE.BoxGeometry(2.2, 0.9, 1.6), new THREE.MeshBasicMaterial({ color: 0x6a7058 }), 0, 1.65, 0.4).scale.set(1, 1, 1);
    for (const sx of [-1.21, 1.21]) add(new THREE.PlaneGeometry(1.5, 0.7), new THREE.MeshBasicMaterial({ color: 0xc8c090, side: THREE.DoubleSide }), sx, 1.85, 0.1, 0, Math.PI / 2, 0);
    // searchlight
    this.spot = new THREE.SpotLight(0xf0f4ff, 0, 90, 0.22, 0.4, 1.0);
    this.spot.position.set(0, 0.6, -2.6);
    g.add(this.spot);
    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, -20, -10);
    g.add(this.spotTarget);
    this.spot.target = this.spotTarget;
    // volumetric beam cone
    const coneGeo = new THREE.ConeGeometry(4.5, 30, 24, 1, true);
    coneGeo.translate(0, -15, 0);
    this.beam = new THREE.Mesh(coneGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(0.6, 0.65, 0.7) }, strength: { value: 0.22 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 color; uniform float strength; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - clamp(-vY/30.0,0.0,1.0); float r = pow(abs(dot(vN,vV)),1.5); gl_FragColor = vec4(color*strength*f*r,1.0); }',
    }));
    this.beamPivot = new THREE.Group();
    this.beamPivot.position.copy(this.spot.position);
    this.beamPivot.add(this.beam);
    g.add(this.beamPivot);
    this.group = g;
    g.visible = false;
    game.scene.add(g);
    this.path = null;
    this.t = 0;
    this.sound = null;
    this.searchOn = false;
  }
  setSearchlight(on) {
    this.searchOn = on;
    this.spot.intensity = on ? 900 : 0;
    this.beamPivot.visible = on;
  }
  // path: [{x,y,z,t}] keyframes (time seconds), yaw faces movement
  fly(path, opts = {}) {
    this.path = path;
    this.t = 0;
    this.group.visible = true;
    this.opts = opts;
    if (!this.sound) this.sound = this.game.audio.loop('helicopter', { pos: this.group.position, vol: 1.2 });
  }
  hover(x, y, z, yaw = 0) {
    this.path = null;
    this.group.visible = true;
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, yaw, 0);
    if (!this.sound) this.sound = this.game.audio.loop('helicopter', { pos: this.group.position, vol: 1.2 });
  }
  hide() {
    this.group.visible = false;
    if (this.vLight) this.vLight.on = false;
    this.path = null;
    if (this.sound) { this.sound.stop(2); this.sound = null; }
  }
  update(dt) {
    if (!this.group.visible) return;
    const g = this.game;
    this.rotor.rotation.y += dt * 28;
    this.tailRotor.rotation.x += dt * 40;
    const blink = Math.sin(g.time * 6) > 0.6;
    this.beacon.visible = blink;
    if (this.path) {
      this.t += dt;
      const P = this.path;
      let i = 0;
      while (i < P.length - 2 && this.t > P[i + 1].t) i++;
      const a = P[i], b = P[i + 1];
      const k = Math.min(1, Math.max(0, (this.t - a.t) / (b.t - a.t)));
      const s = k * k * (3 - 2 * k);
      const x = a.x + (b.x - a.x) * s, y = a.y + (b.y - a.y) * s, z = a.z + (b.z - a.z) * s;
      const dx = b.x - a.x, dz = b.z - a.z;
      const yaw = Math.atan2(-dx, -dz);
      this.group.position.set(x, y + Math.sin(g.time * 1.3) * 0.2, z);
      this.group.rotation.y += (((yaw - this.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 2);
      this.group.rotation.x = -0.12 * Math.min(1, Math.hypot(dx, dz) / Math.max(1, b.t - a.t) / 15);
      if (this.t > P[P.length - 1].t) {
        if (this.opts?.onEnd) this.opts.onEnd();
        if (this.opts?.hideAtEnd) this.hide(); else this.path = null;
      }
    } else {
      this.group.position.y += Math.sin(g.time * 1.3) * 0.004;
      this.group.rotation.z = Math.sin(g.time * 0.7) * 0.02;
    }
    if (this.searchOn) {
      // sweep the searchlight
      const sw = Math.sin(g.time * 0.5) * 0.5;
      this.spotTarget.position.set(Math.sin(g.time * 0.37) * 12, -25, -10 + sw * 10);
      this.beamPivot.lookAt(this.spotTarget.getWorldPosition(new THREE.Vector3()));
      this.beamPivot.rotateX(-Math.PI / 2);
    }
    if (this.sound) this.sound.set({ pos: this.group.position });
    // level virtual light following the airframe (see attachLight)
    if (this.vLight) {
      const p = this.group.position;
      this.vLight.x = p.x; this.vLight.y = p.y - 0.5; this.vLight.z = p.z;
      this.vLight.on = true;
    }
  }
  attachLight(v) { this.vLight = v; v.on = false; }
  dispose() {
    this.hide();
    this.game.scene.remove(this.group);
  }
}
