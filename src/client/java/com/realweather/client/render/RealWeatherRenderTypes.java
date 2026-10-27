package com.realweather.client.render;

import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.shaders.UniformType;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.VertexFormat;
import com.realweather.RealWeather;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.renderer.rendertype.OutputTarget;
import net.minecraft.client.renderer.rendertype.RenderSetup;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.texture.TextureAtlas;

/** Custom pipelines and render types. They are compiled on first use, so a broken shader never blocks loading. */
public final class RealWeatherRenderTypes {
	/** Additive lightning that stays visible through distant haze instead of vanishing at the render distance. */
	public static final RenderPipeline LIGHTNING_PIPELINE = RenderPipeline.builder()
		.withLocation(RealWeather.id("pipeline/lightning"))
		.withVertexShader(RealWeather.id("core/lightning"))
		.withFragmentShader(RealWeather.id("core/lightning"))
		.withUniform("DynamicTransforms", UniformType.UNIFORM_BUFFER)
		.withUniform("Projection", UniformType.UNIFORM_BUFFER)
		.withUniform("Fog", UniformType.UNIFORM_BUFFER)
		.withBlend(BlendFunction.LIGHTNING)
		.withDepthWrite(false)
		.withCull(false)
		.withVertexFormat(DefaultVertexFormat.POSITION_COLOR, VertexFormat.Mode.QUADS)
		.build();

	/** Particle pipeline without the alpha cut-off, for very soft mist, spray and drifting snow. */
	public static final RenderPipeline SOFT_PARTICLE_PIPELINE = RenderPipeline.builder()
		.withLocation(RealWeather.id("pipeline/soft_particle"))
		.withVertexShader("core/particle")
		.withFragmentShader(RealWeather.id("core/soft_particle"))
		.withUniform("DynamicTransforms", UniformType.UNIFORM_BUFFER)
		.withUniform("Projection", UniformType.UNIFORM_BUFFER)
		.withUniform("Fog", UniformType.UNIFORM_BUFFER)
		.withSampler("Sampler0")
		.withSampler("Sampler2")
		.withBlend(BlendFunction.TRANSLUCENT)
		.withDepthWrite(false)
		.withVertexFormat(DefaultVertexFormat.PARTICLE, VertexFormat.Mode.QUADS)
		.build();

	public static final SingleQuadParticle.Layer SOFT_PARTICLES = new SingleQuadParticle.Layer(true, TextureAtlas.LOCATION_PARTICLES, SOFT_PARTICLE_PIPELINE);

	private static final RenderType LIGHTNING = RenderType.create(
		"realweather_lightning",
		RenderSetup.builder(LIGHTNING_PIPELINE).setOutputTarget(OutputTarget.WEATHER_TARGET).sortOnUpload().createRenderSetup()
	);

	private RealWeatherRenderTypes() {
	}

	public static RenderType lightning() {
		return LIGHTNING;
	}
}
