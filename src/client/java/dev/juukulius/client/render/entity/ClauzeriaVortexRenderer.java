package dev.juukulius.client.render.entity;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusRenderTypes;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.entity.ClauzeriaVortexEntity;
import dev.juukulius.spirit.Spirit;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/** Al Clauzeria's whirling rainbow vortex: six coloured rings spinning around a white core. */
public class ClauzeriaVortexRenderer extends EntityRenderer<ClauzeriaVortexEntity, GlowRenderState> {
	public ClauzeriaVortexRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GlowRenderState createRenderState() {
		return new GlowRenderState();
	}

	@Override
	public void extractRenderState(ClauzeriaVortexEntity entity, GlowRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		Vec3 motion = entity.getDeltaMovement();
		state.direction = motion.lengthSqr() < 1.0E-6 ? new Vec3(0.0, 0.0, 1.0) : motion.normalize();
	}

	@Override
	public void submit(GlowRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		Quaternionf facing = camera.orientation;
		float time = state.ageInTicks / 20.0F;
		Vector3f axis = new Vector3f((float) state.direction.x, (float) state.direction.y, (float) state.direction.z);
		Vector3f u = new Vector3f();
		Vector3f v = new Vector3f();
		FxDraw.basis(axis, u, v);
		poseStack.pushPose();
		poseStack.translate(0.0F, 0.4F, 0.0F);
		collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.SHOCKWAVE), (pose, consumer) -> {
			for (Spirit spirit : Spirit.values()) {
				float spin = time * 9.0F + spirit.ordinal() * Mth.TWO_PI / Spirit.COUNT;
				Vector3f tiltU = new Vector3f(u).mul(Mth.cos(spin)).add(new Vector3f(v).mul(Mth.sin(spin)));
				Vector3f tiltV = new Vector3f(axis).mul(0.35F).add(new Vector3f(v).mul(Mth.cos(spin)).sub(new Vector3f(u).mul(Mth.sin(spin)))).normalize();
				Vector3f center = new Vector3f(axis).mul((spirit.ordinal() - 2.5F) * -0.12F);
				FxDraw.ring(consumer, pose.pose(), center, tiltU, tiltV, 0.42F, 0.62F, 20, 2.0F, FxDraw.argb(0.85F, spirit.color),
					FxDraw.argb(0.0F, spirit.color));
			}
		});
		collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.GLOW), (pose, consumer) -> {
			int color = FxDraw.rainbow(time * 0.8F);
			FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 1.5F, 0.0F, FxDraw.argb(0.65F, color));
			FxDraw.billboard(consumer, pose.pose(), facing, 0.0F, 0.0F, 0.0F, 0.55F, 0.0F, FxDraw.argb(1.0F, 0xFFFFFF));
		});
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
