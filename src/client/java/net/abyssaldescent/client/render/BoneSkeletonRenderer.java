package net.abyssaldescent.client.render;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.entity.forgotten.BoneShieldbearerEntity;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.monster.skeleton.SkeletonModel;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
import net.minecraft.client.renderer.entity.layers.LivingEntityEmissiveLayer;
import net.minecraft.client.renderer.entity.layers.SkeletonClothingLayer;
import net.minecraft.client.renderer.entity.state.SkeletonRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.item.Items;

/** Shared renderer for the skeletal dungeon soldiers (archer, shieldbearer): vanilla rig, own textures and gear. */
public class BoneSkeletonRenderer<T extends DungeonMonster> extends HumanoidMobRenderer<T, SkeletonRenderState, SkeletonModel<SkeletonRenderState>> {
	private final Identifier texture;

	public BoneSkeletonRenderer(EntityRendererProvider.Context context, String name) {
		super(context, new SkeletonModel<>(context.bakeLayer(ModelLayers.SKELETON)), 0.5F);
		this.texture = AbyssalDescent.id("textures/entity/skeleton/" + name + ".png");
		Identifier overlay = AbyssalDescent.id("textures/entity/skeleton/" + name + "_overlay.png");
		Identifier eyes = AbyssalDescent.id("textures/entity/skeleton/" + name + "_eyes.png");
		addLayer(new SkeletonClothingLayer<>(this, context.getModelSet(), ModelLayers.STRAY_OUTER_LAYER, overlay));
		addLayer(new LivingEntityEmissiveLayer<>(this, s -> eyes, (s, t) -> 1.0F, getModel(), RenderTypes::eyes, false));
	}

	@Override
	public Identifier getTextureLocation(SkeletonRenderState state) {
		return texture;
	}

	@Override
	public SkeletonRenderState createRenderState() {
		return new SkeletonRenderState();
	}

	@Override
	public void extractRenderState(T entity, SkeletonRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.isAggressive = entity.isAggressive();
		state.isHoldingBow = entity.getMainHandItem().is(Items.BOW);
		state.isShaking = false;
	}

	@Override
	protected HumanoidModel.ArmPose getArmPose(T entity, HumanoidArm arm) {
		boolean main = entity.getMainArm() == arm;
		if (main && entity.isAggressive() && entity.getMainHandItem().is(Items.BOW)) {
			return HumanoidModel.ArmPose.BOW_AND_ARROW;
		}
		if (entity instanceof BoneShieldbearerEntity bearer) {
			if (main && bearer.action() == BoneShieldbearerEntity.ACTION_WINDUP) {
				return HumanoidModel.ArmPose.THROW_TRIDENT;
			}
			if (!main && bearer.isUsingItem() && bearer.getOffhandItem().is(Items.SHIELD)) {
				return HumanoidModel.ArmPose.BLOCK;
			}
		}
		return super.getArmPose(entity, arm);
	}
}
