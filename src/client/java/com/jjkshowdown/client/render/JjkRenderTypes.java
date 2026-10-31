package com.jjkshowdown.client.render;

import com.jjkshowdown.JjkShowdown;
import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.VertexFormat;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.rendertype.RenderSetup;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Util;

import java.util.function.Function;

/** Custom render pipelines: additive emissive glow for techniques and particles. */
public final class JjkRenderTypes {
	/** Additive (alpha-weighted: SRC_ALPHA, ONE), emissive, double-sided, no depth write: glowing cursed energy. */
	public static final RenderPipeline ADDITIVE_ENTITY = RenderPipelines.register(RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
			.withLocation(JjkShowdown.id("pipeline/additive_entity"))
			.withVertexShader("core/entity")
			.withFragmentShader("core/entity")
			.withShaderDefine("EMISSIVE")
			.withShaderDefine("NO_OVERLAY")
			.withShaderDefine("NO_CARDINAL_LIGHTING")
			.withSampler("Sampler0")
			.withBlend(BlendFunction.LIGHTNING)
			.withCull(false)
			.withDepthWrite(false)
			.withVertexFormat(DefaultVertexFormat.NEW_ENTITY, VertexFormat.Mode.QUADS)
			.build());

	/** Translucent (alpha-blended), emissive, double-sided: dark or opaque-looking effects such as the void dome. */
	public static final RenderPipeline TRANSLUCENT_ENTITY = RenderPipelines.register(RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
			.withLocation(JjkShowdown.id("pipeline/translucent_glow_entity"))
			.withVertexShader("core/entity")
			.withFragmentShader("core/entity")
			.withShaderDefine("EMISSIVE")
			.withShaderDefine("NO_OVERLAY")
			.withShaderDefine("NO_CARDINAL_LIGHTING")
			.withSampler("Sampler0")
			.withBlend(BlendFunction.TRANSLUCENT)
			.withCull(false)
			.withDepthWrite(false)
			.withVertexFormat(DefaultVertexFormat.NEW_ENTITY, VertexFormat.Mode.QUADS)
			.build());

	public static final RenderPipeline ADDITIVE_PARTICLE_PIPELINE = RenderPipelines.register(RenderPipeline.builder(RenderPipelines.PARTICLE_SNIPPET)
			.withLocation(JjkShowdown.id("pipeline/additive_particle"))
			.withBlend(BlendFunction.LIGHTNING)
			.withDepthWrite(false)
			.build());

	public static final SingleQuadParticle.Layer ADDITIVE_PARTICLES = new SingleQuadParticle.Layer(true, TextureAtlas.LOCATION_PARTICLES, ADDITIVE_PARTICLE_PIPELINE);

	private static final Function<Identifier, RenderType> ADDITIVE = Util.memoize(id ->
			RenderType.create("jjk_additive", RenderSetup.builder(ADDITIVE_ENTITY).withTexture("Sampler0", id).sortOnUpload().createRenderSetup()));
	private static final Function<Identifier, RenderType> TRANSLUCENT = Util.memoize(id ->
			RenderType.create("jjk_translucent_glow", RenderSetup.builder(TRANSLUCENT_ENTITY).withTexture("Sampler0", id).sortOnUpload().createRenderSetup()));

	private JjkRenderTypes() {
	}

	public static RenderType additive(Identifier texture) {
		return ADDITIVE.apply(texture);
	}

	public static RenderType translucentGlow(Identifier texture) {
		return TRANSLUCENT.apply(texture);
	}

	public static void init() {
	}
}
