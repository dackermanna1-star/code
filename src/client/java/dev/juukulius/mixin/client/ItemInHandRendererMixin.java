package dev.juukulius.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.juukulius.character.JuliusAppearance;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.client.anim.AnimatorManager;
import dev.juukulius.client.anim.ClientClock;
import dev.juukulius.client.anim.PlayerAnimator;
import dev.juukulius.client.anim.PoseSnapshot;
import dev.juukulius.client.fx.BladeTrails;
import dev.juukulius.registry.JuliusItems;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.ItemInHandRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.item.ItemStack;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * First-person Julius: the sword follows each technique's first-person track (slashes sweep across the view, the
 * charge raises the blade), the casting hand appears for spirit arts, and the blade trail and Al Clarista light are drawn
 * in the hand pass.
 */
@Mixin(ItemInHandRenderer.class)
public abstract class ItemInHandRendererMixin {
	@Inject(method = "renderHandsWithItems", at = @At("HEAD"))
	private void julius$updateLocalAnimator(float partialTick, PoseStack poseStack, SubmitNodeCollector collector, LocalPlayer player, int light,
		CallbackInfo ci) {
		JuliusAppearance appearance = JuliusAttachments.appearance(player);
		PlayerAnimator animator = AnimatorManager.peek(player.getId());
		if (appearance.transformed() || animator != null && animator.hasAction()) {
			AnimatorManager.get(player.getId()).update(player, player.walkAnimation.position(partialTick), player.walkAnimation.speed(partialTick),
				appearance, partialTick);
		}
	}

	@Inject(method = "renderHandsWithItems", at = @At(value = "INVOKE",
		target = "Lnet/minecraft/client/renderer/feature/FeatureRenderDispatcher;renderAllFeatures()V"))
	private void julius$firstPersonEffects(float partialTick, PoseStack poseStack, SubmitNodeCollector collector, LocalPlayer player, int light,
		CallbackInfo ci) {
		if (JuliusAttachments.appearance(player).transformed()) {
			BladeTrails.renderFirstPerson(collector, Minecraft.getInstance().gameRenderer.getMainCamera(), ClientClock.seconds(partialTick));
		}
	}

	/** The empty off hand is normally never drawn; show it while an art is being cast. */
	@Inject(method = "renderArmWithItem", at = @At("HEAD"))
	private void julius$castingHand(AbstractClientPlayer player, float partialTick, float pitch, InteractionHand hand, float swingProgress, ItemStack stack,
		float equipProgress, PoseStack poseStack, SubmitNodeCollector collector, int light, CallbackInfo ci) {
		if (hand != InteractionHand.OFF_HAND || !stack.isEmpty() || player.isInvisible()) {
			return;
		}

		PlayerAnimator animator = AnimatorManager.peek(player.getId());
		PoseSnapshot pose = animator != null ? animator.snapshot : null;
		if (pose == null || !pose.active || pose.fpOffWeight < 0.02F || !JuliusAttachments.appearance(player).transformed()) {
			return;
		}

		HumanoidArm arm = player.getMainArm().getOpposite();
		float side = arm == HumanoidArm.RIGHT ? 1.0F : -1.0F;
		float weight = pose.fpOffWeight;
		poseStack.pushPose();
		poseStack.translate(side * pose.fpOffPos[0] / 16.0F, pose.fpOffPos[1] / 16.0F - (1.0F - weight) * 0.6F, pose.fpOffPos[2] / 16.0F);
		poseStack.mulPose(new Quaternionf().rotationXYZ(pose.fpOffRot[0] * Mth.DEG_TO_RAD, side * pose.fpOffRot[1] * Mth.DEG_TO_RAD,
			side * pose.fpOffRot[2] * Mth.DEG_TO_RAD));
		((ItemInHandRendererAccessor) this).julius$renderPlayerArm(poseStack, collector, light, 0.0F, 0.0F, arm);
		poseStack.popPose();
	}

	@Inject(method = "renderArmWithItem", at = @At(value = "INVOKE",
		target = "Lnet/minecraft/client/renderer/ItemInHandRenderer;renderItem(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/item/ItemDisplayContext;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;I)V",
		ordinal = 1))
	private void julius$firstPersonSword(AbstractClientPlayer player, float partialTick, float pitch, InteractionHand hand, float swingProgress,
		ItemStack stack, float equipProgress, PoseStack poseStack, SubmitNodeCollector collector, int light, CallbackInfo ci) {
		if (hand != InteractionHand.MAIN_HAND || !stack.is(JuliusItems.HOUSE_JUUKULIUS_SWORD)) {
			return;
		}

		JuliusAppearance appearance = JuliusAttachments.appearance(player);
		PlayerAnimator animator = AnimatorManager.peek(player.getId());
		if (!appearance.transformed() || animator == null) {
			return;
		}

		PoseSnapshot pose = animator.snapshot;
		boolean leftHanded = player.getMainArm() == HumanoidArm.LEFT;
		float side = leftHanded ? -1.0F : 1.0F;
		if (pose.active) {
			poseStack.translate(side * pose.fpMainPos[0] / 16.0F, pose.fpMainPos[1] / 16.0F, pose.fpMainPos[2] / 16.0F);
			poseStack.mulPose(new Quaternionf().rotationXYZ(pose.fpMainRot[0] * Mth.DEG_TO_RAD, side * pose.fpMainRot[1] * Mth.DEG_TO_RAD,
				side * pose.fpMainRot[2] * Mth.DEG_TO_RAD));
		}

		float clad = 0.5F + animator.chargeProgress * 0.5F + (appearance.ultimateActive(player.level().getGameTime()) ? 0.35F : 0.0F);
		BladeTrails.captureFirstPerson(new Matrix4f(poseStack.last().pose()), leftHanded, Minecraft.getInstance().gameRenderer.getMainCamera(),
			animator.trailStyle, ClientClock.seconds(partialTick), clad);
	}
}
