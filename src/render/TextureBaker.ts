import * as THREE from 'three';
import { GLSL_COMMON } from './glsl';

/**
 * GPU procedural texture baker.
 *
 * A recipe is a GLSL snippet that implements
 *   void surface(vec2 uv, out vec3 color, out float height, out float rough, out float metal, out float ao)
 * Colors are authored in sRGB. The baker renders the recipe on the GPU, reads
 * the pixels back once and turns them into regular DataTextures: an albedo
 * (sRGB), a tangent-space normal map (derived from `height`) and an ORM map
 * (R = AO, G = roughness, B = metalness). Mipmaps + anisotropy included.
 */
export interface SurfaceRecipe {
  name: string;
  glsl: string;
  size?: number;
  /** Seamless (RepeatWrapping). Recipes must use periodic noise for this. */
  repeat?: boolean;
  /** normal map strength (height gradient multiplier) */
  normalStrength?: number;
  uniforms?: Record<string, THREE.IUniform>;
  /** skip normal / orm generation */
  albedoOnly?: boolean;
  /** Keep an alpha channel in the albedo (color alpha written from `ao` output < 0 means use 1) */
  alpha?: boolean;
}

export interface BakedSurface {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  ormMap?: THREE.Texture;
}

const VERT = /* glsl */ `
out vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export class TextureBaker {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private maxAniso: number;
  private cache = new Map<string, BakedSurface>();
  private rts = new Map<number, THREE.WebGLRenderTarget>();
  /** baked textures still holding their pixels in JS memory */
  private pending: THREE.DataTexture[] = [];

  constructor(private renderer: THREE.WebGLRenderer) {
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  bake(recipe: SurfaceRecipe): BakedSurface {
    const cached = this.cache.get(recipe.name);
    if (cached) return cached;
    const size = recipe.size ?? 512;
    const out: BakedSurface = {
      map: this.pass(recipe, size, 'ALBEDO'),
    };
    if (!recipe.albedoOnly) {
      out.normalMap = this.pass(recipe, size, 'NORMAL');
      out.ormMap = this.pass(recipe, size, 'ORM');
    }
    this.cache.set(recipe.name, out);
    return out;
  }

  private target(size: number): THREE.WebGLRenderTarget {
    let rt = this.rts.get(size);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(size, size, {
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
      this.rts.set(size, rt);
    }
    return rt;
  }

  private pass(recipe: SurfaceRecipe, size: number, mode: 'ALBEDO' | 'NORMAL' | 'ORM'): THREE.Texture {
    const rt = this.target(size);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform float uTexel;
        uniform float uNormalStrength;
        ${GLSL_COMMON}
        ${recipe.glsl}
        void main(){
          vec2 uv = vUv;
          vec3 color; float h; float r; float m; float ao;
          surface(uv, color, h, r, m, ao);
          #if defined(MODE_ALBEDO)
            fragColor = vec4(saturate3(color), ${recipe.alpha ? 'saturate(ao)' : '1.0'});
          #elif defined(MODE_NORMAL)
            vec3 c2; float h1, h2, h3, h4; float d1, d2, d3;
            float e = uTexel;
            surface(uv + vec2(e, 0.0), c2, h1, d1, d2, d3);
            surface(uv - vec2(e, 0.0), c2, h2, d1, d2, d3);
            surface(uv + vec2(0.0, e), c2, h3, d1, d2, d3);
            surface(uv - vec2(0.0, e), c2, h4, d1, d2, d3);
            vec3 n = normalize(vec3((h2 - h1) * uNormalStrength, (h4 - h3) * uNormalStrength, 2.0 * e * 256.0));
            fragColor = vec4(n * 0.5 + 0.5, 1.0);
          #else
            fragColor = vec4(${recipe.alpha ? '1.0' : 'saturate(ao)'}, saturate(r), saturate(m), 1.0);
          #endif
        }`,
      defines: { [`MODE_${mode}`]: '' },
      uniforms: {
        uTexel: { value: 1 / size },
        uNormalStrength: { value: recipe.normalStrength ?? 1.0 },
        ...(recipe.uniforms ?? {}),
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad.material = mat;
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this.scene, this.camera);
    const data = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, data);
    this.renderer.setRenderTarget(prevTarget);
    mat.dispose();

    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.name = `${recipe.name}_${mode}`;
    tex.colorSpace = mode === 'ALBEDO' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = recipe.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = this.maxAniso;
    tex.needsUpdate = true;
    this.pending.push(tex);
    return tex;
  }

  /**
   * Upload every baked texture now and drop its CPU-side pixels (tens of MB
   * of JS heap). Baked surfaces never change, so they are never re-uploaded;
   * clones made for repeats share the same GPU texture.
   */
  releaseCpuPixels(): number {
    let bytes = 0;
    for (const t of this.pending) {
      this.renderer.initTexture(t);
      const img = t.image as { data: Uint8Array | null };
      if (img.data) {
        bytes += img.data.byteLength;
        img.data = null;
      }
    }
    this.pending = [];
    return bytes;
  }

  /** Free intermediate render targets once loading is complete. */
  disposeTargets(): void {
    for (const rt of this.rts.values()) rt.dispose();
    this.rts.clear();
  }

  /** Build a MeshStandardMaterial / MeshPhysicalMaterial from a baked surface. */
  material(
    recipe: SurfaceRecipe,
    params: THREE.MeshPhysicalMaterialParameters & { physical?: boolean; repeat?: [number, number]; normalScale?: number } = {},
  ): THREE.MeshStandardMaterial {
    const s = this.bake(recipe);
    const { physical, repeat, normalScale, ...rest } = params;
    const Ctor = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const mat = new Ctor({
      map: s.map,
      normalMap: s.normalMap ?? null,
      roughnessMap: s.ormMap ?? null,
      metalnessMap: s.ormMap ?? null,
      aoMap: recipe.alpha ? null : s.ormMap ?? null,
      aoMapIntensity: 1.0,
      roughness: 1,
      metalness: 1,
      ...rest,
    } as any);
    if (normalScale !== undefined) mat.normalScale.set(normalScale, normalScale);
    if (repeat) {
      const clone = (t: THREE.Texture | null) => {
        if (!t) return null;
        const c = t.clone(); // shares the GPU source
        c.repeat.set(repeat[0], repeat[1]);
        return c;
      };
      mat.map = clone(mat.map);
      mat.normalMap = clone(mat.normalMap);
      const orm = clone(mat.roughnessMap);
      mat.roughnessMap = orm;
      mat.metalnessMap = orm;
      if (mat.aoMap) mat.aoMap = orm;
    }
    return mat;
  }
}
