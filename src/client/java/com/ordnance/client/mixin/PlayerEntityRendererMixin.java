package com.ordnance.client.mixin;

import com.ordnance.client.fx.WeaponPoses;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.render.entity.model.BipedEntityModel;
import net.minecraft.entity.PlayerLikeEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Hand;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Two-handed shoulder/hip poses for launchers and the flamethrower in third person. */
@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerEntityRendererMixin {
	@Inject(
		method = "getArmPose(Lnet/minecraft/entity/PlayerLikeEntity;Lnet/minecraft/item/ItemStack;Lnet/minecraft/util/Hand;)Lnet/minecraft/client/render/entity/model/BipedEntityModel$ArmPose;",
		at = @At("HEAD"),
		cancellable = true
	)
	private static void ordnance$weaponPose(PlayerLikeEntity player, ItemStack stack, Hand hand, CallbackInfoReturnable<BipedEntityModel.ArmPose> cir) {
		BipedEntityModel.ArmPose pose = WeaponPoses.armPose(player, stack, hand);
		if (pose != null) {
			cir.setReturnValue(pose);
		}
	}
}
