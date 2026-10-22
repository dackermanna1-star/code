package dev.juukulius.client.render.entity;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusRenderTypes;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.entity.SpiritBoltEntity;
import dev.juukulius.spirit.Spirit;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/** Ia's fire orb, Kua's water lance and Nes's yin orb, each drawn from layered light. */
public class SpiritBoltRenderer extends EntityRenderer<SpiritBoltEntity, GlowRenderState> {
	public SpiritBoltRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GlowRenderState createRenderState() {
		return new GlowRenderState();
	}

	@Override
	public void extractRenderState(SpiritBoltEntity entity, GlowRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		Vec3 motion = entity.getDeltaMovement();
		state.direction = motion.lengthSqr() < 1.0E-6 ? new Vec3(0.0, 0.0, 1.0) : motion.normalize();
		state.kind = entity.kind().ordinal();
		state.power = entity.power();
	}

	@Override
	public void submit(GlowRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		SpiritBoltEntity.Kind kind = SpiritBoltEntity.Kind.byId(state.kind);
		Quaternionf facing = camera.orientation;
		float time = state.ageInTicks / 20.0F;
		float pulse = 0.9F + 0.1F * Mth.sin(state.ageInTicks * 0.9F);
		Vector3f dir = new Vector3f((float) state.direction.x, (float) state.direction.y, (float) state.direction.z);
		poseStack.pushPose();
		poseStack.translate(0.0F, 0.2F, 0.0F);
		switch (kind) {
			case FLAME -> {
				collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.GLOW), (pose, consumer) -> {
					FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.85F * pulse * state.power, 0.0F, FxDraw.argb(0.85F, Spirit.IA.color));
					FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.38F * state.power, 0.0F, FxDraw.argb(1.0F, 0xFFE9B0));
				});
				collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.SPIRIT_GLYPHS[Spirit.IA.ordinal()]), (pose, consumer) ->
					FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.45F * state.power, time * 6.0F, FxDraw.argb(1.0F, Spirit.IA.accent)));
				this.streak(collector, poseStack, dir, 1.1F, 0.22F, Spirit.IA.color);
			}
			case TIDE -> {
				this.streak(collector, poseStack, dir, 1.6F, 0.2F, Spirit.KUA.color);
				collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.GLOW), (pose, consumer) -> {
					FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.6F * pulse, 0.0F, FxDraw.argb(0.8F, Spirit.KUA.color));
					FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.25F, 0.0F, FxDraw.argb(1.0F, 0xE8F8FF));
				});
				collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.SPIRIT_GLYPHS[Spirit.KUA.ordinal()]), (pose, consumer) ->
					FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.32F, 0.0F, FxDraw.argb(1.0F, Spirit.KUA.accent)));
			}
			case UMBRA -> {
				collector.submitCustomGeometry(poseStack, JuliusRenderTypes.veil(JuliusTextures.SMOKE), (pose, consumer) ->
					FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.75F * pulse, time * 2.0F, FxDraw.argb(0.9F, Spirit.NES.accent)));
				collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.RING), (pose, consumer) ->
					FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.62F, -time * 3.0F, FxDraw.argb(0.9F, Spirit.NES.color)));
				collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.SPIRIT_GLYPHS[Spirit.NES.ordinal()]), (pose, consumer) ->
					FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.34F, time * 4.0F, FxDraw.argb(0.95F, Spirit.NES.color)));
			}
		}

		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}

	/** A glowing streak trailing behind the projectile, facing the camera around its axis. */
	private void streak(SubmitNodeCollector collector, PoseStack poseStack, Vector3f dir, float length, float width, int color) {
		collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.BEAM), (pose, consumer) -> {
			Vector3f toCamera = pose.pose().invert(new org.joml.Matrix4f()).transformPosition(new Vector3f(0.0F, 0.0F, 0.0F));
			Vector3f side = new Vector3f(dir).cross(toCamera);
			if (side.lengthSquared() < 1.0E-6F) {
				side.set(0.0F, 1.0F, 0.0F);
			}

			side.normalize().mul(width);
			Vector3f tail = new Vector3f(dir).mul(-length);
			Vector3f head = new Vector3f(dir).mul(0.15F);
			FxDraw.gradientQuad(consumer, pose.pose(), new Vector3f(tail).sub(side), new Vector3f(tail).add(side), new Vector3f(head).add(side),
				new Vector3f(head).sub(side), 0.0F, 0.0F, 1.0F, 1.0F, FxDraw.argb(0.0F, color), FxDraw.argb(0.9F, color));
		});
	}
}
