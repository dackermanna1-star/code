package com.chaosunleashed.client.render.entity;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.events.eclipse.ShadeStalkerEntity;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.LightmapTextureManager;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.entity.BipedEntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.feature.EyesFeatureRenderer;
import net.minecraft.client.render.entity.model.EndermanEntityModel;
import net.minecraft.client.render.entity.model.EntityModelLayers;
import net.minecraft.client.render.entity.state.EndermanEntityRenderState;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.ColorHelper;
import net.minecraft.util.math.MathHelper;
import net.minecraft.world.attribute.EnvironmentAttributes;
import org.jetbrains.annotations.Nullable;

/**
 * Shade Stalker: reuses the vanilla Enderman model geometry with its own (PLACEHOLDER) shadow texture.
 * The body is a faint translucent silhouette that only shows in darkness; the glowing eyes are always visible.
 */
public class ShadeStalkerRenderer extends MobEntityRenderer<ShadeStalkerEntity, ShadeStalkerRenderer.State, EndermanEntityModel<ShadeStalkerRenderer.State>> {
	private static final Identifier TEXTURE = ChaosUnleashed.id("textures/entity/shade_stalker/shade_stalker.png");
	private static final RenderLayer EYES = RenderLayers.eyes(ChaosUnleashed.id("textures/entity/shade_stalker/shade_stalker_eyes.png"));

	public static class State extends EndermanEntityRenderState {
		/** 0 = bright light (body invisible), 1 = darkness (faint silhouette). */
		public float visibility;
	}

	public ShadeStalkerRenderer(EntityRendererFactory.Context context) {
		super(context, new EndermanEntityModel<>(context.getPart(EntityModelLayers.ENDERMAN)), 0.0F);
		this.addFeature(new EyesFeatureRenderer<>(this) {
			@Override
			public RenderLayer getEyesTexture() {
				return EYES;
			}
		});
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void updateRenderState(ShadeStalkerEntity entity, State state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		BipedEntityRenderer.updateBipedRenderState(entity, state, tickProgress, this.itemModelResolver);
		state.angry = entity.isAttacking();
		state.carriedBlock = null;
		int block = LightmapTextureManager.getBlockLightCoordinates(state.light);
		int sky = LightmapTextureManager.getSkyLightCoordinates(state.light);
		float skyFactor = MinecraftClient.getInstance().gameRenderer.getCamera().getEnvironmentAttributeInterpolator()
			.get(EnvironmentAttributes.SKY_LIGHT_FACTOR_VISUAL, tickProgress);
		float effective = Math.max(block, sky * skyFactor);
		state.visibility = MathHelper.clamp((9.0F - effective) / 7.0F, 0.0F, 1.0F);
	}

	@Nullable
	@Override
	protected RenderLayer getRenderLayer(State state, boolean showBody, boolean translucent, boolean showOutline) {
		if (state.visibility <= 0.02F) {
			return showOutline ? RenderLayers.outlineNoCull(TEXTURE) : null;
		}
		return RenderLayers.entityTranslucent(TEXTURE);
	}

	@Override
	protected int getMixColor(State state) {
		return ColorHelper.getArgb((int) (state.visibility * 0.5F * 255.0F), 255, 255, 255);
	}

	@Override
	public Identifier getTexture(State state) {
		return TEXTURE;
	}
}
