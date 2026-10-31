package com.jjkshowdown.mixin.client;

import com.jjkshowdown.client.input.InputHandler;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
public abstract class MouseHandlerMixin {
	/** No looking around while paralysed or during cinematics. */
	@Inject(method = "turnPlayer", at = @At("HEAD"), cancellable = true)
	private void jjk$lockLook(double delta, CallbackInfo ci) {
		if (InputHandler.movementLocked()) ci.cancel();
	}
}
