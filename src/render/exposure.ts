/**
 * Pre-exposure (as in Frostbite/Unreal): every shader that writes radiance
 * multiplies it by the current exposure, so the half-float HDR buffers hold
 * display-range values whether the scene is a sunlit desert (radiance ~0.1)
 * or a galaxy seen from intergalactic space (radiance ~1e-9, which would
 * otherwise underflow half precision). The value is read back asynchronously
 * from the GPU auto-exposure (no pipeline stall) and shared by reference.
 */
import type { IUniform } from 'three';

export const PRE_EXPOSURE: IUniform<number> = { value: 1 };
