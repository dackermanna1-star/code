package dev.visceral.client.render;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.FilterMode;
import com.mojang.blaze3d.textures.GpuSampler;
import dev.visceral.Visceral;
import java.util.function.Supplier;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.rendertype.LayeringTransform;
import net.minecraft.client.renderer.rendertype.RenderSetup;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.resources.Identifier;

/**
 * Translucent, lit, non depth-writing layers for decals. The view offset layering pulls them a hair
 * towards the camera so they never z-fight with the block or skin they lie on.
 */
public final class VisceralRenderTypes {
	public static final Identifier DECAL_ATLAS = Visceral.id("textures/decal/blood.png");
	public static final Identifier WOUND_ATLAS = Visceral.id("textures/entity/wounds.png");
	private static final Supplier<GpuSampler> LINEAR = () -> RenderSystem.getSamplerCache().getClampToEdge(FilterMode.LINEAR);

	/** World stains, pools and blood droplets. */
	public static final RenderType BLOOD = RenderType.create("visceral_blood", RenderSetup.builder(RenderPipelines.ENTITY_NO_OUTLINE)
		.withTexture("Sampler0", DECAL_ATLAS, LINEAR)
		.useLightmap()
		.useOverlay()
		.setLayeringTransform(LayeringTransform.VIEW_OFFSET_Z_LAYERING)
		.sortOnUpload()
		.bufferSize(RenderType.SMALL_BUFFER_SIZE)
		.createRenderSetup());

	/** Self lit blood (magma cubes, glow squids) and sparks. */
	public static final RenderType GLOWING = RenderType.create("visceral_glowing", RenderSetup.builder(RenderPipelines.ENTITY_TRANSLUCENT_EMISSIVE)
		.withTexture("Sampler0", DECAL_ATLAS, LINEAR)
		.useOverlay()
		.setLayeringTransform(LayeringTransform.VIEW_OFFSET_Z_LAYERING)
		.sortOnUpload()
		.bufferSize(RenderType.TRANSIENT_BUFFER_SIZE * 64)
		.createRenderSetup());

	/** Wounds on entity models. */
	public static final RenderType WOUNDS = RenderType.create("visceral_wounds", RenderSetup.builder(RenderPipelines.ENTITY_NO_OUTLINE)
		.withTexture("Sampler0", WOUND_ATLAS, LINEAR)
		.useLightmap()
		.useOverlay()
		.setLayeringTransform(LayeringTransform.VIEW_OFFSET_Z_LAYERING)
		.sortOnUpload()
		.bufferSize(RenderType.TRANSIENT_BUFFER_SIZE * 64)
		.createRenderSetup());

	private VisceralRenderTypes() {
	}
}
