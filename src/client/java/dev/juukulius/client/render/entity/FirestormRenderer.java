package dev.juukulius.client.render.entity;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusRenderTypes;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.entity.FirestormEntity;
import dev.juukulius.spirit.Spirit;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.state.CameraRenderState;
import org.joml.Vector3f;

/** Ul Gora's firestorm: twisting bands of flame wrapped in pale wind, widening as they rise. */
public class FirestormRenderer extends EntityRenderer<FirestormEntity, GlowRenderState> {
	public FirestormRenderer(EntityRendererProvider.Context context) {
		super(context);
	}

	@Override
	public GlowRenderState createRenderState() {
		return new GlowRenderState();
	}

	@Override
	public void extractRenderState(FirestormEntity entity, GlowRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.power = entity.power();
		state.intensity = entity.intensity(partialTick);
	}

	@Override
	public void submit(GlowRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		float time = state.ageInTicks / 20.0F;
		float intensity = state.intensity;
		float radius = (float) FirestormEntity.RADIUS * state.power;
		float height = (float) FirestormEntity.HEIGHT * state.power * (0.4F + 0.6F * intensity);
		if (intensity > 0.01F) {
			collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.VORTEX), (pose, consumer) -> {
				Vector3f base = new Vector3f();
				for (int layer = 0; layer < 4; layer++) {
					float r = radius * (0.35F + layer * 0.17F) * intensity;
					int bottom = layer < 3 ? FxDraw.lerpRgb(layer / 3.0F, 0xFFD27A, Spirit.IA.color) : Spirit.ARO.accent;
					int top = layer < 3 ? Spirit.IA.color : Spirit.ARO.color;
					float alpha = (layer < 3 ? 0.55F : 0.3F) * intensity;
					FxDraw.band(consumer, pose.pose(), base, r * 0.55F, r * 1.15F, height, 24, -time * (1.6F + layer * 0.35F), 3.0F,
						FxDraw.argb(alpha, bottom), FxDraw.argb(0.0F, top));
				}
			});
			collector.submitCustomGeometry(poseStack, JuliusRenderTypes.glow(JuliusTextures.GLOW), (pose, consumer) ->
				FxDraw.billboard(consumer, pose.pose(), camera.orientation, 0.0F, height * 0.3F, 0.0F, radius * 1.4F, 0.0F,
					FxDraw.argb(0.45F * intensity, Spirit.IA.color)));
		}

		super.submit(state, poseStack, collector, camera);
	}
}
