package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.AsteroidEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/** A tumbling, white-hot asteroid wrapped in a plasma sheath with a long burning tail. */
public class AsteroidRenderer extends EntityRenderer<AsteroidEntity, GfRenderState> {
	public AsteroidRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(AsteroidEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(AsteroidEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.motion = entity.getDeltaMovement();
		state.seed = entity.getId();
		state.variant = entity.variant();
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float r = Math.max(0.6F, state.size);
		float t = state.ageInTicks;
		Vec3 back = state.motion.lengthSqr() > 1.0E-4 ? state.motion.normalize().scale(-1) : new Vec3(0, 1, 0);
		Vec3 cam = camera.pos.subtract(state.x, state.y, state.z);
		// burning tail
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_BEAM), (pose, vc) -> {
			FxDraw.texStrip(vc, pose, back.scale(r * 0.3), back.scale(r * 9.0), cam, r * 2.6F, -t * 0.25F, 2.0F, FxDraw.argb(0xFFB347, 0.9F), FxDraw.argb(0xFF4A0A, 0.0F));
			FxDraw.texStrip(vc, pose, back.scale(r * 0.2), back.scale(r * 5.0), cam, r * 1.3F, -t * 0.4F, 1.0F, FxDraw.argb(0xFFF2B0, 1.0F), FxDraw.argb(0xFF8A1F, 0.0F));
		});
		poseStack.pushPose();
		poseStack.mulPose(Axis.YP.rotation(t * 0.03F));
		poseStack.mulPose(Axis.XP.rotation(t * 0.021F + state.seed));
		collector.submitCustomGeometry(poseStack, RenderTypes.entitySolid(GfRenderTypes.TEX_ASTEROID), (pose, vc) ->
			FxDraw.rockSphere(vc, pose, r, 10, 14, 0xFFFFFFFF, state.seed, 0.35F, LightTexture.FULL_BRIGHT)
		);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_ASTEROID_GLOW), (pose, vc) ->
			FxDraw.rockSphere(vc, pose, r * 1.02F, 10, 14, FxDraw.argb(0xFFFFFF, 1.0F), state.seed, 0.35F, LightTexture.FULL_BRIGHT)
		);
		poseStack.popPose();
		// plasma sheath on the leading face
		poseStack.pushPose();
		poseStack.mulPose(camera.orientation);
		float flicker = 0.85F + 0.15F * Mth.sin(t * 1.9F);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) -> {
			FxDraw.billboard(vc, pose, r * 3.2F * flicker, FxDraw.argb(0xFF6A14, 0.6F));
			FxDraw.billboard(vc, pose, r * 1.9F, FxDraw.argb(0xFFD27A, 0.45F));
		});
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
