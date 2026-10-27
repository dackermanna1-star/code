/**
 * Pre-exposure (as in Frostbite/Unreal): every shader that writes radiance
 * multiplies it by the current exposure, so the half-float HDR buffers hold
 * display-range values whether the scene is a sunlit desert (radiance ~0.1)
 * or a galaxy seen from intergalactic space (radiance ~1e-9, which would
 * otherwise underflow half precision).
 *
 * The exposure lives only on the GPU: shaders sample last frame's adapted
 * exposure texel (no CPU readback, no stalls); the composite pass divides by
 * the same texel, so the result is exact regardless of latency.
 */
import type { IUniform, Texture } from 'three';

export const PRE_EXPOSURE_TEX: IUniform<Texture | null> = { value: null };
/** CPU-side approximation (async readback) for built-in three.js materials. */
export const PRE_EXPOSURE: IUniform<number> = { value: 1 };

export const PRE_EXPOSURE_GLSL = /* glsl */ `
uniform sampler2D tPreExposure;
float preExposureValue() { return max(texture(tPreExposure, vec2(0.5)).r, 1e-6); }
#define uPreExposure preExposureValue()
`;
