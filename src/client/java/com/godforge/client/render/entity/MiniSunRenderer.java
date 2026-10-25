package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.MiniSunEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

/** Small orbiting suns; positioned from the owner on the client so the orbit is perfectly smooth. */
public class MiniSunRenderer extends EntityRenderer<MiniSunEntity, GfRenderState> {
	public MiniSunRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected int getBlockLightLevel(MiniSunEntity entity, BlockPos pos) {
		return 15;
	}

	@Override
	protected boolean affectedByCulling(MiniSunEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(MiniSunEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		Entity owner = entity.level().getEntity(entity.ownerId());
		Vec3 here = new Vec3(state.x, state.y, state.z);
		state.start = owner != null ? entity.orbitPosition(owner, partialTick).subtract(here) : Vec3.ZERO;
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float t = state.ageInTicks;
		float r = state.size;
		float flicker = 0.9F + 0.1F * Mth.sin(t * 2.1F);
		poseStack.pushPose();
		poseStack.translate(state.start.x, state.start.y, state.start.z);
		poseStack.pushPose();
		poseStack.mulPose(Axis.YP.rotation(t * 0.1F));
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_PLASMA), (pose, vc) ->
			FxDraw.texSphere(vc, pose, r, 10, 16, FxDraw.argb(0xFFD23A, 1.0F), 2.0F, t * 0.01F, 0.0F)
		);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) ->
			FxDraw.colorSphere(vc, pose, r * 0.7F, 8, 12, FxDraw.argb(0xFFF6D0, 0.9F))
		);
		poseStack.popPose();
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) -> {
			FxDraw.billboard(vc, pose, r * 3.6F * flicker, FxDraw.argb(0xFF8A1F, 0.55F));
			FxDraw.billboard(vc, pose, r * 1.8F, FxDraw.argb(0xFFE27A, 0.8F));
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FLARE), (pose, vc) ->
			FxDraw.billboard(vc, pose, r * 4.0F * flicker, t * 0.03F, FxDraw.argb(0xFFF2B0, 0.6F))
		);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
