import * as THREE from 'three';

/**
 * Stylized procedural sky dome: gradient + sun/moon disc + soft animated
 * clouds + stars at night. Driven by the TimeOfDay system.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.5).normalize() },
    uZenith: { value: new THREE.Color(0x3d7fd6) },
    uHorizon: { value: new THREE.Color(0xbfe0ff) },
    uGround: { value: new THREE.Color(0x6b6259) },
    uSunColor: { value: new THREE.Color(0xfff2d0) },
    uSunSize: { value: 1.0 },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uCloudTint: { value: new THREE.Color(0xffffff) },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
        uniform vec3 uSunColor; uniform float uSunSize; uniform float uNight; uniform float uTime; uniform vec3 uCloudTint;
        varying vec3 vDir;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.55));
          col = mix(col, uGround, smoothstep(0.0, -0.08, y));
          // horizon glow near the sun
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(sd, 8.0) * 0.35 * (1.0 - uNight * 0.7);
          col += uSunColor * pow(sd, 64.0) * 0.6;
          // sun / moon disc
          float disc = smoothstep(0.9994 - 0.0004 * uSunSize, 0.9997, sd);
          col = mix(col, uSunColor * 3.0, disc);
          // clouds on a dome projection
          if (y > 0.0) {
            vec2 uv = d.xz / (y + 0.25) * 1.4;
            uv += vec2(uTime * 0.004, uTime * 0.0015);
            float c = fbm(uv * 1.3);
            c = smoothstep(0.52, 0.8, c);
            float shade = fbm(uv * 1.3 + 0.35);
            vec3 cc = mix(uCloudTint, uCloudTint * 0.7, smoothstep(0.4, 0.8, shade));
            cc += uSunColor * pow(sd, 4.0) * 0.25;
            col = mix(col, cc, c * smoothstep(0.0, 0.18, y) * 0.85);
            // stars (3D cell hash -> round points)
            vec3 cell = floor(d * 220.0);
            vec3 fc = fract(d * 220.0) - 0.5;
            float hs = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
            float st = step(0.9965, hs) * smoothstep(0.35, 0.0, length(fc)) * smoothstep(0.08, 0.35, y);
            float tw = 0.6 + 0.4 * sin(uTime * 3.0 + hs * 60.0);
            col += vec3(st * tw * uNight * (1.0 - c) * 1.6);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
}
