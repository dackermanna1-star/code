package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.SingularityEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;

/**
 * Gargantua in miniature: a perfectly black event horizon, a blazing photon ring, a tilted accretion
 * disk whose far side is lensed up over the top of the hole, and a darkened halo of bent light.
 */
public class SingularityRenderer extends EntityRenderer<SingularityEntity, GfRenderState> {
	public SingularityRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(SingularityEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(SingularityEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.variant = entity.variant();
		state.progress = entity.progress(partialTick);
		int life = entity.lifetime();
		float collapseStart = (life - SingularityEntity.COLLAPSE_TICKS) / (float) life;
		state.extra = entity.has(SingularityEntity.FLAG_COLLAPSING) ? Mth.clamp((state.progress - collapseStart) / (1.0F - collapseStart), 0.0F, 1.0F) : 0.0F;
		state.flag = entity.has(SingularityEntity.FLAG_ANCHORED);
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float t = state.ageInTicks;
		float collapse = state.extra;
		float growIn = state.flag ? Mth.clamp(t / 20.0F, 0.15F, 1.0F) : 0.35F;
		float r = Math.max(0.25F, state.size * 0.75F) * growIn * (1.0F - collapse * 0.92F);
		float spin = t * (0.06F + collapse * 0.4F);

		// dark lensing halo
		poseStack.pushPose();
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.shade(GfRenderTypes.TEX_GLOW), (pose, vc) ->
			FxDraw.billboard(vc, pose, r * 4.2F, FxDraw.argb(0x000000, 0.65F))
		);
		poseStack.popPose();

		// the horizon itself writes depth so the far half of the disk is hidden behind it
		collector.submitCustomGeometry(poseStack, GfRenderTypes.solid(), (pose, vc) ->
			FxDraw.colorSphere(vc, pose, r, 18, 24, 0xFF000000)
		);

		// tilted accretion disk
		poseStack.pushPose();
		poseStack.mulPose(Axis.ZP.rotationDegrees(18.0F));
		poseStack.mulPose(Axis.XP.rotationDegrees(8.0F));
		poseStack.mulPose(Axis.YP.rotation(spin));
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_SWIRL), (pose, vc) -> {
			FxDraw.texRing(vc, pose, r * 1.25F, r * 2.4F, 48, t * 0.01F, FxDraw.argb(0xFFF6E0, 1.0F), FxDraw.argb(0xFF9D2E, 0.85F));
			FxDraw.texRing(vc, pose, r * 2.4F, r * 4.2F, 48, -t * 0.006F, FxDraw.argb(0xFF9D2E, 0.85F), FxDraw.argb(0x8A1A05, 0.0F));
		});
		poseStack.popPose();

		// lensed image of the far side of the disk + photon ring, always facing the viewer
		poseStack.pushPose();
		poseStack.mulPose(camera.orientation);
		poseStack.mulPose(Axis.XP.rotationDegrees(90.0F));
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_SWIRL), (pose, vc) ->
			FxDraw.texRing(vc, pose, r * 1.02F, r * 1.55F, 48, -spin * 0.2F, FxDraw.argb(0xFFE9C4, 0.95F), FxDraw.argb(0xFF7A1A, 0.0F))
		);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) ->
			FxDraw.colorRing(vc, pose, r * 0.98F, r * 1.1F, 0.0F, 48, FxDraw.argb(0xFFFFFF, 0.9F), FxDraw.argb(0xFFD8A0, 0.0F))
		);
		poseStack.popPose();

		if (collapse > 0.0F) {
			poseStack.pushPose();
			poseStack.mulPose(camera.orientation);
			float flare = collapse * collapse;
			collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FLARE), (pose, vc) ->
				FxDraw.billboard(vc, pose, state.size * (1.0F + flare * 6.0F), t * 0.2F, FxDraw.argb(0xE6D2FF, flare))
			);
			poseStack.popPose();
		}
		super.submit(state, poseStack, collector, camera);
	}
}
