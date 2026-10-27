package dev.visceral.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.visceral.client.anim.AnimPose;
import dev.visceral.client.anim.EntityAnimator;
import dev.visceral.client.anim.PoseApplier;
import dev.visceral.client.anim.Rig;
import dev.visceral.client.fx.WoundLayer;
import dev.visceral.client.physics.RagdollManager;
import dev.visceral.registry.VisceralRegistry;
import dev.visceral.state.BloodType;
import dev.visceral.state.WoundList;
import dev.visceral.mixin.client.AgeableMobRendererAccessor;
import net.fabricmc.fabric.api.client.rendering.v1.FabricRenderState;
import net.fabricmc.fabric.api.client.rendering.v1.RenderStateDataKey;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.monster.piglin.ZombifiedPiglinModel;
import net.minecraft.client.model.monster.zombie.AbstractZombieModel;
import net.minecraft.client.model.monster.zombie.ZombieVillagerModel;
import net.minecraft.client.renderer.entity.AgeableMobRenderer;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.state.ArmedEntityRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.world.entity.LivingEntity;
import org.joml.Matrix4f;

/** Glue between vanilla's extract/submit render pipeline and the animation system. */
public final class RenderHooks {
	public static final RenderStateDataKey<AnimPose> POSE = RenderStateDataKey.create(() -> "visceral:pose");
	public static final RenderStateDataKey<EntityAnimator> ANIMATOR = RenderStateDataKey.create(() -> "visceral:animator");
	public static final RenderStateDataKey<Matrix4f> ORIGIN = RenderStateDataKey.create(() -> "visceral:origin");

	private static boolean worldExtraction;
	private static int frameId;

	private RenderHooks() {
	}

	public static void beginWorldExtraction() {
		worldExtraction = true;
		frameId++;
		RagdollManager.stepAll();
	}

	public static void endWorldExtraction() {
		worldExtraction = false;
	}

	public static boolean inWorldExtraction() {
		return worldExtraction;
	}

	/** After {@code LivingEntityRenderer.extractRenderState}: run the animator, attach its pose. */
	public static void onExtract(LivingEntityRenderer<?, ?, ?> renderer, LivingEntity entity, LivingEntityRenderState state, float partialTick) {
		if (!worldExtraction) return;
		WoundList wounds = entity.getAttached(VisceralRegistry.WOUNDS);
		if (wounds != null) {
			state.setData(WoundLayer.WOUNDS, wounds);
			state.setData(WoundLayer.BLOOD, BloodType.of(entity));
		}
		EntityAnimator anim = EntityAnimator.getOrCreate(entity);
		Model<?> model = renderer.getModel();
		if (renderer instanceof AgeableMobRenderer<?, ?, ?> ageable) {
			AgeableMobRendererAccessor acc = (AgeableMobRendererAccessor) ageable;
			model = state.isBaby ? acc.visceral$babyModel() : acc.visceral$adultModel();
		}
		// Armor stands and mannequins are posed by players; leave them alone.
		if (model instanceof HumanoidModel<?> humanoid && !entity.getType().is(dev.visceral.registry.VisceralTags.NO_PHYSICS)) {
			anim.rig = Rig.of(humanoid);
			anim.zombieArms = humanoid instanceof AbstractZombieModel<?> || humanoid instanceof ZombifiedPiglinModel || humanoid instanceof ZombieVillagerModel;
		} else {
			anim.rig = null;
		}
		anim.frame(state, partialTick, frameId);
		AnimPose pose = anim.pose;
		if (!pose.active) return;
		FabricRenderState fs = state;
		fs.setData(POSE, pose);
		fs.setData(ANIMATOR, anim);
		if (pose.suppressVanillaAttack && state instanceof ArmedEntityRenderState armed) armed.attackTime = 0;
		if (pose.noRedOverlay) state.hasRedOverlay = false;
		if (pose.worldWeight > 0 || anim.isDead()) state.deathTime = 0;
	}

	/** Start of {@code LivingEntityRenderer.submit}: remember the entity-origin matrix. */
	public static void captureOrigin(LivingEntityRenderState state, PoseStack poseStack) {
		AnimPose pose = state.getData(POSE);
		if (pose == null) return;
		Matrix4f origin = state.getData(ORIGIN);
		if (origin == null) {
			origin = new Matrix4f();
			state.setData(ORIGIN, origin);
		}
		origin.set(poseStack.last().pose());
	}

	/** Once the model matrix is final: compute model-to-entity. */
	public static void captureModelMatrix(LivingEntityRenderState state, PoseStack poseStack) {
		AnimPose pose = state.getData(POSE);
		Matrix4f origin = state.getData(ORIGIN);
		if (pose == null || origin == null) return;
		pose.modelToEntity.set(origin).invertAffine().mul(poseStack.last().pose());
		pose.hasModelMatrix = true;
	}

	/** Our root transform, applied right after (or instead of) vanilla's setupRotations. */
	public static boolean overridesRootYaw(LivingEntityRenderState state) {
		AnimPose pose = state.getData(POSE);
		return pose != null && pose.overrideRootYaw && pose.worldWeight < 1f;
	}

	public static void applyRootYawOverride(LivingEntityRenderState state, PoseStack poseStack) {
		AnimPose pose = state.getData(POSE);
		poseStack.mulPose(Axis.YP.rotationDegrees(180f - pose.rootYawAbsolute));
	}

	public static void applyRoot(LivingEntityRenderState state, PoseStack poseStack) {
		AnimPose pose = state.getData(POSE);
		if (pose == null || pose.worldWeight >= 1f) return;
		float inv = 1f / Math.max(0.05f, state.scale);
		float pivot = pose.rootPivotY * inv;
		if (pose.rootX != 0 || pose.rootY != 0 || pose.rootZ != 0 || pivot != 0) poseStack.translate(pose.rootX * inv, pose.rootY * inv + pivot, -pose.rootZ * inv);
		if (pose.rootYaw != 0) poseStack.mulPose(Axis.YP.rotationDegrees(pose.rootYaw));
		if (pose.rootPitch != 0) poseStack.mulPose(Axis.XP.rotationDegrees(-pose.rootPitch));
		if (pose.rootRoll != 0) poseStack.mulPose(Axis.ZP.rotationDegrees(-pose.rootRoll));
		if (pivot != 0) poseStack.translate(0, -pivot, 0);
	}

	/** After any {@code setupAnim} of a model rendered with one of our states. */
	public static void afterSetupAnim(Model<?> model, Object state) {
		if (!(model instanceof HumanoidModel<?> humanoid) || !(state instanceof FabricRenderState fs)) return;
		AnimPose pose = fs.getData(POSE);
		if (pose == null || !pose.active) return;
		EntityAnimator sink = fs.getData(ANIMATOR);
		PoseApplier.apply(humanoid, pose, sink);
	}
}
