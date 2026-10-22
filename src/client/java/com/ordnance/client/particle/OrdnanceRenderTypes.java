package com.ordnance.client.particle;

import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.ordnance.Ordnance;
import net.minecraft.client.gl.RenderPipelines;
import net.minecraft.client.particle.BillboardParticle;
import net.minecraft.client.texture.SpriteAtlasTexture;

/**
 * Particle pipelines. Both use a fragment shader with a much lower alpha cut-off than vanilla so soft smoke and
 * glows fade out smoothly instead of popping, and neither writes depth so overlapping puffs blend cleanly.
 */
public final class OrdnanceRenderTypes {
	public static final RenderPipeline SOFT_PIPELINE = RenderPipelines.register(
		RenderPipeline.builder(RenderPipelines.PARTICLE_SNIPPET)
			.withLocation(Ordnance.id("pipeline/soft_particle"))
			.withFragmentShader(Ordnance.id("core/soft_particle"))
			.withBlend(BlendFunction.TRANSLUCENT)
			.withDepthWrite(false)
			.withCull(false)
			.build()
	);
	public static final RenderPipeline GLOW_PIPELINE = RenderPipelines.register(
		RenderPipeline.builder(RenderPipelines.PARTICLE_SNIPPET)
			.withLocation(Ordnance.id("pipeline/glow_particle"))
			.withFragmentShader(Ordnance.id("core/soft_particle"))
			.withBlend(BlendFunction.LIGHTNING)
			.withDepthWrite(false)
			.withCull(false)
			.build()
	);

	/** Alpha-blended, for smoke, dust and fireballs. */
	public static final BillboardParticle.RenderType SOFT = new BillboardParticle.RenderType(true, SpriteAtlasTexture.PARTICLE_ATLAS_TEXTURE, SOFT_PIPELINE);
	/** Additive, for flashes, sparks, embers and flame cores. */
	public static final BillboardParticle.RenderType GLOW = new BillboardParticle.RenderType(true, SpriteAtlasTexture.PARTICLE_ATLAS_TEXTURE, GLOW_PIPELINE);

	private OrdnanceRenderTypes() {
	}

	public static void init() {
	}
}
