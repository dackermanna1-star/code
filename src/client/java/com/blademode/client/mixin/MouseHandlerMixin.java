package com.blademode.client.mixin;

import com.blademode.client.BladeInput;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;

/** While a cut is being drawn the camera stays still and the mouse moves the line's end instead. */
@Mixin(MouseHandler.class)
public abstract class MouseHandlerMixin {
	@Shadow
	@Final
	private Minecraft minecraft;

	@WrapOperation(method = "turnPlayer", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;turn(DD)V"))
	private void blademode$turn(LocalPlayer player, double yaw, double pitch, Operation<Void> original) {
		if (!BladeInput.onTurn(this.minecraft, yaw, pitch)) {
			original.call(player, yaw, pitch);
		}
	}
}
