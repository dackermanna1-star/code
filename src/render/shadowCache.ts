// Layered cached shadow maps: one shadow light renders into TWO maps of identical size/format.
//
//   * the STATIC layer holds only the casters at rest; it is redrawn only where its content
//     changed (a resting caster started moving, came to rest, or was edited/removed): a few
//     texel rectangles per pass (the 2D map of the sun, or each face of a point light's cube);
//   * the LIVE map (the one materials sample, keyed by the light like any ShadowGenerator) is
//     rebuilt where something changed by a GPU copy of the static layer (blitFramebuffer:
//     depth, plus the colour distance for non-PCF cube maps) followed by only the MOVING casters.
//
// Babylon's own caching (REFRESHRATE_RENDER_ONCE) redraws a whole map with every caster as soon
// as anything moved: with a spinning ceiling fan that was 4 400 shadow draws per frame for an
// otherwise still apartment. Here the same frame costs a copy and a couple of draws.
//
// Mechanics: the static layer is a second ShadowGenerator on the same light, registered under a
// private key object instead of a camera, so materials never bind it (they look up the generator
// of the active camera or of `null`). A light's generators render in insertion order, so the
// static layer (created first) is always drawn before the live map in the same frame. Both maps
// keep refreshRate RENDER_ONCE and are armed by the owner; per pass, `getCustomRenderList` returns
// the casters to draw for the dirty region (empty for clean cube faces), and `onClearObservable`
// replaces Babylon's full clear with a scissored clear (static layer) or the copy (live map).
// A pass that Babylon aborts because an effect is not compiled yet (it resets the refresh
// counter) keeps its dirty region for the next frame. If the copy is unsupported (WebGL1/WebGPU
// or a GL error on the first copies) the layer degrades to plain full re-renders of the live map.

import { Color4, RenderTargetTexture, ShadowGenerator, type AbstractEngine, type AbstractMesh, type Camera, type Engine, type IShadowLight } from "@babylonjs/core";
import { ALL_CUBE_FACES, RectSet, emptyRect, type TexelRect } from "./env/shadowMath.ts";

/** Generator key of every static layer (never a camera: materials can never pick it up). */
export const STATIC_LAYER_KEY = { id: "staticShadowLayer", name: "staticShadowLayer", minZ: 0.05, maxZ: 100 } as unknown as Camera;

/** Is this generator a static layer (debug / perf tooling)? */
export function isStaticLayer(g: unknown): boolean {
  return (g as { _camera?: unknown } | null)?._camera === STATIC_LAYER_KEY;
}

/** Which casters a layer pass draws. */
export type CasterKind = "static" | "dynamic" | "all";

/**
 * Supplies the casters of one pass: `face` is the cube face (0 for 2D maps); `rects` the dirty
 * texel rectangles of that pass (null = all of it): casters overlapping any of them. Must append
 * to `out` (already emptied).
 */
export type CasterProvider = (kind: CasterKind, face: number, rects: RectSet | null, out: AbstractMesh[]) => void;

export interface LayeredShadowOptions {
  /** Shadow map resolution (texels per side / per cube face). */
  size: number;
  /** Use the static layer + copy (false: the live map alone, redrawn with every caster). */
  layered: boolean;
  /** Called on both generators right after creation (filter, bias, culling ...). */
  configure: (gen: ShadowGenerator) => void;
  provider: CasterProvider;
}

export interface LayerStats {
  staticRenders: number;
  liveRenders: number;
  copies: number;
  /** Aborted passes (effects not ready) whose region was kept for the next frame. */
  retries: number;
}

const EMPTY: AbstractMesh[] = [];
const CLEAR_ONE = new Color4(1, 1, 1, 1);

type GL = WebGL2RenderingContext;
interface WrapperInternals {
  _framebuffer?: WebGLFramebuffer | null;
  _depthStencilTexture?: { _hardwareTexture?: { underlyingResource?: WebGLTexture } } | null;
  _depthStencilTextureWithStencil?: boolean;
  texture?: { _hardwareTexture?: { underlyingResource?: WebGLTexture } } | null;
}

export class LayeredShadowMap {
  /** The sampled (live) generator. */
  readonly gen: ShadowGenerator;
  /** The static layer (null when not layered). */
  readonly staticGen: ShadowGenerator | null;
  readonly cube: boolean;
  readonly size: number;
  /** Render passes: 6 cube faces or 1. */
  readonly passes: number;
  readonly stats: LayerStats = { staticRenders: 0, liveRenders: 0, copies: 0, retries: 0 };
  /** False when the copy is unavailable: the live map is then redrawn with every caster. */
  layered: boolean;

  private readonly engine: Engine;
  private readonly provider: CasterProvider;
  // pending dirty regions per pass (accumulated by mark*, cleared after a complete render)
  private readonly staticSets: RectSet[];
  private readonly liveSets: RectSet[];
  private readonly bounds = emptyRect();
  /** A real pass of the static layer / live map drew something this render (not a readiness check). */
  private staticDrew = false;
  private liveDrew = false;
  private readonly staticList: AbstractMesh[] = [];
  private readonly liveList: AbstractMesh[] = [];
  private readonly usesDepthTexture: boolean;
  private copyChecks = 3;
  private scissorOn = false;
  private disposed = false;

  constructor(light: IShadowLight, engine: Engine, o: LayeredShadowOptions) {
    this.engine = engine;
    this.provider = o.provider;
    this.size = o.size;
    this.cube = light.needCube();
    this.passes = this.cube ? 6 : 1;
    this.staticSets = Array.from({ length: this.passes }, () => new RectSet());
    this.liveSets = Array.from({ length: this.passes }, () => new RectSet());
    const gl = (engine as unknown as { _gl?: GL })._gl;
    this.layered = o.layered && engine.webGLVersion >= 2 && !!gl && typeof gl.blitFramebuffer === "function";
    // static layer first: a light's generators render in creation order
    // (red float texture: the map only ever holds one channel)
    this.staticGen = this.layered ? new ShadowGenerator(o.size, light, true, STATIC_LAYER_KEY, true) : null;
    this.gen = new ShadowGenerator(o.size, light, true, null, true);
    o.configure(this.gen);
    if (this.staticGen) o.configure(this.staticGen);
    this.usesDepthTexture = this.gen.usePercentageCloserFiltering || this.gen.useContactHardeningShadow;
    this.setupLive();
    if (this.staticGen) this.setupStatic(this.staticGen);
    this.markAll();
  }

  /** The live (sampled) shadow map. */
  get map(): RenderTargetTexture | null {
    return this.gen.getShadowMap();
  }

  // ---------------------------------------------------------------- dirty regions

  /** Static content changed in a texel rectangle of pass `face` → both layers redraw it. */
  markStaticRect(face: number, r: TexelRect): void {
    if (face < 0 || face >= this.passes) return;
    this.staticSets[face].addRect(r);
    this.liveSets[face].addRect(r);
  }

  /** Only moving casters changed in a texel rectangle of pass `face` → the live map redraws it. */
  markLiveRect(face: number, r: TexelRect): void {
    if (face < 0 || face >= this.passes) return;
    this.liveSets[face].addRect(r);
  }

  /** Static content changed on whole passes (bitmask of cube faces; 2D maps: bit 0). */
  markStaticFaces(mask: number): void {
    for (let f = 0; f < this.passes; f++) {
      if (!(mask & (1 << f))) continue;
      this.staticSets[f].add(0, 0, this.size, this.size);
      this.liveSets[f].add(0, 0, this.size, this.size);
    }
  }

  markLiveFaces(mask: number): void {
    for (let f = 0; f < this.passes; f++) if (mask & (1 << f)) this.liveSets[f].add(0, 0, this.size, this.size);
  }

  /** Redraw everything (both layers) on the next render. */
  markAll(): void {
    this.markStaticFaces(ALL_CUBE_FACES);
  }

  /** Anything waiting to be drawn? */
  get pending(): boolean {
    for (const s of this.liveSets) if (!s.empty) return true;
    return false;
  }

  /** Arm the maps whose regions are dirty (call once per frame before the render targets). */
  arm(): void {
    if (this.disposed) return;
    let st = false;
    for (let f = 0; f < this.passes; f++) {
      const s = this.staticSets[f];
      if (s.empty) continue;
      st = true;
      // the live map always rebuilds what the static layer redraws (also after a retried pass)
      this.liveSets[f].addAll(s);
      // no static layer to draw (not layered, or the copy failed): the live map alone redraws it
      if (!this.layered) s.clear();
    }
    if (st && this.staticGen && this.layered) this.staticGen.getShadowMap()?.resetRefreshCounter();
    if (this.pending) this.gen.getShadowMap()?.resetRefreshCounter();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gen.dispose();
    this.staticGen?.dispose();
  }

  // ---------------------------------------------------------------- internals

  private clearFor(engine: AbstractEngine): void {
    if (this.usesDepthTexture) engine.clear(CLEAR_ONE, false, true, false);
    else engine.clear(CLEAR_ONE, true, true, false);
  }

  private setScissor(engine: AbstractEngine, r: TexelRect): void {
    if (r.x0 <= 0 && r.y0 <= 0 && r.x1 >= this.size && r.y1 >= this.size) {
      this.endScissor();
      return;
    }
    engine.enableScissor(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    this.scissorOn = true;
  }

  private endScissor(): void {
    if (!this.scissorOn) return;
    this.scissorOn = false;
    this.engine.disableScissor();
  }

  /** Babylon reset the refresh counter during this render (a caster's effect was not ready). */
  private aborted(map: RenderTargetTexture): boolean {
    const r = (map as unknown as { _objectRenderer?: { _currentRefreshId?: number } })._objectRenderer;
    return r?._currentRefreshId === -1;
  }

  /** Pass being rendered (the RTT records the cube face before each pass). */
  private passOf(map: RenderTargetTexture): number {
    const f = (map as unknown as { _currentFaceIndex?: number })._currentFaceIndex ?? 0;
    return this.cube ? f : 0;
  }

  private setupStatic(gen: ShadowGenerator): void {
    const map = gen.getShadowMap();
    if (!map) return;
    map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    map.renderList = []; // never null: Babylon only computes the projection with a list
    map.onClearObservable.clear(); // replaces the generator's full clear
    // (lists are also requested by readiness checks; only onClear marks a real pass)
    map.getCustomRenderList = (pass: number) => {
      const set = this.staticSets[this.cube ? pass : 0];
      if (!set || set.empty) return EMPTY;
      const out = this.staticList;
      out.length = 0;
      this.provider("static", this.cube ? pass : 0, set, out);
      return out;
    };
    map.onClearObservable.add((engine) => {
      const set = this.staticSets[this.passOf(map)];
      if (set.empty) return; // clean: keep
      // clear each dirty rectangle, then draw scissored to their bounds (a static caster reaching
      // outside its rectangle rewrites identical depth there)
      for (let i = 0; i < set.count; i++) {
        this.setScissor(engine, set.rects[i]);
        this.clearFor(engine);
      }
      this.setScissor(engine, set.bounds(this.bounds));
      if (!this.staticDrew) this.stats.staticRenders++;
      this.staticDrew = true;
    });
    map.onAfterRenderObservable.add(() => this.endScissor());
    map.onAfterUnbindObservable.add(() => {
      if (!this.staticDrew) return;
      this.staticDrew = false;
      // an aborted pass (effect not ready) keeps its region: arm() redraws it (and the live map) next frame
      if (this.aborted(map)) {
        this.stats.retries++;
        return;
      }
      for (const s of this.staticSets) s.clear();
    });
  }

  private setupLive(): void {
    const map = this.gen.getShadowMap();
    if (!map) return;
    map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    if (!map.renderList) map.renderList = [];
    map.onClearObservable.clear();
    map.getCustomRenderList = (pass: number) => {
      const set = this.liveSets[this.cube ? pass : 0];
      if (!set || set.empty) return EMPTY;
      const out = this.liveList;
      out.length = 0;
      // fallback (no copy): the dirty passes are cleared and redrawn whole, with every caster
      if (this.layered) this.provider("dynamic", this.cube ? pass : 0, set, out);
      else this.provider("all", this.cube ? pass : 0, null, out);
      return out;
    };
    map.onClearObservable.add((engine) => {
      const face = this.passOf(map);
      const set = this.liveSets[face];
      if (set.empty) return; // clean: keep
      if (!this.liveDrew) this.stats.liveRenders++;
      this.liveDrew = true;
      if (!this.layered) {
        this.clearFor(engine);
        return;
      }
      let ok = true;
      for (let i = 0; i < set.count && ok; i++) ok = this.copy(face, set.rects[i]);
      if (!ok) {
        // copy failed: degrade for good and redraw everything next frame (this pass: clean slate)
        this.layered = false;
        this.clearFor(engine);
        this.markAll();
        map.resetRefreshCounter();
        return;
      }
      this.setScissor(engine, set.bounds(this.bounds));
    });
    map.onAfterRenderObservable.add(() => this.endScissor());
    map.onAfterUnbindObservable.add(() => {
      if (!this.liveDrew) return;
      this.liveDrew = false;
      if (this.aborted(map)) {
        this.stats.retries++;
        return;
      }
      for (const s of this.liveSets) s.clear();
    });
  }

  /**
   * Copy a texel rectangle of the static layer into the bound live map (same face for cube
   * maps). Depth always; the colour too when the filter samples it (cube distance maps). Returns
   * false on failure (checked with getError on the first copies).
   */
  private copy(face: number, rect: TexelRect): boolean {
    const src = this.staticGen?.getShadowMap()?.renderTarget as unknown as WrapperInternals | null | undefined;
    const engine = this.engine as unknown as { _gl: GL; _currentFramebuffer: WebGLFramebuffer | null };
    const gl = engine._gl;
    const fb = src?._framebuffer;
    const depth = src?._depthStencilTexture?._hardwareTexture?.underlyingResource;
    const color = src?.texture?._hardwareTexture?.underlyingResource;
    if (!gl || !fb || !depth || (!this.usesDepthTexture && !color)) return false;
    const check = this.copyChecks > 0;
    if (check) gl.getError(); // flush earlier errors so the check below is ours
    this.endScissor(); // (blits honour the scissor test)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
    const att = src._depthStencilTextureWithStencil ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT;
    if (this.cube) {
      // Babylon attaches the face being rendered on bind: attach the matching source face here
      const target = gl.TEXTURE_CUBE_MAP_POSITIVE_X + face;
      if (color) gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target, color, 0);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, att, target, depth, 0);
    }
    let bits = gl.DEPTH_BUFFER_BIT;
    if (!this.usesDepthTexture) bits |= gl.COLOR_BUFFER_BIT;
    gl.blitFramebuffer(rect.x0, rect.y0, rect.x1, rect.y1, rect.x0, rect.y0, rect.x1, rect.y1, bits, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, engine._currentFramebuffer);
    this.stats.copies++;
    if (check) {
      this.copyChecks--;
      const err = gl.getError();
      if (err !== gl.NO_ERROR) {
        console.warn(`shadow cache: static-layer copy failed (GL error ${err}); falling back to full shadow re-renders`);
        return false;
      }
    }
    return true;
  }
}
