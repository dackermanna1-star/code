package dev.juukulius.client.render;

import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.VertexFormat;
import dev.juukulius.JuliusMod;
import java.util.function.Function;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.rendertype.RenderSetup;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Util;

/**
 * Pipelines for luminous effects. Glow geometry uses alpha-weighted additive blending so layered colours build up into
 * bright cores without hard edges; "veil" geometry uses normal alpha blending for dark (yin) and opaque-ish effects.
 * Neither writes depth, so overlapping transparent layers never cut holes into each other.
 */
public final class JuliusRenderTypes {
	public static final RenderPipeline GLOW_PIPELINE = RenderPipelines.register(RenderPipeline.builder(RenderPipelines.MATRICES_PROJECTION_SNIPPET)
		.withLocation(JuliusMod.id("pipeline/glow"))
		.withVertexShader("core/position_tex_color")
		.withFragmentShader("core/position_tex_color")
		.withSampler("Sampler0")
		.withBlend(BlendFunction.LIGHTNING)
		.withDepthWrite(false)
		.withCull(false)
		.withVertexFormat(DefaultVertexFormat.POSITION_TEX_COLOR, VertexFormat.Mode.QUADS)
		.build());

	public static final RenderPipeline VEIL_PIPELINE = RenderPipelines.register(RenderPipeline.builder(RenderPipelines.MATRICES_PROJECTION_SNIPPET)
		.withLocation(JuliusMod.id("pipeline/veil"))
		.withVertexShader("core/position_tex_color")
		.withFragmentShader("core/position_tex_color")
		.withSampler("Sampler0")
		.withBlend(BlendFunction.TRANSLUCENT)
		.withDepthWrite(false)
		.withCull(false)
		.withVertexFormat(DefaultVertexFormat.POSITION_TEX_COLOR, VertexFormat.Mode.QUADS)
		.build());

	public static final RenderPipeline ADDITIVE_PARTICLE_PIPELINE = RenderPipelines.register(RenderPipeline.builder(RenderPipelines.PARTICLE_SNIPPET)
		.withLocation(JuliusMod.id("pipeline/additive_particle"))
		.withBlend(BlendFunction.LIGHTNING)
		.withDepthWrite(false)
		.build());

	/** Particle layer for glowing particles (sparks, embers, light motes). */
	public static final SingleQuadParticle.Layer ADDITIVE_PARTICLES = new SingleQuadParticle.Layer(true,
		SingleQuadParticle.Layer.TRANSLUCENT.textureAtlasLocation(), ADDITIVE_PARTICLE_PIPELINE);

	private static final Function<Identifier, RenderType> GLOW = Util.memoize(texture -> RenderType.create(
		"julius_glow", RenderSetup.builder(GLOW_PIPELINE).withTexture("Sampler0", texture).sortOnUpload().bufferSize(16384).createRenderSetup()));
	private static final Function<Identifier, RenderType> VEIL = Util.memoize(texture -> RenderType.create(
		"julius_veil", RenderSetup.builder(VEIL_PIPELINE).withTexture("Sampler0", texture).sortOnUpload().bufferSize(16384).createRenderSetup()));

	private JuliusRenderTypes() {
	}

	public static RenderType glow(Identifier texture) {
		return GLOW.apply(texture);
	}

	public static RenderType veil(Identifier texture) {
		return VEIL.apply(texture);
	}

	public static void init() {
	}
}
