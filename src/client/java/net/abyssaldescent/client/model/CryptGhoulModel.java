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
import net.minecraft.util.Mth;

/** Hunched, long-armed carrion ghoul. 64x64 texture. */
public class CryptGhoulModel extends EntityModel<DungeonMobRenderState> {
	private final ModelPart head;
	private final KeyframeAnimation idle;
	private final KeyframeAnimation walk;
	private final KeyframeAnimation crouch;
	private final KeyframeAnimation leap;
	private final KeyframeAnimation dazed;

	public CryptGhoulModel(ModelPart root) {
		super(root);
		this.head = root.getChild("body").getChild("head");
		this.idle = IDLE.bake(root);
		this.walk = WALK.bake(root);
		this.crouch = CROUCH.bake(root);
		this.leap = LEAP.bake(root);
		this.dazed = DAZED.bake(root);
	}

	public static LayerDefinition createBodyLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		PartDefinition body = root.addOrReplaceChild("body", CubeListBuilder.create()
			.texOffs(0, 20).addBox(-3.5F, -11.0F, -2.5F, 7.0F, 11.0F, 5.0F)
			.texOffs(24, 20).addBox(-0.5F, -10.0F, 2.5F, 1.0F, 9.0F, 2.0F), PartPose.offsetAndRotation(0.0F, 14.0F, 1.0F, 0.95F, 0.0F, 0.0F));
		PartDefinition head = body.addOrReplaceChild("head", CubeListBuilder.create()
			.texOffs(0, 0).addBox(-3.0F, -5.0F, -5.0F, 6.0F, 5.0F, 6.0F)
			.texOffs(24, 0).addBox(-2.0F, -3.5F, -8.0F, 4.0F, 3.0F, 3.0F), PartPose.offsetAndRotation(0.0F, -11.0F, 0.0F, -0.95F, 0.0F, 0.0F));
		head.addOrReplaceChild("jaw", CubeListBuilder.create().texOffs(24, 8).addBox(-2.0F, 0.0F, -5.5F, 4.0F, 1.0F, 5.0F),
			PartPose.offset(0.0F, -0.5F, -2.0F));
		PartDefinition leftArm = body.addOrReplaceChild("left_arm", CubeListBuilder.create().texOffs(32, 20).addBox(-1.0F, -1.0F, -1.0F, 2.0F, 15.0F, 2.0F),
			PartPose.offsetAndRotation(4.0F, -9.0F, 0.0F, -0.75F, 0.0F, -0.1F));
		leftArm.addOrReplaceChild("left_claw", CubeListBuilder.create().texOffs(48, 20).addBox(-1.5F, 0.0F, -2.5F, 3.0F, 2.0F, 4.0F),
			PartPose.offset(0.0F, 14.0F, 0.0F));
		PartDefinition rightArm = body.addOrReplaceChild("right_arm", CubeListBuilder.create().texOffs(40, 20).addBox(-1.0F, -1.0F, -1.0F, 2.0F, 15.0F,
			2.0F), PartPose.offsetAndRotation(-4.0F, -9.0F, 0.0F, -0.75F, 0.0F, 0.1F));
		rightArm.addOrReplaceChild("right_claw", CubeListBuilder.create().texOffs(48, 26).addBox(-1.5F, 0.0F, -2.5F, 3.0F, 2.0F, 4.0F),
			PartPose.offset(0.0F, 14.0F, 0.0F));
		root.addOrReplaceChild("left_leg", CubeListBuilder.create().texOffs(0, 40).addBox(-1.5F, 0.0F, -1.5F, 3.0F, 10.0F, 3.0F),
			PartPose.offset(2.0F, 14.0F, 1.0F));
		root.addOrReplaceChild("right_leg", CubeListBuilder.create().texOffs(12, 40).addBox(-1.5F, 0.0F, -1.5F, 3.0F, 10.0F, 3.0F),
			PartPose.offset(-2.0F, 14.0F, 1.0F));
		return LayerDefinition.create(mesh, 64, 64);
	}

	@Override
	public void setupAnim(DungeonMobRenderState state) {
		super.setupAnim(state);
		head.yRot += Mth.clamp(state.yRot, -50.0F, 50.0F) * Mth.DEG_TO_RAD;
		head.xRot += Mth.clamp(state.xRot, -30.0F, 30.0F) * Mth.DEG_TO_RAD * 0.5F;
		if (state.action == 0) {
			walk.applyWalk(state.walkAnimationPos, state.walkAnimationSpeed, 1.5F, 2.5F);
		}
		if (state.action == 0) {
			idle.apply((long) (state.ageInTicks * 50.0F), 1.0F);
		}
		crouch.apply(state.actionA, state.ageInTicks);
		leap.apply(state.actionB, state.ageInTicks);
		dazed.apply(state.actionC, state.ageInTicks);
	}

	static final AnimationDefinition IDLE = AnimationDefinition.Builder.withLength(2.0F).looping()
		.addAnimation("body", rot(r(0, 0, 0, 0), r(1.0F, 3, 0, 0), r(2.0F, 0, 0, 0)))
		.addAnimation("jaw", rot(r(0, 4, 0, 0), r(1.0F, 10, 0, 0), r(2.0F, 4, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(1.0F, 4, 0, -3), r(2.0F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(1.0F, 4, 0, 3), r(2.0F, 0, 0, 0)))
		.build();

	static final AnimationDefinition WALK = AnimationDefinition.Builder.withLength(0.8F).looping()
		.addAnimation("left_leg", rot(r(0, -30, 0, 0), r(0.4F, 30, 0, 0), r(0.8F, -30, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 30, 0, 0), r(0.4F, -30, 0, 0), r(0.8F, 30, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 25, 0, 0), r(0.4F, -25, 0, 0), r(0.8F, 25, 0, 0)))
		.addAnimation("right_arm", rot(r(0, -25, 0, 0), r(0.4F, 25, 0, 0), r(0.8F, -25, 0, 0)))
		.addAnimation("body", rot(r(0, 0, 5, 0), r(0.4F, 0, -5, 0), r(0.8F, 0, 5, 0)))
		.build();

	/** The tell: drops low, arms flung back, head raised to shriek. */
	static final AnimationDefinition CROUCH = AnimationDefinition.Builder.withLength(0.7F)
		.addAnimation("body", rot(r(0, 0, 0, 0), r(0.3F, 18, 0, 0), r(0.7F, 20, 0, 0)))
		.addAnimation("body", pos(p(0, 0, 0, 0), p(0.3F, 0, -4, 0), p(0.7F, 0, -4.5F, 0)))
		.addAnimation("head", rot(r(0, 0, 0, 0), r(0.3F, -35, 0, 0), r(0.7F, -38, 0, 0)))
		.addAnimation("jaw", rot(r(0, 0, 0, 0), r(0.2F, 40, 0, 0), r(0.7F, 42, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.3F, 60, 0, -30), r(0.7F, 65, 0, -32)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.3F, 60, 0, 30), r(0.7F, 65, 0, 32)))
		.addAnimation("left_leg", pos(p(0, 0, 0, 0), p(0.3F, 0, -3, 0), p(0.7F, 0, -3, 0)))
		.addAnimation("right_leg", pos(p(0, 0, 0, 0), p(0.3F, 0, -3, 0), p(0.7F, 0, -3, 0)))
		.addAnimation("left_leg", rot(r(0, 0, 0, 0), r(0.3F, -40, 0, 0), r(0.7F, -40, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 0, 0, 0), r(0.3F, -40, 0, 0), r(0.7F, -40, 0, 0)))
		.build();

	static final AnimationDefinition LEAP = AnimationDefinition.Builder.withLength(1.1F)
		.addAnimation("body", rot(r(0, -25, 0, 0), r(0.5F, -20, 0, 0), r(1.1F, 0, 0, 0)))
		.addAnimation("head", rot(r(0, 20, 0, 0), r(1.1F, 0, 0, 0)))
		.addAnimation("jaw", rot(r(0, 45, 0, 0), r(0.6F, 45, 0, 0), r(1.1F, 5, 0, 0)))
		.addAnimation("left_arm", rot(r(0, -90, 0, -15), r(0.6F, -95, 0, -10), r(1.1F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, -90, 0, 15), r(0.6F, -95, 0, 10), r(1.1F, 0, 0, 0)))
		.addAnimation("left_leg", rot(r(0, 50, 0, 0), r(1.1F, 0, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 50, 0, 0), r(1.1F, 0, 0, 0)))
		.build();

	static final AnimationDefinition DAZED = AnimationDefinition.Builder.withLength(1.2F).looping()
		.addAnimation("body", rot(r(0, 20, 0, 8), r(0.6F, 22, 0, -8), r(1.2F, 20, 0, 8)))
		.addAnimation("body", pos(p(0, 0, -3, 0), p(1.2F, 0, -3, 0)))
		.addAnimation("head", rot(r(0, 25, 20, 15), r(0.6F, 30, -20, -15), r(1.2F, 25, 20, 15)))
		.addAnimation("jaw", rot(r(0, 25, 0, 0), r(1.2F, 25, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 40, 0, 0), r(0.6F, 45, 0, 0), r(1.2F, 40, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 40, 0, 0), r(0.6F, 45, 0, 0), r(1.2F, 40, 0, 0)))
		.addAnimation("left_leg", pos(p(0, 0, -3, 0), p(1.2F, 0, -3, 0)))
		.addAnimation("right_leg", pos(p(0, 0, -3, 0), p(1.2F, 0, -3, 0)))
		.addAnimation("left_leg", rot(r(0, -30, 0, -10), r(1.2F, -30, 0, -10)))
		.addAnimation("right_leg", rot(r(0, -30, 0, 10), r(1.2F, -30, 0, 10)))
		.build();
}
