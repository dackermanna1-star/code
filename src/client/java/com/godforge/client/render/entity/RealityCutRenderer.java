package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.RealityCutEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;

/**
 * The severed seam of reality left by the Worldcutter: a ragged ribbon of raw void (the End starfield)
 * running down the middle of the chasm, bordered by crackling violet-white light.
 */
public class RealityCutRenderer extends EntityRenderer<RealityCutEntity, GfRenderState> {
	public RealityCutRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(RealityCutEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(RealityCutEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.length();
		state.extra = entity.gap();
		state.extra2 = entity.depth();
		state.yaw = entity.getYRot();
		state.progress = entity.reveal(partialTick);
		state.charge = entity.progress(partialTick);
		state.seed = entity.getId() * 31L;
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float yawRad = state.yaw * Mth.DEG_TO_RAD;
		Vec3 dir = new Vec3(-Mth.sin(yawRad), 0, Mth.cos(yawRad));
		float length = state.size * state.progress;
		float life = state.charge;
		float fade = life < 0.75F ? 1.0F : 1.0F - (life - 0.75F) / 0.25F;
		float top = 18.0F * fade;
		float bottom = -Math.min(state.extra2, 48.0F) * fade;
		int segments = Math.max(2, (int) (length / 3.0F));
		RandomSource random = RandomSource.create(state.seed);
		float[] jag = new float[segments + 1];
		for (int i = 0; i <= segments; i++) {
			jag[i] = 0.6F + random.nextFloat() * 0.8F;
		}
		float t = state.ageInTicks;
		if (fade > 0.0F && length > 0.5F) {
			collector.submitCustomGeometry(poseStack, GfRenderTypes.voidSurface(), (pose, vc) -> {
				for (int i = 0; i < segments; i++) {
					float a = length * i / segments;
					float b = length * (i + 1) / segments;
					float ta = top * jag[i];
					float tb = top * jag[i + 1];
					vc.addVertex(pose, (float) dir.x * a, bottom, (float) dir.z * a);
					vc.addVertex(pose, (float) dir.x * b, bottom, (float) dir.z * b);
					vc.addVertex(pose, (float) dir.x * b, tb, (float) dir.z * b);
					vc.addVertex(pose, (float) dir.x * a, ta, (float) dir.z * a);
				}
			});
			collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
				float flicker = 0.75F + 0.25F * Mth.sin(t * 1.3F);
				for (int i = 0; i < segments; i++) {
					float a = length * i / segments;
					float b = length * (i + 1) / segments;
					float ta = top * jag[i];
					float tb = top * jag[i + 1];
					Vec3 pa = new Vec3(dir.x * a, ta, dir.z * a);
					Vec3 pb = new Vec3(dir.x * b, tb, dir.z * b);
					Vec3 cam = camera.pos.subtract(state.x, state.y, state.z);
					FxDraw.colorStrip(vc, pose, pa, pb, cam, 0.35F, FxDraw.argb(0xFFFFFF, fade * flicker), FxDraw.argb(0xFFFFFF, fade * flicker));
					FxDraw.colorStrip(vc, pose, pa, pb, cam, 2.2F, FxDraw.argb(0xB18CFF, fade * 0.45F), FxDraw.argb(0xB18CFF, fade * 0.45F));
					Vec3 ga = new Vec3(dir.x * a, 0.2, dir.z * a);
					Vec3 gb = new Vec3(dir.x * b, 0.2, dir.z * b);
					FxDraw.colorStrip(vc, pose, ga, gb, cam, 1.2F + state.extra * 0.3F, FxDraw.argb(0xE9FBFF, fade * 0.35F), FxDraw.argb(0xE9FBFF, fade * 0.35F));
				}
			});
		}
		super.submit(state, poseStack, collector, camera);
	}
}
