package net.abyssaldescent.client.model;

import static net.abyssaldescent.client.anim.Anim.p;
import static net.abyssaldescent.client.anim.Anim.pos;
import static net.abyssaldescent.client.anim.Anim.r;
import static net.abyssaldescent.client.anim.Anim.rot;

import net.abyssaldescent.client.render.state.HollowWardenRenderState;
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

/**
 * The Hollow Warden: a towering skeletal knight in rusted plate, horned crown, tattered cloak and a greatsword. 128x128
 * texture; UV layout documented in tools/assets/README.md.
 */
public class HollowWardenModel extends EntityModel<HollowWardenRenderState> {
	private final ModelPart head;
	private final ModelPart jaw;
	private final ModelPart cloak;
	private final KeyframeAnimation idle;
	private final KeyframeAnimation walk;
	private final KeyframeAnimation kneel;
	private final KeyframeAnimation awaken;
	private final KeyframeAnimation cleave;
	private final KeyframeAnimation cleaveBack;
	private final KeyframeAnimation slam;
	private final KeyframeAnimation erupt;
	private final KeyframeAnimation chargeWindup;
	private final KeyframeAnimation charging;
	private final KeyframeAnimation stunned;
	private final KeyframeAnimation volley;
	private final KeyframeAnimation roar;
	private final KeyframeAnimation death;

	public HollowWardenModel(ModelPart root) {
		super(root, RenderTypes::entityCutoutNoCull);
		ModelPart torso = root.getChild("hips").getChild("torso");
		this.head = torso.getChild("head");
		this.jaw = head.getChild("jaw");
		this.cloak = torso.getChild("cloak");
		this.idle = IDLE.bake(root);
		this.walk = WALK.bake(root);
		this.kneel = KNEEL.bake(root);
		this.awaken = AWAKEN.bake(root);
		this.cleave = CLEAVE.bake(root);
		this.cleaveBack = CLEAVE_BACK.bake(root);
		this.slam = SLAM.bake(root);
		this.erupt = ERUPT.bake(root);
		this.chargeWindup = CHARGE_WINDUP.bake(root);
		this.charging = CHARGING.bake(root);
		this.stunned = STUNNED.bake(root);
		this.volley = VOLLEY.bake(root);
		this.roar = ROAR.bake(root);
		this.death = DEATH.bake(root);
	}

	public static LayerDefinition createBodyLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		PartDefinition hips = root.addOrReplaceChild("hips", CubeListBuilder.create().texOffs(40, 32).addBox(-5.0F, -2.0F, -3.0F, 10.0F, 4.0F, 6.0F),
			PartPose.offset(0.0F, 2.0F, 0.0F));
		PartDefinition torso = hips.addOrReplaceChild("torso", CubeListBuilder.create().texOffs(0, 32).addBox(-6.0F, -14.0F, -3.5F, 12.0F, 14.0F, 7.0F),
			PartPose.offset(0.0F, -2.0F, 0.0F));
		PartDefinition head = torso.addOrReplaceChild("head", CubeListBuilder.create()
			.texOffs(0, 0).addBox(-4.0F, -9.0F, -4.0F, 8.0F, 9.0F, 8.0F)
			.texOffs(32, 0).addBox(-5.0F, -10.5F, -5.0F, 10.0F, 4.0F, 10.0F), PartPose.offset(0.0F, -14.0F, -0.5F));
		head.addOrReplaceChild("jaw", CubeListBuilder.create().texOffs(0, 17).addBox(-3.0F, 0.0F, -6.0F, 6.0F, 2.0F, 6.0F),
			PartPose.offset(0.0F, -1.0F, 2.0F));
		head.addOrReplaceChild("horn_left", CubeListBuilder.create().texOffs(72, 0).addBox(0.0F, -5.0F, -1.0F, 2.0F, 5.0F, 2.0F),
			PartPose.offsetAndRotation(4.0F, -9.5F, 0.0F, 0.0F, 0.0F, 0.45F));
		head.addOrReplaceChild("horn_right", CubeListBuilder.create().texOffs(80, 0).addBox(-2.0F, -5.0F, -1.0F, 2.0F, 5.0F, 2.0F),
			PartPose.offsetAndRotation(-4.0F, -9.5F, 0.0F, 0.0F, 0.0F, -0.45F));
		torso.addOrReplaceChild("left_pauldron", CubeListBuilder.create().texOffs(64, 16).addBox(-1.5F, -3.0F, -4.0F, 7.0F, 5.0F, 8.0F),
			PartPose.offsetAndRotation(5.0F, -12.0F, 0.0F, 0.0F, 0.0F, -0.12F));
		torso.addOrReplaceChild("right_pauldron", CubeListBuilder.create().texOffs(64, 16).mirror().addBox(-5.5F, -3.0F, -4.0F, 7.0F, 5.0F, 8.0F),
			PartPose.offsetAndRotation(-5.0F, -12.0F, 0.0F, 0.0F, 0.0F, 0.12F));
		torso.addOrReplaceChild("left_arm", CubeListBuilder.create().texOffs(0, 64).addBox(-2.0F, -1.0F, -2.0F, 4.0F, 18.0F, 4.0F),
			PartPose.offset(8.0F, -11.0F, 0.0F));
		PartDefinition rightArm = torso.addOrReplaceChild("right_arm", CubeListBuilder.create().texOffs(16, 64).addBox(-2.0F, -1.0F, -2.0F, 4.0F, 18.0F,
			4.0F), PartPose.offset(-8.0F, -11.0F, 0.0F));
		rightArm.addOrReplaceChild("sword", CubeListBuilder.create()
			.texOffs(100, 0).addBox(-1.0F, -3.0F, -1.0F, 2.0F, 6.0F, 2.0F)
			.texOffs(108, 0).addBox(-1.5F, 3.0F, -1.5F, 3.0F, 2.0F, 3.0F)
			.texOffs(100, 8).addBox(-1.0F, -5.0F, -4.0F, 2.0F, 2.0F, 8.0F)
			.texOffs(118, 20).addBox(-0.5F, -37.0F, -2.0F, 1.0F, 32.0F, 4.0F), PartPose.offsetAndRotation(0.0F, 15.0F, 0.0F, 2.2F, 0.0F, 0.0F));
		torso.addOrReplaceChild("cloak", CubeListBuilder.create().texOffs(72, 64).addBox(-7.0F, 0.0F, 0.0F, 14.0F, 30.0F, 1.0F),
			PartPose.offsetAndRotation(0.0F, -13.0F, 3.6F, 0.08F, 0.0F, 0.0F));
		root.addOrReplaceChild("left_leg", CubeListBuilder.create().texOffs(32, 64).addBox(-2.5F, 0.0F, -2.5F, 5.0F, 22.0F, 5.0F),
			PartPose.offset(3.0F, 2.0F, 0.0F));
		root.addOrReplaceChild("right_leg", CubeListBuilder.create().texOffs(52, 64).addBox(-2.5F, 0.0F, -2.5F, 5.0F, 22.0F, 5.0F),
			PartPose.offset(-3.0F, 2.0F, 0.0F));
		return LayerDefinition.create(mesh, 128, 128);
	}

	@Override
	public void setupAnim(HollowWardenRenderState state) {
		super.setupAnim(state);
		boolean busy = state.busy;
		if (!busy) {
			head.yRot = Mth.clamp(state.yRot, -40.0F, 40.0F) * Mth.DEG_TO_RAD;
			head.xRot = Mth.clamp(state.xRot, -25.0F, 25.0F) * Mth.DEG_TO_RAD;
			walk.applyWalk(state.walkAnimationPos, state.walkAnimationSpeed, 2.0F, 2.5F);
			if (!state.dormant) {
				idle.apply((long) (state.ageInTicks * 50.0F), 1.0F);
			}
		}
		kneel.apply(state.seatedAnimation, state.ageInTicks);
		awaken.apply(state.awakenAnimation, state.ageInTicks);
		cleave.apply(state.cleaveAnimation, state.ageInTicks);
		cleaveBack.apply(state.cleaveBackAnimation, state.ageInTicks);
		slam.apply(state.slamAnimation, state.ageInTicks);
		erupt.apply(state.eruptAnimation, state.ageInTicks);
		chargeWindup.apply(state.chargeWindupAnimation, state.ageInTicks);
		charging.apply(state.chargingAnimation, state.ageInTicks);
		stunned.apply(state.stunnedAnimation, state.ageInTicks);
		volley.apply(state.volleyAnimation, state.ageInTicks);
		roar.apply(state.roarAnimation, state.ageInTicks);
		death.apply(state.deathAnimation, state.ageInTicks);
		// The cloak trails behind when moving.
		cloak.xRot += Math.min(0.6F, state.walkAnimationSpeed * 0.5F);
		if (state.phase >= 3) {
			jaw.xRot += 0.08F + Mth.sin(state.ageInTicks * 0.3F) * 0.05F;
		}
	}

	// =================================================================== animations

	static final AnimationDefinition IDLE = AnimationDefinition.Builder.withLength(3.0F).looping()
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(1.5F, 2.5F, 0, 0), r(3.0F, 0, 0, 0)))
		.addAnimation("head", rot(r(0, 0, 0, 0), r(1.5F, -2.0F, 0, 0), r(3.0F, 0, 0, 0)))
		.addAnimation("cloak", rot(r(0, 0, 0, 0), r(1.5F, 4.0F, 0, 0), r(3.0F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, -3), r(1.5F, 0, 0, -5), r(3.0F, 0, 0, -3)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 3), r(1.5F, 0, 0, 5), r(3.0F, 0, 0, 3)))
		.build();

	static final AnimationDefinition WALK = AnimationDefinition.Builder.withLength(1.2F).looping()
		.addAnimation("left_leg", rot(r(0, 0, 0, 0), r(0.3F, -24, 0, 0), r(0.6F, 0, 0, 0), r(0.9F, 24, 0, 0), r(1.2F, 0, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 0, 0, 0), r(0.3F, 24, 0, 0), r(0.6F, 0, 0, 0), r(0.9F, -24, 0, 0), r(1.2F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.3F, 12, 0, 0), r(0.6F, 0, 0, 0), r(0.9F, -12, 0, 0), r(1.2F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.3F, -6, 0, 0), r(0.6F, 0, 0, 0), r(0.9F, 6, 0, 0), r(1.2F, 0, 0, 0)))
		.addAnimation("hips", pos(p(0, 0, 0, 0), p(0.3F, 0, -1.0F, 0), p(0.6F, 0, 0, 0), p(0.9F, 0, -1.0F, 0), p(1.2F, 0, 0, 0)))
		.addAnimation("torso", rot(r(0, 4, 0, 0), r(0.3F, 6, 3, 0), r(0.6F, 4, 0, 0), r(0.9F, 6, -3, 0), r(1.2F, 4, 0, 0)))
		.build();

	/** Dormant: kneeling with the greatsword planted, head bowed. */
	static final AnimationDefinition KNEEL = AnimationDefinition.Builder.withLength(4.0F).looping()
		.addAnimation("hips", pos(p(0, 0, -11, 0), p(4.0F, 0, -11, 0)))
		.addAnimation("left_leg", pos(p(0, 0, -11, -1), p(4.0F, 0, -11, -1)))
		.addAnimation("right_leg", pos(p(0, 0, -11, 1), p(4.0F, 0, -11, 1)))
		.addAnimation("left_leg", rot(r(0, -70, 0, -6), r(4.0F, -70, 0, -6)))
		.addAnimation("right_leg", rot(r(0, 62, 0, 6), r(4.0F, 62, 0, 6)))
		.addAnimation("torso", rot(r(0, 22, 0, 0), r(2.0F, 24, 0, 0), r(4.0F, 22, 0, 0)))
		.addAnimation("head", rot(r(0, 38, 0, 0), r(2.0F, 40, 0, 0), r(4.0F, 38, 0, 0)))
		.addAnimation("left_arm", rot(r(0, -52, 0, 22), r(4.0F, -52, 0, 22)))
		.addAnimation("right_arm", rot(r(0, -52, 0, -22), r(4.0F, -52, 0, -22)))
		.addAnimation("sword", rot(r(0, -70, 0, 0), r(4.0F, -70, 0, 0)))
		.addAnimation("cloak", rot(r(0, 25, 0, 0), r(4.0F, 25, 0, 0)))
		.build();

	/** Rising from the kneel, wrenching the sword free and raising it with a roar. */
	static final AnimationDefinition AWAKEN = AnimationDefinition.Builder.withLength(2.8F)
		.addAnimation("hips", pos(p(0, 0, -11, 0), p(0.6F, 0, -11, 0), p(1.3F, 0, 0, 0), p(2.8F, 0, 0, 0)))
		.addAnimation("left_leg", pos(p(0, 0, -11, -1), p(0.6F, 0, -11, -1), p(1.3F, 0, 0, 0), p(2.8F, 0, 0, 0)))
		.addAnimation("right_leg", pos(p(0, 0, -11, 1), p(0.6F, 0, -11, 1), p(1.3F, 0, 0, 0), p(2.8F, 0, 0, 0)))
		.addAnimation("left_leg", rot(r(0, -70, 0, -6), r(0.6F, -70, 0, -6), r(1.3F, 0, 0, -4), r(2.8F, 0, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 62, 0, 6), r(0.6F, 62, 0, 6), r(1.3F, 0, 0, 4), r(2.8F, 0, 0, 0)))
		.addAnimation("torso", rot(r(0, 22, 0, 0), r(0.6F, 30, 0, 0), r(1.3F, -8, 0, 0), r(1.8F, -18, 0, 0), r(2.4F, -10, 0, 0), r(2.8F, 0, 0, 0)))
		.addAnimation("head", rot(r(0, 38, 0, 0), r(0.5F, 30, 0, 0), r(1.3F, -10, 0, 0), r(1.8F, -35, 0, 0), r(2.4F, -20, 0, 0), r(2.8F, 0, 0, 0)))
		.addAnimation("jaw", rot(r(0, 0, 0, 0), r(1.5F, 0, 0, 0), r(1.8F, 35, 0, 0), r(2.4F, 30, 0, 0), r(2.8F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, -52, 0, 22), r(0.6F, -52, 0, 22), r(1.3F, -20, 0, -10), r(1.8F, -10, 0, -50), r(2.4F, -10, 0, -40),
			r(2.8F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, -52, 0, -22), r(0.6F, -52, 0, -22), r(1.3F, -120, 0, 10), r(1.8F, -170, 0, 15), r(2.4F, -150, 0, 15),
			r(2.8F, 0, 0, 0)))
		.addAnimation("sword", rot(r(0, -70, 0, 0), r(0.6F, -70, 0, 0), r(1.3F, -30, 0, 0), r(1.8F, -60, 0, 0), r(2.8F, 0, 0, 0)))
		.addAnimation("cloak", rot(r(0, 25, 0, 0), r(1.3F, 10, 0, 0), r(1.8F, 30, 0, 0), r(2.8F, 0, 0, 0)))
		.build();

	/** Forehand cleave: wind up over the right shoulder (0.9 s), sweep across. */
	static final AnimationDefinition CLEAVE = AnimationDefinition.Builder.withLength(1.6F)
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(0.75F, -6, 32, 0), r(0.9F, -6, 35, 0), r(1.05F, 12, -38, 0), r(1.3F, 10, -30, 0), r(1.6F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.75F, -150, 0, 30), r(0.9F, -160, 0, 34), r(1.05F, -80, 0, -40), r(1.3F, -60, 0, -30),
			r(1.6F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.75F, -30, 0, -20), r(1.05F, 10, 0, -10), r(1.6F, 0, 0, 0)))
		.addAnimation("sword", rot(r(0, 0, 0, 0), r(0.75F, -40, 0, 0), r(1.05F, -60, 0, 0), r(1.6F, 0, 0, 0)))
		.addAnimation("left_leg", rot(r(0, 0, 0, 0), r(0.75F, 0, 0, -6), r(1.05F, -14, 0, -4), r(1.6F, 0, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 0, 0, 0), r(0.75F, 10, 0, 6), r(1.05F, 12, 0, 6), r(1.6F, 0, 0, 0)))
		.build();

	/** Backhand return swing (enraged combo). */
	static final AnimationDefinition CLEAVE_BACK = AnimationDefinition.Builder.withLength(1.2F)
		.addAnimation("torso", rot(r(0, 10, -30, 0), r(0.5F, 0, -38, 0), r(0.65F, 12, 34, 0), r(1.2F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, -60, 0, -30), r(0.5F, -110, 0, -50), r(0.65F, -70, 0, 40), r(1.2F, 0, 0, 0)))
		.addAnimation("sword", rot(r(0, -60, 0, 0), r(0.5F, -70, 0, 0), r(0.65F, -50, 0, 0), r(1.2F, 0, 0, 0)))
		.build();

	/** Point-blank ground slam: sword overhead (1.1 s) then down. */
	static final AnimationDefinition SLAM = AnimationDefinition.Builder.withLength(2.0F)
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(0.9F, -16, 0, 0), r(1.1F, -18, 0, 0), r(1.2F, 34, 0, 0), r(1.6F, 30, 0, 0), r(2.0F, 0, 0, 0)))
		.addAnimation("head", rot(r(0, 0, 0, 0), r(1.0F, -15, 0, 0), r(1.2F, 10, 0, 0), r(2.0F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.9F, -175, 0, -12), r(1.1F, -180, 0, -14), r(1.2F, -50, 0, -14), r(1.6F, -45, 0, -10),
			r(2.0F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.9F, -175, 0, 12), r(1.1F, -180, 0, 14), r(1.2F, -50, 0, 14), r(1.6F, -45, 0, 10),
			r(2.0F, 0, 0, 0)))
		.addAnimation("sword", rot(r(0, 0, 0, 0), r(0.9F, -110, 0, 0), r(1.2F, -40, 0, 0), r(2.0F, 0, 0, 0)))
		.addAnimation("hips", pos(p(0, 0, 0, 0), p(1.0F, 0, 1.0F, 0), p(1.2F, 0, -4, 0), p(1.6F, 0, -4, 0), p(2.0F, 0, 0, 0)))
		.addAnimation("left_leg", pos(p(0, 0, 0, 0), p(1.2F, 0, -4, -1), p(1.6F, 0, -4, -1), p(2.0F, 0, 0, 0)))
		.addAnimation("right_leg", pos(p(0, 0, 0, 0), p(1.2F, 0, -4, 1), p(1.6F, 0, -4, 1), p(2.0F, 0, 0, 0)))
		.addAnimation("left_leg", rot(r(0, 0, 0, 0), r(1.2F, -24, 0, -8), r(1.6F, -24, 0, -8), r(2.0F, 0, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 0, 0, 0), r(1.2F, 20, 0, 8), r(1.6F, 20, 0, 8), r(2.0F, 0, 0, 0)))
		.addAnimation("cloak", rot(r(0, 0, 0, 0), r(1.1F, 4, 0, 0), r(1.25F, 30, 0, 0), r(2.0F, 0, 0, 0)))
		.build();

	/** Plunges the sword into the floor: soul fire erupts beneath each delver. */
	static final AnimationDefinition ERUPT = AnimationDefinition.Builder.withLength(2.2F)
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(0.4F, -10, 0, 0), r(0.55F, 28, 0, 0), r(1.3F, 30, 0, 0), r(1.7F, 6, 0, 0), r(2.2F, 0, 0, 0)))
		.addAnimation("head", rot(r(0, 0, 0, 0), r(0.55F, 18, 0, 0), r(1.2F, -20, 0, 0), r(2.2F, 0, 0, 0)))
		.addAnimation("jaw", rot(r(0, 0, 0, 0), r(1.1F, 0, 0, 0), r(1.25F, 30, 0, 0), r(1.8F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.4F, -150, 0, 0), r(0.55F, -45, 0, -15), r(1.3F, -45, 0, -15), r(1.7F, -20, 0, 0),
			r(2.2F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.4F, -150, 0, 0), r(0.55F, -45, 0, 15), r(1.3F, -45, 0, 15), r(1.7F, -20, 0, 0),
			r(2.2F, 0, 0, 0)))
		.addAnimation("sword", rot(r(0, 0, 0, 0), r(0.4F, -60, 0, 0), r(0.55F, -95, 0, 0), r(1.3F, -95, 0, 0), r(2.2F, 0, 0, 0)))
		.addAnimation("hips", pos(p(0, 0, 0, 0), p(0.55F, 0, -3, 0), p(1.3F, 0, -3, 0), p(1.8F, 0, 0, 0)))
		.addAnimation("left_leg", pos(p(0, 0, 0, 0), p(0.55F, 0, -3, -1), p(1.3F, 0, -3, -1), p(1.8F, 0, 0, 0)))
		.addAnimation("right_leg", pos(p(0, 0, 0, 0), p(0.55F, 0, -3, 1), p(1.3F, 0, -3, 1), p(1.8F, 0, 0, 0)))
		.build();

	/** Lowers into a thrusting stance before the charge. */
	static final AnimationDefinition CHARGE_WINDUP = AnimationDefinition.Builder.withLength(1.0F)
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(0.6F, 26, 10, 0), r(1.0F, 30, 12, 0)))
		.addAnimation("head", rot(r(0, 0, 0, 0), r(0.6F, -20, 0, 0), r(1.0F, -22, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.6F, -60, 0, 20), r(1.0F, -70, 0, 24)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.6F, -40, 0, -30), r(1.0F, -45, 0, -30)))
		.addAnimation("sword", rot(r(0, 0, 0, 0), r(0.6F, -45, 0, 0), r(1.0F, -50, 0, 0)))
		.addAnimation("left_leg", rot(r(0, 0, 0, 0), r(0.6F, -30, 0, 0), r(1.0F, -32, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 0, 0, 0), r(0.6F, 25, 0, 0), r(1.0F, 28, 0, 0)))
		.addAnimation("hips", pos(p(0, 0, 0, 0), p(0.6F, 0, -3, 0), p(1.0F, 0, -3, 0)))
		.addAnimation("left_leg", pos(p(0, 0, 0, 0), p(0.6F, 0, -3, 0), p(1.0F, 0, -3, 0)))
		.addAnimation("right_leg", pos(p(0, 0, 0, 0), p(0.6F, 0, -3, 0), p(1.0F, 0, -3, 0)))
		.build();

	static final AnimationDefinition CHARGING = AnimationDefinition.Builder.withLength(0.5F).looping()
		.addAnimation("torso", rot(r(0, 34, 10, 0), r(0.25F, 36, 8, 0), r(0.5F, 34, 10, 0)))
		.addAnimation("head", rot(r(0, -25, 0, 0), r(0.5F, -25, 0, 0)))
		.addAnimation("right_arm", rot(r(0, -75, 0, 24), r(0.5F, -75, 0, 24)))
		.addAnimation("left_arm", rot(r(0, -30, 0, -20), r(0.25F, 20, 0, -20), r(0.5F, -30, 0, -20)))
		.addAnimation("sword", rot(r(0, -50, 0, 0), r(0.5F, -50, 0, 0)))
		.addAnimation("left_leg", rot(r(0, -40, 0, 0), r(0.25F, 40, 0, 0), r(0.5F, -40, 0, 0)))
		.addAnimation("right_leg", rot(r(0, 40, 0, 0), r(0.25F, -40, 0, 0), r(0.5F, 40, 0, 0)))
		.addAnimation("cloak", rot(r(0, 50, 0, 0), r(0.25F, 60, 0, 0), r(0.5F, 50, 0, 0)))
		.build();

	static final AnimationDefinition STUNNED = AnimationDefinition.Builder.withLength(1.6F).looping()
		.addAnimation("torso", rot(r(0, 24, 0, 6), r(0.8F, 26, 0, -6), r(1.6F, 24, 0, 6)))
		.addAnimation("head", rot(r(0, 30, 10, 12), r(0.8F, 35, -10, -12), r(1.6F, 30, 10, 12)))
		.addAnimation("jaw", rot(r(0, 18, 0, 0), r(0.8F, 22, 0, 0), r(1.6F, 18, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 10, 0, 10), r(0.8F, 14, 0, 8), r(1.6F, 10, 0, 10)))
		.addAnimation("left_arm", rot(r(0, 10, 0, -10), r(0.8F, 14, 0, -8), r(1.6F, 10, 0, -10)))
		.addAnimation("sword", rot(r(0, 30, 0, 0), r(1.6F, 30, 0, 0)))
		.addAnimation("hips", pos(p(0, 0, -2, 0), p(1.6F, 0, -2, 0)))
		.addAnimation("left_leg", pos(p(0, 0, -2, 0), p(1.6F, 0, -2, 0)))
		.addAnimation("right_leg", pos(p(0, 0, -2, 0), p(1.6F, 0, -2, 0)))
		.addAnimation("left_leg", rot(r(0, -12, 0, -6), r(1.6F, -12, 0, -6)))
		.addAnimation("right_leg", rot(r(0, 10, 0, 6), r(1.6F, 10, 0, 6)))
		.build();

	/** Off-hand raised twice to loose fans of soul bolts. */
	static final AnimationDefinition VOLLEY = AnimationDefinition.Builder.withLength(2.3F)
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.6F, -100, 0, -20), r(0.8F, -85, 0, -10), r(1.3F, -100, 0, -20), r(1.5F, -85, 0, -10),
			r(2.3F, 0, 0, 0)))
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(0.6F, -6, -14, 0), r(0.8F, 4, -10, 0), r(1.3F, -6, -14, 0), r(1.5F, 4, -10, 0), r(2.3F, 0, 0, 0)))
		.addAnimation("head", rot(r(0, 0, 0, 0), r(0.6F, -10, 0, 0), r(1.5F, -10, 0, 0), r(2.3F, 0, 0, 0)))
		.addAnimation("jaw", rot(r(0, 0, 0, 0), r(0.7F, 25, 0, 0), r(0.9F, 0, 0, 0), r(1.4F, 25, 0, 0), r(1.6F, 0, 0, 0)))
		.build();

	static final AnimationDefinition ROAR = AnimationDefinition.Builder.withLength(2.5F)
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(0.4F, 15, 0, 0), r(0.8F, -22, 0, 0), r(2.0F, -20, 0, 0), r(2.5F, 0, 0, 0)))
		.addAnimation("head", rot(r(0, 0, 0, 0), r(0.4F, 20, 0, 0), r(0.8F, -40, 0, 0), r(2.0F, -38, 0, 0), r(2.5F, 0, 0, 0)))
		.addAnimation("jaw", rot(r(0, 0, 0, 0), r(0.7F, 0, 0, 0), r(0.9F, 40, 0, 0), r(2.0F, 38, 0, 0), r(2.4F, 0, 0, 0)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.4F, -20, 0, 10), r(0.8F, -30, 0, -70), r(2.0F, -30, 0, -65), r(2.5F, 0, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.4F, -20, 0, -10), r(0.8F, -30, 0, 70), r(2.0F, -30, 0, 65), r(2.5F, 0, 0, 0)))
		.addAnimation("cloak", rot(r(0, 0, 0, 0), r(0.9F, 40, 0, 0), r(2.0F, 35, 0, 0), r(2.5F, 0, 0, 0)))
		.build();

	/** Staggers, drops to its knees, and slumps as the soul leaves the armour. */
	static final AnimationDefinition DEATH = AnimationDefinition.Builder.withLength(5.0F)
		.addAnimation("hips", pos(p(0, 0, 0, 0), p(0.6F, 0, -1, 0), p(1.4F, 0, -11, 0), p(5.0F, 0, -12, 0)))
		.addAnimation("left_leg", pos(p(0, 0, 0, 0), p(1.4F, 0, -11, -1), p(5.0F, 0, -12, -1)))
		.addAnimation("right_leg", pos(p(0, 0, 0, 0), p(1.4F, 0, -11, 1), p(5.0F, 0, -12, 1)))
		.addAnimation("left_leg", rot(r(0, 0, 0, 0), r(1.4F, -75, 0, -10), r(5.0F, -78, 0, -12)))
		.addAnimation("right_leg", rot(r(0, 0, 0, 0), r(1.4F, -75, 0, 10), r(5.0F, -78, 0, 12)))
		.addAnimation("torso", rot(r(0, 0, 0, 0), r(0.6F, -18, 10, 0), r(1.4F, 10, 0, 0), r(3.0F, 25, 0, 0), r(4.0F, 55, 0, 6), r(5.0F, 60, 0, 6)))
		.addAnimation("head", rot(r(0, 0, 0, 0), r(0.6F, -30, 0, 0), r(1.4F, 20, 0, 0), r(4.0F, 45, 10, 15), r(5.0F, 50, 10, 18)))
		.addAnimation("jaw", rot(r(0, 0, 0, 0), r(0.6F, 30, 0, 0), r(2.0F, 30, 0, 0), r(4.0F, 40, 0, 0), r(5.0F, 40, 0, 0)))
		.addAnimation("right_arm", rot(r(0, 0, 0, 0), r(0.6F, -40, 0, 30), r(1.4F, -10, 0, 20), r(4.0F, 30, 0, 10), r(5.0F, 35, 0, 8)))
		.addAnimation("left_arm", rot(r(0, 0, 0, 0), r(0.6F, -20, 0, -30), r(1.4F, -10, 0, -20), r(4.0F, 30, 0, -10), r(5.0F, 35, 0, -8)))
		.addAnimation("sword", rot(r(0, 0, 0, 0), r(1.4F, 40, 0, 0), r(5.0F, 55, 0, 0)))
		.addAnimation("cloak", rot(r(0, 0, 0, 0), r(1.4F, 20, 0, 0), r(5.0F, 5, 0, 0)))
		.build();
}
