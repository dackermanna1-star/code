package dev.juukulius.client.render.entity;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusRenderTypes;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.entity.ClaristaWaveEntity;
import dev.juukulius.spirit.Spirit;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * The long-range Al Clarista: a crescent of six stacked bands of spirit light (one per spirit, a rainbow) around a
 * white-hot edge, curving back from its leading point.
 */
public class ClaristaWaveRenderer extends EntityRenderer<ClaristaWaveEntity, GlowRenderState> {
	private static final int SEGMENTS = 16;
	private static final float ARC = 1.25F;

	public ClaristaWaveRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GlowRenderState createRenderState() {
		return new GlowRenderState();
	}

	@Override
	public void extractRenderState(ClaristaWaveEntity entity, GlowRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		Vec3 motion = entity.getDeltaMovement();
		state.direction = motion.lengthSqr() < 1.0E-6 ? new Vec3(0.0, 0.0, 1.0) : motion.normalize();
		state.power = entity.power();
		state.roll = entity.roll();
		state.width = entity.halfWidth();
		state.empowered = entity.empowered();
		float age = entity.tickCount + partialTick;
		state.intensity = Mth.clamp(age / 2.0F, 0.0F, 1.0F) * Mth.clamp((14.0F + 10.0F * entity.power() - age) / 4.0F, 0.0F, 1.0F);
	}

	@Override
	public boolean shouldRender(ClaristaWaveEntity entity, net.minecraft.client.renderer.culling.Frustum frustum, double x, double y, double z) {
		return true;
	}

	@Override
	public void submit(GlowRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		Vector3f forward = new Vector3f((float) state.direction.x, (float) state.direction.y, (float) state.direction.z).normalize();
		Vector3f side = new Vector3f(forward).cross(0.0F, 1.0F, 0.0F);
		if (side.lengthSquared() < 1.0E-6F) {
			side.set(1.0F, 0.0F, 0.0F);
		}

		side.normalize();
		Vector3f up = new Vector3f(side).cross(forward).normalize();
		float roll = state.roll * Mth.DEG_TO_RAD;
		Vector3f rolledSide = new Vector3f(side).mul(Mth.cos(roll)).add(new Vector3f(up).mul(Mth.sin(roll)));
		Vector3f rolledUp = new Vector3f(up).mul(Mth.cos(roll)).sub(new Vector3f(side).mul(Mth.sin(roll)));
		float halfWidth = state.width;
		float radius = halfWidth / Mth.sin(ARC / 2.0F);
		float bandHeight = 0.07F + 0.03F * state.power + (state.empowered ? 0.02F : 0.0F);
		float alpha = state.intensity;
		float shimmer = state.ageInTicks * 0.15F;

		poseStack.pushPose();
		poseStack.translate(0.0F, 0.3F, 0.0F);
		collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.CRESCENT), (pose, consumer) -> {
			for (Spirit spirit : Spirit.values()) {
				float offset = (spirit.ordinal() - 2.5F) * bandHeight;
				int color = FxDraw.lerpRgb(0.15F, spirit.color, FxDraw.rainbow(spirit.ordinal() / 6.0F + shimmer));
				this.arc(consumer, pose.pose(), forward, rolledSide, rolledUp, radius, offset, bandHeight * 0.75F, color, alpha * 0.9F);
			}

			this.arc(consumer, pose.pose(), forward, rolledSide, rolledUp, radius, 0.0F, bandHeight * 1.2F, 0xFFFFFF, alpha);
			this.arc(consumer, pose.pose(), forward, rolledSide, rolledUp, radius * 0.97F, 0.0F, bandHeight * 6.0F, 0xFFFFFF, alpha * 0.22F);
		});
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}

	/** One band of the crescent: an arc centred ahead of the wave, curving back towards its ends. */
	private void arc(com.mojang.blaze3d.vertex.VertexConsumer consumer, org.joml.Matrix4f matrix, Vector3f forward, Vector3f side, Vector3f up,
		float radius, float heightOffset, float halfHeight, int color, float alpha) {
		Vector3f center = new Vector3f(forward).mul(-radius * 0.85F).add(new Vector3f(up).mul(heightOffset));
		for (int i = 0; i < SEGMENTS; i++) {
			float t0 = i / (float) SEGMENTS;
			float t1 = (i + 1) / (float) SEGMENTS;
			float a0 = (t0 - 0.5F) * ARC;
			float a1 = (t1 - 0.5F) * ARC;
			Vector3f p0 = new Vector3f(forward).mul(Mth.cos(a0) * radius).add(new Vector3f(side).mul(Mth.sin(a0) * radius)).add(center);
			Vector3f p1 = new Vector3f(forward).mul(Mth.cos(a1) * radius).add(new Vector3f(side).mul(Mth.sin(a1) * radius)).add(center);
			float taper0 = Mth.sin(t0 * Mth.PI);
			float taper1 = Mth.sin(t1 * Mth.PI);
			Vector3f h0 = new Vector3f(up).mul(halfHeight * (0.35F + 0.65F * taper0));
			Vector3f h1 = new Vector3f(up).mul(halfHeight * (0.35F + 0.65F * taper1));
			int c0 = FxDraw.argb(alpha * taper0, color);
			int c1 = FxDraw.argb(alpha * taper1, color);
			consumer.addVertex(matrix, p0.x - h0.x, p0.y - h0.y, p0.z - h0.z).setUv(t0, 1.0F).setColor(c0);
			consumer.addVertex(matrix, p1.x - h1.x, p1.y - h1.y, p1.z - h1.z).setUv(t1, 1.0F).setColor(c1);
			consumer.addVertex(matrix, p1.x + h1.x, p1.y + h1.y, p1.z + h1.z).setUv(t1, 0.0F).setColor(c1);
			consumer.addVertex(matrix, p0.x + h0.x, p0.y + h0.y, p0.z + h0.z).setUv(t0, 0.0F).setColor(c0);
		}
	}
}
