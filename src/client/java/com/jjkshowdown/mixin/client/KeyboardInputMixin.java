package com.jjkshowdown.mixin.client;

import com.jjkshowdown.client.input.InputHandler;
import net.minecraft.client.player.ClientInput;
import net.minecraft.client.player.KeyboardInput;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.phys.Vec2;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(KeyboardInput.class)
public abstract class KeyboardInputMixin {
	/** Freeze movement input under Unlimited Void and during cinematics (server enforces the same). */
	@Inject(method = "tick", at = @At("TAIL"))
	private void jjk$lock(CallbackInfo ci) {
		if (InputHandler.movementLocked()) {
			((ClientInput) (Object) this).keyPresses = Input.EMPTY;
			((ClientInputAccessor) this).jjk$setMoveVector(Vec2.ZERO);
		}
	}
}
