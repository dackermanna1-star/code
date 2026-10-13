import * as THREE from 'three';
import { mulberry32 } from '../../shared/math';
import { daylight, sunElevation } from '../../shared/sim/time';

/**
 * Sky dome with day/night gradient, square sun & moon, stars and a blocky
 * cloud layer. Exposes colours used for fog and world lighting.
 */
export class Sky {
  readonly group = new THREE.Group();
  readonly horizon = new THREE.Color();
  readonly zenith = new THREE.Color();
  readonly skyTint = new THREE.Color();
  daylight = 1;
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private clouds: THREE.Mesh;
  private cloudTex: THREE.DataTexture;

  constructor() {
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; varying vec3 vDir;
        void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y,0.0,1.0), 0.6)) : mix(uHorizon, uBottom, clamp(-y*3.0,0.0,1.0)); gl_FragColor = vec4(c,1.0); }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff4c8, fog: false, depthWrite: false });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), sunMat);
    const moonTex = this.moonTexture();
    const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true });
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), moonMat);
    for (const m of [this.sun, this.moon]) {
      m.renderOrder = -9;
      m.frustumCulled = false;
      this.group.add(m);
    }

    const rnd = mulberry32(7);
    const pts: number[] = [];
    for (let i = 0; i < 900; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      if (u < -0.1) continue;
      pts.push(Math.cos(th) * r * 450, u * 450, Math.sin(th) * r * 450);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    this.cloudTex = this.makeCloudTexture();
    const cm = new THREE.MeshBasicMaterial({ map: this.cloudTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity: 0.85 });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1536, 1536), cm);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 5;
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);
  }

  private moonTexture() {
    const s = 16;
    const d = new Uint8Array(s * s * 4);
    const rnd = mulberry32(3);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const v = 200 + rnd() * 40 - (Math.hypot(x - 5, y - 6) < 2 || Math.hypot(x - 10, y - 10) < 2.5 ? 50 : 0);
      d[i] = v; d[i + 1] = v; d[i + 2] = v + 10; d[i + 3] = 255;
    }
    const t = new THREE.DataTexture(d, s, s);
    t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }

  private makeCloudTexture() {
    const s = 128;
    const d = new Uint8Array(s * s * 4);
    const rnd = mulberry32(11);
    // value-noise blobs on a coarse grid, thresholded => blocky clouds
    const g = 16, grid: number[] = [];
    for (let i = 0; i < g * g; i++) grid.push(rnd());
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const gx = (x / s) * g, gy = (y / s) * g;
      const x0 = Math.floor(gx) % g, y0 = Math.floor(gy) % g, x1 = (x0 + 1) % g, y1 = (y0 + 1) % g;
      const tx = gx - Math.floor(gx), ty = gy - Math.floor(gy);
      const v = (grid[y0 * g + x0] * (1 - tx) + grid[y0 * g + x1] * tx) * (1 - ty) + (grid[y1 * g + x0] * (1 - tx) + grid[y1 * g + x1] * tx) * ty;
      const on = v + (rnd() - 0.5) * 0.04 > 0.62;
      const i = (y * s + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = on ? 220 : 0;
    }
    const t = new THREE.DataTexture(d, s, s);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    t.needsUpdate = true;
    return t;
  }

  update(phase: number, nightFraction: number, weather: number, cam: THREE.Vector3, time: number) {
    const elev = sunElevation(phase, nightFraction);
    this.daylight = daylight(phase, nightFraction) * (1 - weather * 0.35);
    const day = new THREE.Color(0x7fb2ff), dusk = new THREE.Color(0xf08a4b), night = new THREE.Color(0x0b1026), storm = new THREE.Color(0x6a7280);
    const t = Math.max(0, Math.min(1, elev * 3 + 0.5));
    const duskAmt = Math.max(0, 1 - Math.abs(elev) * 5);
    this.zenith.copy(night).lerp(new THREE.Color(0x3d7ae0), t);
    this.horizon.copy(night).lerp(day, t).lerp(dusk, duskAmt * 0.6);
    this.horizon.lerp(storm, weather * 0.6 * t);
    this.zenith.lerp(storm, weather * 0.5 * t);
    this.skyTint.setRGB(1, 1, 1).lerp(new THREE.Color(1.0, 0.75, 0.55), duskAmt * 0.5).lerp(new THREE.Color(0.55, 0.6, 0.9), 1 - t);
    this.domeMat.uniforms.uTop.value.copy(this.zenith);
    this.domeMat.uniforms.uHorizon.value.copy(this.horizon);
    this.domeMat.uniforms.uBottom.value.copy(this.horizon).multiplyScalar(0.6);
    this.group.position.copy(cam);
    // sun travels east->west over the day arc
    const dayLen = 1 - nightFraction;
    const ang = phase < dayLen ? (phase / dayLen) * Math.PI : Math.PI + ((phase - dayLen) / nightFraction) * Math.PI;
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.25).normalize();
    this.sun.position.copy(dir).multiplyScalar(400);
    this.moon.position.copy(dir).multiplyScalar(-400);
    this.group.updateMatrixWorld();
    this.sun.lookAt(cam);
    this.moon.lookAt(cam);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, Math.min(1, -elev * 4)) * (1 - weather);
    this.clouds.position.set(0, 128 - cam.y, 0);
    const cm = this.clouds.material as THREE.MeshBasicMaterial;
    cm.color.copy(this.horizon).lerp(new THREE.Color(1, 1, 1), 0.6 * t).lerp(new THREE.Color(0.35, 0.37, 0.42), weather);
    cm.opacity = 0.7 + weather * 0.25;
    this.cloudTex.offset.set((cam.x / 1536 + time * 0.0008) % 1, (-cam.z / 1536) % 1);
    return dir;
  }
}
