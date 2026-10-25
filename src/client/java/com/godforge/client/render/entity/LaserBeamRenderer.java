package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.LaserBeamEntity;
import com.godforge.weapon.GodWeaponItem;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Renders the Annihilation Cannon's beam from the wielder's hand to whatever it is burning. The end point
 * is re-traced on the client every frame so the beam tracks the crosshair perfectly.
 */
public class LaserBeamRenderer extends EntityRenderer<LaserBeamEntity, GfRenderState> {
	public LaserBeamRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(LaserBeamEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(LaserBeamEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.variant = entity.power();
		state.charge = entity.intensity();
		state.flag = entity.overloaded();
		state.color = entity.rgb(entity.level().getGameTime() + partialTick);
		Entity owner = entity.level().getEntity(entity.ownerId());
		Vec3 origin = new Vec3(state.x, state.y, state.z);
		if (owner instanceof LivingEntity living) {
			Vec3 eye = living.getEyePosition(partialTick);
			Vec3 look = living.getViewVector(partialTick);
			Minecraft mc = Minecraft.getInstance();
			boolean firstPerson = owner == mc.getCameraEntity() && mc.options.getCameraType().isFirstPerson();
			Vec3 start = firstPerson ? eye.add(look.scale(0.5)).add(0, -0.18, 0) : GodWeaponItem.handPosition(living, partialTick);
			if (firstPerson) {
				float yaw = living.getViewYRot(partialTick) * Mth.DEG_TO_RAD;
				start = start.add(new Vec3(-Math.cos(yaw), 0, -Math.sin(yaw)).scale(0.22));
			}
			Vec3 far = eye.add(look.scale(entity.range()));
			BlockHitResult hit = entity.level().clip(new ClipContext(eye, far, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, owner));
			Vec3 end = hit.getType() == HitResult.Type.MISS ? far : hit.getLocation();
			state.start = start.subtract(origin);
			state.end = end.subtract(origin);
			state.extra = hit.getType() == HitResult.Type.MISS ? 0.0F : 1.0F;
		} else {
			state.start = Vec3.ZERO;
			state.end = Vec3.ZERO;
		}
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		if (state.end.equals(state.start)) {
			return;
		}
		float t = state.ageInTicks;
		float power = state.variant / 10.0F;
		float intensity = state.charge;
		float width = state.size * (state.flag ? 1.6F : 1.0F);
		float pulse = 0.88F + 0.12F * Mth.sin(t * 2.3F) + (state.flag ? 0.1F * Mth.sin(t * 7.1F) : 0.0F);
		float core = Math.max(0.06F, width * 0.18F) * (0.6F + 0.4F * intensity) * pulse;
		int color = state.color;
		Vec3 a = state.start;
		Vec3 b = state.end;
		Vec3 cam = camera.pos.subtract(state.x, state.y, state.z);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
			FxDraw.colorBeam(vc, pose, a, b, core, 10, FxDraw.argb(0xFFFFFF, 0.95F), FxDraw.argb(0xFFFFFF, 0.95F));
			FxDraw.colorBeam(vc, pose, a, b, core * 2.2F + width * 0.15F, 12, FxDraw.argb(color, 0.55F * (0.5F + power * 0.5F)), FxDraw.argb(color, 0.55F));
			FxDraw.colorBeam(vc, pose, a, b, core * 4.0F + width * 0.35F, 12, FxDraw.argb(color, 0.16F * intensity), FxDraw.argb(color, 0.16F * intensity));
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_BEAM), (pose, vc) -> {
			float len = (float) b.subtract(a).length();
			FxDraw.texStrip(vc, pose, a, b, cam, width * 1.6F * pulse, -t * 0.6F, Math.max(1.0F, len / 6.0F), FxDraw.argb(color, 0.8F), FxDraw.argb(color, 0.8F));
		});
		// muzzle and impact flares
		poseStack.pushPose();
		poseStack.translate(a.x, a.y, a.z);
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) -> {
			FxDraw.billboard(vc, pose, 0.35F + width * 0.12F, FxDraw.argb(0xFFFFFF, 0.9F));
			FxDraw.billboard(vc, pose, 0.8F + width * 0.2F, FxDraw.argb(color, 0.6F));
		});
		poseStack.popPose();
		if (state.extra > 0.0F) {
			poseStack.pushPose();
			poseStack.translate(b.x, b.y, b.z);
			poseStack.mulPose(camera.orientation);
			float impact = (1.0F + width * 0.8F) * (0.8F + power * 0.6F) * pulse;
			collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) -> {
				FxDraw.billboard(vc, pose, impact * 2.4F, FxDraw.argb(color, 0.7F));
				FxDraw.billboard(vc, pose, impact, FxDraw.argb(0xFFFFFF, 0.95F));
			});
			collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FLARE), (pose, vc) ->
				FxDraw.billboard(vc, pose, impact * 3.0F, t * 0.4F, FxDraw.argb(color, 0.75F))
			);
			poseStack.popPose();
		}
		super.submit(state, poseStack, collector, camera);
	}
}
