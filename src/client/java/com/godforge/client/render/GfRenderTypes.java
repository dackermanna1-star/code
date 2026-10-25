package com.godforge.client.render;

import com.godforge.Godforge;
import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.VertexFormat;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.blockentity.AbstractEndPortalRenderer;
import net.minecraft.client.renderer.rendertype.RenderSetup;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.resources.Identifier;

/** Custom render pipelines for energy effects (additive glows, void surfaces, solid cores). */
public final class GfRenderTypes {
	public static final Identifier TEX_GLOW = Godforge.id("textures/fx/glow.png");
	public static final Identifier TEX_RING = Godforge.id("textures/fx/ring.png");
	public static final Identifier TEX_FLARE = Godforge.id("textures/fx/flare.png");
	public static final Identifier TEX_BEAM = Godforge.id("textures/fx/beam.png");
	public static final Identifier TEX_PLASMA = Godforge.id("textures/fx/plasma.png");
	public static final Identifier TEX_SWIRL = Godforge.id("textures/fx/swirl.png");
	public static final Identifier TEX_SHOCK = Godforge.id("textures/fx/shock.png");
	public static final Identifier TEX_FIST = Godforge.id("textures/entity/kinetic_fist.png");
	public static final Identifier TEX_ASTEROID = Godforge.id("textures/entity/asteroid.png");
	public static final Identifier TEX_ASTEROID_GLOW = Godforge.id("textures/entity/asteroid_glow.png");

	/** Textured, additive (src-alpha, one), full-bright, double sided, no depth writes. */
	public static final RenderPipeline GLOW_PIPELINE = RenderPipelines.register(
		RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
			.withLocation(Godforge.id("pipeline/glow"))
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
			.build()
	);

	/** Textured, regular alpha blending, full-bright (smoke, dark halos). */
	public static final RenderPipeline SHADE_PIPELINE = RenderPipelines.register(
		RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
			.withLocation(Godforge.id("pipeline/shade"))
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
			.build()
	);

	/** Untextured additive colour geometry (beams, rings, shells). */
	public static final RenderPipeline ADDITIVE_PIPELINE = RenderPipelines.register(
		RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
			.withLocation(Godforge.id("pipeline/additive"))
			.withVertexShader("core/rendertype_lightning")
			.withFragmentShader("core/rendertype_lightning")
			.withBlend(BlendFunction.LIGHTNING)
			.withCull(false)
			.withDepthWrite(false)
			.withVertexFormat(DefaultVertexFormat.POSITION_COLOR, VertexFormat.Mode.QUADS)
			.build()
	);

	/** Untextured solid colour that writes depth (the black event horizon). */
	public static final RenderPipeline SOLID_PIPELINE = RenderPipelines.register(
		RenderPipeline.builder(RenderPipelines.MATRICES_PROJECTION_SNIPPET)
			.withLocation(Godforge.id("pipeline/solid_color"))
			.withVertexShader("core/position_color")
			.withFragmentShader("core/position_color")
			.withBlend(BlendFunction.TRANSLUCENT)
			.withCull(false)
			.withVertexFormat(DefaultVertexFormat.POSITION_COLOR, VertexFormat.Mode.QUADS)
			.build()
	);

	/** The End-portal starfield, visible from both sides (rift interiors). */
	public static final RenderPipeline VOID_PIPELINE = RenderPipelines.register(
		RenderPipeline.builder(RenderPipelines.END_PORTAL_SNIPPET)
			.withLocation(Godforge.id("pipeline/void"))
			.withShaderDefine("PORTAL_LAYERS", 15)
			.withCull(false)
			.build()
	);

	/** Additive particles (sparks, glows, plasma). */
	public static final RenderPipeline PARTICLE_GLOW_PIPELINE = RenderPipelines.register(
		RenderPipeline.builder(RenderPipelines.PARTICLE_SNIPPET)
			.withLocation(Godforge.id("pipeline/particle_glow"))
			.withBlend(BlendFunction.LIGHTNING)
			.withDepthWrite(false)
			.build()
	);

	public static final SingleQuadParticle.Layer PARTICLE_GLOW_LAYER = new SingleQuadParticle.Layer(true, TextureAtlas.LOCATION_PARTICLES, PARTICLE_GLOW_PIPELINE);

	private static final Map<Identifier, RenderType> GLOW = new HashMap<>();
	private static final Map<Identifier, RenderType> SHADE = new HashMap<>();
	private static final RenderType ADDITIVE = RenderType.create("godforge_additive", RenderSetup.builder(ADDITIVE_PIPELINE).sortOnUpload().createRenderSetup());
	private static final RenderType SOLID = RenderType.create("godforge_solid", RenderSetup.builder(SOLID_PIPELINE).createRenderSetup());
	private static final RenderType VOID = RenderType.create(
		"godforge_void",
		RenderSetup.builder(VOID_PIPELINE)
			.withTexture("Sampler0", AbstractEndPortalRenderer.END_SKY_LOCATION)
			.withTexture("Sampler1", AbstractEndPortalRenderer.END_PORTAL_LOCATION)
			.createRenderSetup()
	);

	private GfRenderTypes() {
	}

	public static RenderType glow(Identifier texture) {
		return GLOW.computeIfAbsent(texture, t -> RenderType.create("godforge_glow", RenderSetup.builder(GLOW_PIPELINE).withTexture("Sampler0", t).sortOnUpload().createRenderSetup()));
	}

	public static RenderType shade(Identifier texture) {
		return SHADE.computeIfAbsent(texture, t -> RenderType.create("godforge_shade", RenderSetup.builder(SHADE_PIPELINE).withTexture("Sampler0", t).sortOnUpload().createRenderSetup()));
	}

	public static RenderType additive() {
		return ADDITIVE;
	}

	public static RenderType solid() {
		return SOLID;
	}

	public static RenderType voidSurface() {
		return VOID;
	}

	public static void init() {
	}
}
