package dev.overkill.client.mixin;

import dev.overkill.registry.ModItems;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Avatar;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Players hold the arsenal's guns shouldered and aimed (like a loaded crossbow) instead of dangling at
 * their side. The Sunline Rifle stays aimed while its beam is held, too.
 */
@Mixin(AvatarRenderer.class)
public abstract class AvatarRendererMixin {
	@Inject(method = "getArmPose(Lnet/minecraft/world/entity/Avatar;Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/InteractionHand;)Lnet/minecraft/client/model/HumanoidModel$ArmPose;",
		at = @At("HEAD"), cancellable = true)
	private static void overkill$aimGuns(Avatar avatar, ItemStack stack, InteractionHand hand, CallbackInfoReturnable<HumanoidModel.ArmPose> cir) {
		boolean gun = stack.is(ModItems.SUNLINE_RIFLE) || stack.is(ModItems.WORLDBREAKER_CANNON) || stack.is(ModItems.GRAVEMAKER);
		boolean usingThisHand = avatar.getUsedItemHand() == hand && avatar.getUseItemRemainingTicks() > 0;
		if (gun && !avatar.swinging && (!usingThisHand || stack.is(ModItems.SUNLINE_RIFLE))) {
			cir.setReturnValue(HumanoidModel.ArmPose.CROSSBOW_HOLD);
		}
	}
}
