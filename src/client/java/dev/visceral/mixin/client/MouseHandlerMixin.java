package dev.visceral.mixin.client;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.visceral.client.camera.ShoulderCamera;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** With the decoupled camera, the mouse orbits the camera instead of turning the character. */
@Mixin(MouseHandler.class)
public abstract class MouseHandlerMixin {
	@WrapOperation(method = "turnPlayer", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;turn(DD)V"))
	private void visceral$turn(LocalPlayer player, double dx, double dy, Operation<Void> original) {
		if (ShoulderCamera.decoupled()) ShoulderCamera.turn(dx, dy);
		else original.call(player, dx, dy);
	}
}
