package com.godforge.client.render.entity;

import com.godforge.client.render.FxDraw;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.entity.DimensionalRiftEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.phys.Vec3;

/** A jagged vertical tear in space showing the void beyond, its edges crackling with unstable light. */
public class RiftRenderer extends EntityRenderer<DimensionalRiftEntity, GfRenderState> {
	private static final int POINTS = 14;

	public RiftRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GfRenderState createRenderState() {
		return new GfRenderState();
	}

	@Override
	protected boolean affectedByCulling(DimensionalRiftEntity entity) {
		return false;
	}

	@Override
	public void extractRenderState(DimensionalRiftEntity entity, GfRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.size = entity.size();
		state.seed = entity.variant();
		state.progress = entity.progress(partialTick);
	}

	@Override
	public void submit(GfRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float t = state.ageInTicks;
		float open = Mth.clamp(state.progress * 8.0F, 0.0F, 1.0F) * Mth.clamp((1.0F - state.progress) * 6.0F, 0.0F, 1.0F);
		if (open <= 0.0F) {
			return;
		}
		float height = state.size;
		RandomSource random = RandomSource.create(state.seed);
		float[] xs = new float[POINTS + 1];
		float[] ws = new float[POINTS + 1];
		for (int i = 0; i <= POINTS; i++) {
			float f = (float) i / POINTS;
			xs[i] = (random.nextFloat() - 0.5F) * 0.9F;
			ws[i] = Mth.sin(f * Mth.PI) * (0.5F + random.nextFloat() * 0.9F) * open;
		}
		poseStack.pushPose();
		// face the viewer around the vertical axis so the tear is always seen face-on
		Vec3 toCam = camera.pos.subtract(state.x, state.y, state.z);
		poseStack.mulPose(Axis.YP.rotation((float) Math.atan2(toCam.x, toCam.z)));
		float wobble = Mth.sin(t * 0.2F) * 0.06F;
		collector.submitCustomGeometry(poseStack, GfRenderTypes.voidSurface(), (pose, vc) -> {
			for (int i = 0; i < POINTS; i++) {
				float y0 = height * i / POINTS;
				float y1 = height * (i + 1) / POINTS;
				vc.addVertex(pose, xs[i] - ws[i], y0, 0);
				vc.addVertex(pose, xs[i + 1] - ws[i + 1], y1, 0);
				vc.addVertex(pose, xs[i + 1] + ws[i + 1], y1, 0);
				vc.addVertex(pose, xs[i] + ws[i], y0, 0);
			}
		});
		collector.submitCustomGeometry(poseStack, GfRenderTypes.additive(), (pose, vc) -> {
			Vec3 cam = new Vec3(0, height * 0.5, 10);
			for (int i = 0; i < POINTS; i++) {
				float y0 = height * i / POINTS;
				float y1 = height * (i + 1) / POINTS;
				float flicker = 0.7F + 0.3F * Mth.sin(t * 0.9F + i);
				for (int side = -1; side <= 1; side += 2) {
					Vec3 a = new Vec3(xs[i] + side * ws[i] + wobble, y0, 0.01);
					Vec3 b = new Vec3(xs[i + 1] + side * ws[i + 1] + wobble, y1, 0.01);
					FxDraw.colorStrip(vc, pose, a, b, cam, 0.1F, FxDraw.argb(0xFFFFFF, flicker * open), FxDraw.argb(0xFFFFFF, flicker * open));
					FxDraw.colorStrip(vc, pose, a, b, cam, 0.6F, FxDraw.argb(0xD04DFF, 0.5F * open), FxDraw.argb(0x6CF6FF, 0.5F * open));
				}
			}
		});
		poseStack.translate(0.0F, height * 0.5F, 0.0F);
		poseStack.mulPose(camera.orientation);
		collector.submitCustomGeometry(poseStack, GfRenderTypes.glow(GfRenderTypes.TEX_GLOW), (pose, vc) ->
			FxDraw.billboard(vc, pose, height * 0.6F, FxDraw.argb(0x8A2AFF, 0.35F * open))
		);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
