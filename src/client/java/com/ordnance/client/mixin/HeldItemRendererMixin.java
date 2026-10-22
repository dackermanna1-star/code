package com.ordnance.client.mixin;

import com.ordnance.client.fx.WeaponPoses;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.item.HeldItemRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Hand;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** First-person recoil kick and reload motion for Ordnance weapons. */
@Mixin(HeldItemRenderer.class)
public abstract class HeldItemRendererMixin {
	@Inject(
		method = "renderFirstPersonItem",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/client/util/math/MatrixStack;push()V", shift = At.Shift.AFTER, ordinal = 0)
	)
	private void ordnance$weaponViewModel(
		AbstractClientPlayerEntity player,
		float tickProgress,
		float pitch,
		Hand hand,
		float swingProgress,
		ItemStack item,
		float equipProgress,
		MatrixStack matrices,
		OrderedRenderCommandQueue queue,
		int light,
		CallbackInfo ci
	) {
		WeaponPoses.applyViewModel(player, hand, item, matrices, tickProgress);
	}
}
