package net.abyssaldescent.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.client.render.state.RisenRenderState;
import net.abyssaldescent.entity.forgotten.RisenEntity;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.monster.zombie.ZombieModel;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
import net.minecraft.client.renderer.entity.layers.LivingEntityEmissiveLayer;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

/** The Risen: zombie rig, own texture and glowing eye pinpoints; claws its way out of the floor when summoned. */
public class RisenRenderer extends HumanoidMobRenderer<RisenEntity, RisenRenderState, ZombieModel<RisenRenderState>> {
	private static final Identifier TEXTURE = AbyssalDescent.id("textures/entity/risen/risen.png");
	private static final Identifier EYES = AbyssalDescent.id("textures/entity/risen/risen_eyes.png");
	private static final float EMERGE_TICKS = 24.0F;

	public RisenRenderer(EntityRendererProvider.Context context) {
		super(context, new ZombieModel<>(context.bakeLayer(ModelLayers.ZOMBIE)), 0.5F);
		addLayer(new LivingEntityEmissiveLayer<>(this, s -> EYES, (s, t) -> 1.0F, getModel(), RenderTypes::eyes, false));
	}

	@Override
	public Identifier getTextureLocation(RisenRenderState state) {
		return TEXTURE;
	}

	@Override
	public RisenRenderState createRenderState() {
		return new RisenRenderState();
	}

	@Override
	public void extractRenderState(RisenEntity entity, RisenRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.isAggressive = entity.isAggressive();
		state.emerge = Mth.clamp((entity.tickCount + partialTick) / EMERGE_TICKS, 0.0F, 1.0F);
	}

	@Override
	protected void setupRotations(RisenRenderState state, PoseStack poseStack, float bodyRot, float scale) {
		super.setupRotations(state, poseStack, bodyRot, scale);
		if (state.emerge < 1.0F) {
			float t = 1.0F - state.emerge;
			poseStack.translate(0.0F, -t * t * 1.85F, 0.0F);
		}
	}
}
