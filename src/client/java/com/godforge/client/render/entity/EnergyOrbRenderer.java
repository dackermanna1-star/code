package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.GfProjectile;
import com.godforge.entity.SolarBoltEntity;
import com.godforge.entity.StarBoltEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;

/** Glowing energy projectiles: rainbow orbs, stars, suns, cracker shells. */
public class EnergyOrbRenderer<T extends GfProjectile> extends EntityRenderer<T, GfRenderState> {
	public enum Style {
		PRISM,
		STAR,
		SUN,
		CRACKER
	}

	private final Style style;

	public EnergyOrbRenderer(EntityRendererProvider.Context context, Style style) {
		super(context);
		this.style = style;
	}

	@Override
	protected int getBlockLightLevel(T entity, BlockPos pos) {
		return 15;
	}

	@Override
	protected boolean affectedByCulling(T entity) {
		return false;
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	public void extractRenderState(T entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.charge = entity.charge();
		state.variant = entity.variant();
		state.motion = entity.getDeltaMovement();
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float t = state.ageInTicks;
		float size = Math.max(0.15F, state.size);
		switch (this.style) {
			case PRISM -> this.prism(state, poseStack, collector, camera, t, size);
			case STAR -> this.star(state, poseStack, collector, camera, t, size);
			case SUN -> this.sun(state, poseStack, collector, camera, t, size);
			case CRACKER -> this.cracker(state, poseStack, collector, camera, t, size);
		}
		super.submit(state, poseStack, collector, camera);
	}

	private void trail(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera, float width, float lengthScale, int color, boolean rainbow) {
		Vec3 m = state.motion;
		double speed = m.length();
		if (speed < 0.05) {
			return;
		}
		Vec3 back = m.scale(-Math.min(1.0, lengthScale)).scale(Math.max(1.0, lengthScale));
		Vec3 cameraRel = camera.pos.subtract(state.x, state.y, state.z);
		int head = rainbow ? Mth.hsvToRgb(state.ageInTicks * 0.04F % 1.0F, 0.6F, 1.0F) : color;
		int tail = rainbow ? Mth.hsvToRgb((state.ageInTicks * 0.04F + 0.5F) % 1.0F, 0.9F, 1.0F) : color;
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_BEAM), (pose, vc) -> {
			FxDraw.texStrip(vc, pose, Vec3.ZERO, back, cameraRel, width, -state.ageInTicks * 0.2F, 2.0F, FxDraw.argb(head, 1.0F), FxDraw.argb(tail, 0.0F));
			FxDraw.texStrip(vc, pose, Vec3.ZERO, back.scale(0.6), cameraRel, width * 0.35F, 0, 1.0F, FxDraw.argb(0xFFFFFF, 0.9F), FxDraw.argb(0xFFFFFF, 0.0F));
		});
	}

	private void prism(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera, float t, float r) {
		boolean ultimate = state.variant == 1;
		int hue = Mth.hsvToRgb(t * 0.03F % 1.0F, 0.75F, 1.0F);
		int hue2 = Mth.hsvToRgb((t * 0.03F + 0.33F) % 1.0F, 0.75F, 1.0F);
		this.trail(state, poseStack, collector, camera, r * 2.2F, 1.0F, hue, true);
		poseStack.pushPose();
		poseStack.mulPose(com.mojang.math.Axis.YP.rotation(t * 0.08F));
		poseStack.mulPose(com.mojang.math.Axis.XP.rotation(t * 0.05F));
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_SWIRL), (pose, vc) -> {
			FxDraw.texSphere(vc, pose, r, 16, 24, FxDraw.argb(hue, 0.9F), 2.0F, t * 0.02F, t * 0.01F);
			FxDraw.texSphere(vc, pose, r * 1.15F, 16, 24, FxDraw.argb(hue2, 0.5F), 3.0F, -t * 0.015F, 0.0F);
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) ->
			FxDraw.colorSphere(vc, pose, r * 0.6F, 12, 16, FxDraw.argb(0xFFFFFF, 0.9F))
		);
		poseStack.popPose();
		poseStack.pushPose();
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) -> {
			FxDraw.billboard(vc, pose, r * 3.2F, FxDraw.argb(hue, 0.7F));
			FxDraw.billboard(vc, pose, r * 1.6F, FxDraw.argb(0xFFFFFF, 0.8F));
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FLARE), (pose, vc) -> {
			FxDraw.billboard(vc, pose, r * (ultimate ? 6.0F : 4.0F), t * 0.02F, FxDraw.argb(hue2, 0.8F));
			FxDraw.billboard(vc, pose, r * (ultimate ? 4.5F : 3.0F), -t * 0.03F + 0.4F, FxDraw.argb(0xFFFFFF, 0.6F));
		});
		poseStack.popPose();
	}

	private void star(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera, float t, float size) {
		boolean judgment = state.variant == StarBoltEntity.JUDGMENT;
		float r = judgment ? size * 0.22F : 0.25F + size * 0.35F;
		this.trail(state, poseStack, collector, camera, r * 1.8F, judgment ? 14.0F : 3.0F, 0xFFE27A, false);
		poseStack.pushPose();
		poseStack.mulPose(camera.orientation);
		float pulse = 0.85F + 0.15F * Mth.sin(t * 0.8F);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) -> {
			FxDraw.billboard(vc, pose, r * 4.0F * pulse, FxDraw.argb(0x8FD0FF, 0.45F));
			FxDraw.billboard(vc, pose, r * 2.4F, FxDraw.argb(0xFFE27A, 0.9F));
			FxDraw.billboard(vc, pose, r * 1.1F, FxDraw.argb(0xFFFFFF, 1.0F));
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FLARE), (pose, vc) -> {
			FxDraw.billboard(vc, pose, r * 6.0F * pulse, t * 0.05F, FxDraw.argb(0xFFFFFF, 0.9F));
			FxDraw.billboard(vc, pose, r * 4.0F, -t * 0.03F + 0.78F, FxDraw.argb(0xFFE27A, 0.7F));
		});
		poseStack.popPose();
		if (judgment) {
			collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
				FxDraw.colorSphere(vc, pose, r * 0.9F, 16, 24, FxDraw.argb(0xFFF6D0, 0.8F));
				FxDraw.colorSphere(vc, pose, r * 1.3F, 16, 24, FxDraw.argb(0xFFD24A, 0.25F));
			});
		}
	}

	private void sun(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera, float t, float size) {
		boolean core = state.variant == SolarBoltEntity.CORE;
		float r = core ? Math.max(0.4F, size * 0.55F) : size;
		if (!core || state.motion.lengthSqr() > 0.01) {
			this.trail(state, poseStack, collector, camera, r * 1.6F, 2.0F, 0xFF8A1F, false);
		}
		float flicker = 0.9F + 0.1F * Mth.sin(t * 1.7F) + (core ? 0.05F * Mth.sin(t * 5.3F) : 0.0F);
		poseStack.pushPose();
		poseStack.mulPose(com.mojang.math.Axis.YP.rotation(t * 0.05F));
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_PLASMA), (pose, vc) -> {
			FxDraw.texSphere(vc, pose, r, 16, 24, FxDraw.argb(0xFFD23A, 1.0F), 2.0F, t * 0.01F, t * 0.004F);
			FxDraw.texSphere(vc, pose, r * 1.08F, 16, 24, FxDraw.argb(0xFF7A1A, 0.6F), 3.0F, -t * 0.008F, 0.0F);
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) ->
			FxDraw.colorSphere(vc, pose, r * 0.75F, 12, 16, FxDraw.argb(0xFFF6D0, 0.9F))
		);
		poseStack.popPose();
		poseStack.pushPose();
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) -> {
			FxDraw.billboard(vc, pose, r * 3.5F * flicker, FxDraw.argb(0xFF8A1F, 0.55F));
			FxDraw.billboard(vc, pose, r * 2.0F, FxDraw.argb(0xFFE27A, 0.8F));
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FLARE), (pose, vc) ->
			FxDraw.billboard(vc, pose, r * (core ? 5.0F : 3.5F) * flicker, t * 0.02F, FxDraw.argb(0xFFF2B0, 0.7F))
		);
		poseStack.popPose();
	}

	private void cracker(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera, float t, float size) {
		float r = 0.55F;
		this.trail(state, poseStack, collector, camera, 1.4F, 3.0F, 0x3DFF7A, false);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
			FxDraw.colorSphere(vc, pose, r, 10, 14, FxDraw.argb(0xD2FFE0, 1.0F));
			FxDraw.colorSphere(vc, pose, r * 1.6F, 10, 14, FxDraw.argb(0x3DFF7A, 0.4F));
		});
		poseStack.pushPose();
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) ->
			FxDraw.billboard(vc, pose, r * 5.0F, FxDraw.argb(0x3DFF7A, 0.7F))
		);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_FLARE), (pose, vc) ->
			FxDraw.billboard(vc, pose, r * 7.0F, t * 0.1F, FxDraw.argb(0xD2FFE0, 0.7F))
		);
		poseStack.popPose();
	}
}
