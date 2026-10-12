package com.chaosunleashed.client.render.entity;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.client.model.KaijuModel;
import com.chaosunleashed.client.render.ChaosModelLayers;
import com.chaosunleashed.events.kaiju.KaijuEntity;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.MobEntityRenderer;
import net.minecraft.client.render.entity.feature.EyesFeatureRenderer;
import net.minecraft.client.render.entity.state.LivingEntityRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;

/** Renders the Kaiju at 20x scale with glowing eyes/weak points, and a slow, heavy topple when it dies. */
public class KaijuRenderer extends MobEntityRenderer<KaijuEntity, KaijuRenderer.State, KaijuModel> {
	private static final Identifier TEXTURE = ChaosUnleashed.id("textures/entity/kaiju/kaiju.png");
	private static final RenderLayer GLOW = RenderLayers.eyes(ChaosUnleashed.id("textures/entity/kaiju/kaiju_glow.png"));

	public static class State extends LivingEntityRenderState {
		public boolean walking;
		public float roarProgress;
		public boolean beaming;
	}

	public KaijuRenderer(EntityRendererFactory.Context context) {
		super(context, new KaijuModel(context.getPart(ChaosModelLayers.KAIJU)), 0.0F);
		this.addFeature(new EyesFeatureRenderer<>(this) {
			@Override
			public RenderLayer getEyesTexture() {
				return GLOW;
			}
		});
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void updateRenderState(KaijuEntity entity, State state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		double dx = entity.getX() - entity.lastX;
		double dz = entity.getZ() - entity.lastZ;
		state.walking = dx * dx + dz * dz > 1.0E-4 && !entity.isDead();
		int roar = entity.getRoarTicks();
		state.roarProgress = roar > 0 ? MathHelper.clamp(Math.min(roar, 60 - roar) / 12.0F, 0.0F, 1.0F) : 0.0F;
		state.beaming = entity.isBeaming();
		// The 5 second death animation would otherwise be tinted red the whole time.
		state.hurt = entity.hurtTime > 0 && !entity.isDead();
	}

	@Override
	protected boolean canBeCulled(KaijuEntity entity) {
		return false;
	}

	@Override
	protected void scale(State state, MatrixStack matrices) {
		matrices.scale(KaijuEntity.SCALE, KaijuEntity.SCALE, KaijuEntity.SCALE);
	}

	@Override
	protected void setupTransforms(State state, MatrixStack matrices, float bodyYaw, float baseHeight) {
		matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(180.0F - bodyYaw));
		if (state.deathTime > 0.0F) {
			float fall = MathHelper.clamp(state.deathTime / 85.0F, 0.0F, 1.0F);
			matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(fall * fall * 88.0F));
		}
	}

	@Override
	protected float getShadowRadius(State state) {
		return 0.0F;
	}

	@Override
	public Identifier getTexture(State state) {
		return TEXTURE;
	}

	@Override
	protected boolean hasLabel(KaijuEntity entity, double distance) {
		return false;
	}
}
