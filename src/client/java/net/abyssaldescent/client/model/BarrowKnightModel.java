package net.abyssaldescent.client.model;

import static net.abyssaldescent.client.anim.Anim.p;
import static net.abyssaldescent.client.anim.Anim.pos;
import static net.abyssaldescent.client.anim.Anim.r;
import static net.abyssaldescent.client.anim.Anim.rot;

import net.abyssaldescent.client.render.state.DungeonMobRenderState;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.KeyframeAnimation;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.util.Mth;

/** Heavily armoured barrow knight with a great helm and a broad sword. 128x64 texture. */
public class BarrowKnightModel extends EntityModel<DungeonMobRenderState> {
	private final ModelPart head;
	private final KeyframeAnimation idle;
	private final KeyframeAnimation walk;
	private final KeyframeAnimation smash;
	private final KeyframeAnimation bash;

	public BarrowKnightModel(ModelPart root) {
		super(root, RenderTypes::entityCutoutNoCull);
		this.head = root.getChild("torso").getChild("head");
		this.idle = IDLE.bake(root);
		this.walk = WALK.bake(root);
		this.smash = SMASH.bake(root);
		this.bash = BASH.bake(root);
	}

	public static LayerDefinition createBodyLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		PartDefinition torso = root.addOrReplaceChild("torso", CubeListBuilder.create().texOffs(0, 18).addBox(-5.0F, -13.0F, -3.0F, 10.0F, 13.0F, 6.0F),
			PartPose.offset(0.0F, 10.0F, 0.0F));
		torso.addOrReplaceChild("tabard", CubeListBuilder.create().texOffs(40, 37).addBox(-4.0F, 0.0F, 0.0F, 8.0F, 10.0F, 0.0F),
			PartPose.offset(0.0F, -1.0F, -3.2F));
		PartDefinition head = torso.addOrReplaceChild("head", CubeListBuilder.create().texOffs(0, 0).addBox(-4.5F, -9.0F, -4.5F, 9.0F, 9.0F, 9.0F),
			PartPose.offset(0.0F, -13.0F, 0.0F));
		head.addOrReplaceChild("horn_left", CubeListBuilder.create().texOffs(36, 0).addBox(0.0F, -5.0F, -1.0F, 2.0F, 5.0F, 2.0F),
			PartPose.offsetAndRotation(4.0F, -6.0F, 0.0F, 0.0F, 0.0F, 0.55F));
		head.addOrReplaceChild("horn_right", CubeListBuilder.create().texOffs(44, 0).addBox(-2.0F, -5.0F, -1.0F, 2.0F, 5.0F, 2.0F),
			PartPose.offsetAndRotation(-4.0F, -6.0F, 0.0F, 0.0F, 0.0F, -0.55F));
		torso.addOrReplaceChild("left_pauldron", CubeListBuilder.create().texOffs(52, 0).addBox(-1.0F, -3.0F, -3.5F, 6.0F, 5.0F, 7.0F),
			PartPose.offsetAndRotation(4.5F, -11.0F, 0.0F, 0.0F, 0.0F, -0.15F));
		torso.addOrReplaceChild("right_pauldron", CubeListBuilder.create().texOffs(52, 0).mirror().addBox(-5.0F, -3.0F, -3.5F, 6.0F, 5.0F, 7.0F),
			PartPose.offsetAndRotation(-4.5F, -11.0F, 0.0F, 0.0F, 0.0F, 0.15F));
		torso.addOrReplaceChild("left_arm", CubeListBuilder.create().texOffs(32, 18).addBox(-2.0F, -1.0F, -2.0F, 4.0F, 13.0F, 4.0F),
			PartPose.offset(6.5F, -10.5F, 0.0F));
		PartDefinition rightArm = torso.addOrReplaceChild("right_arm", CubeListBuilder.create().texOffs(48, 18).addBox(-2.0F, -1.0F, -2.0F, 4.0F, 13.0F,
			4.0F), PartPose.offset(-6.5F, -10.5F, 0.0F));
		rightArm.addOrReplaceChild("sword", CubeListBuilder.create()
			.texOffs(80, 0).addBox(-1.0F, -3.0F, -1.0F, 2.0F, 5.0F, 2.0F)
			.texOffs(80, 10).addBox(-1.5F, 2.0F, -1.5F, 3.0F, 2.0F, 3.0F)
			.texOffs(88, 0).addBox(-1.0F, -5.0F, -4.0F, 2.0F, 2.0F, 8.0F)
			.texOffs(110, 0).addBox(-0.5F, -27.0F, -2.0F, 1.0F, 22.0F, 4.0F), PartPose.offsetAndRotation(0.0F, 11.0F, 0.0F, 2.0F, 0.0F, 0.0F));
		root.addOrReplaceChild("left_leg", CubeListBuilder.create().texOffs(0, 37).addBox(-2.5F, 0.0F, -2.5F, 5.0F, 14.0F, 5.0F),
			PartPose.offset(2.6F, 10.0F, 0.0F));
		root.addOrReplaceChild("right_leg", CubeListBuilder.create().texOffs(20, 37).addBox(-2.5F, 0.0F, -2.5F, 5.0F, 14.0F, 5.0F),
			PartPose.offset(-2.6F, 10.0F, 0.0F));
		return LayerDefinition.create(mesh, 128, 64);
	}

	@Override
	public void setupAnim(DungeonMobRenderState state) {
		super.setupAnim(state);
		head.yRot = Mth.clamp(state.yRot, -45.0F, 45.0F) * Mth.DEG_TO_RAD;
		head.xRot = Mth.clamp(state.xRot, -30.0F, 30.0F) * Mth.DEG_TO_RAD;
		if (state.action == 0) {
			walk.applyWalk(state.walkAnimationPos, state.walkAnimationSpeed, 2.0F, 2.5F);
			idle.apply((long) (state.ageInTicks * 50.0F), 1.0F);
		}
		// The action is held through windup and recovery; frenzied knights do both faster, so play to match.
		smash.apply(state.actionA, state.ageInTicks, state.actionSpeed);
		bash.apply(state.actionB, state.ageInTicks, state.actionSpeed);
	}

	static final AnimationDefinition IDLE = AnimationDefinition.Builder.withLength(3.0F).looping()
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(1.5F, 2, 0, 0), r(3.0F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 2), r(1.5F, 3, 0, 4), r(3.0F, 0, 0, 2)))
		.addAnimation("left_arm", rot(r(0, 0, 0, -2), r(1.5F, 3, 0, -4), r(3.0F, 0, 0, -2)))
		.build();

	static final AnimationDefinition WALK = AnimationDefinition.Builder.withLength(1.0F).looping()
		.addAnimation("left_leg", rot(r(0, 0, 0, 0), r(0.25F, -26, 0, 0), r(0.5F, 0, 0, 0), r(0.75F, 26, 0, 0), r(1.0F, 0, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 0, 0, 0), r(0.25F, 26, 0, 0), r(0.5F, 0, 0, 0), r(0.75F, -26, 0, 0), r(1.0F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.25F, 18, 0, 0), r(0.5F, 0, 0, 0), r(0.75F, -18, 0, 0), r(1.0F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.25F, -8, 0, 0), r(0.5F, 0, 0, 0), r(0.75F, 8, 0, 0), r(1.0F, 0, 0, 0)))
		.addAnimation("torso", pos(p(0, 0, 0, 0), p(0.25F, 0, -0.6F, 0), p(0.5F, 0, 0, 0), p(0.75F, 0, -0.6F, 0), p(1.0F, 0, 0, 0)))
		.build();

	/** Overhead smash: sword raised high for the whole marked windup (1.1 s), then brought down. */
	static final AnimationDefinition SMASH = AnimationDefinition.Builder.withLength(2.0F)
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(0.9F, -14, 0, 0), r(1.1F, -16, 0, 0), r(1.2F, 28, 0, 0), r(1.7F, 24, 0, 0), r(2.0F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.9F, -170, 0, -10), r(1.1F, -175, 0, -10), r(1.2F, -55, 0, -8), r(1.7F, -50, 0, -8),
			r(2.0F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.9F, -170, 0, 10), r(1.1F, -175, 0, 10), r(1.2F, -55, 0, 8), r(1.7F, -50, 0, 8),
			r(2.0F, 0, 0, 0)))
		.addAnimation("sword", rot(r(0, 0, 0, 0), r(0.9F, -100, 0, 0), r(1.2F, -45, 0, 0), r(2.0F, 0, 0, 0)))
		.addAnimation("left_leg", rot(r(0, 0, 0, 0), r(1.2F, -20, 0, 0), r(1.7F, -20, 0, 0), r(2.0F, 0, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 0, 0, 0), r(1.2F, 16, 0, 0), r(1.7F, 16, 0, 0), r(2.0F, 0, 0, 0)))
		.build();

	static final AnimationDefinition BASH = AnimationDefinition.Builder.withLength(0.8F)
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(0.3F, -5, 20, 0), r(0.45F, 10, -15, 0), r(0.8F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.3F, -30, 0, -20), r(0.45F, -85, 0, 10), r(0.8F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.3F, -20, 0, 10), r(0.45F, -30, 0, 0), r(0.8F, 0, 0, 0)))
		.build();
}
