package com.blademode.client.mixin;

import com.blademode.client.BladeInput;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import org.jspecify.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** With the blade in hand, the attack button draws a cut line instead of attacking or mining. */
@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
	@Shadow
	public @Nullable MultiPlayerGameMode gameMode;

	@Inject(method = "startAttack", at = @At("HEAD"), cancellable = true)
	private void blademode$startAttack(CallbackInfoReturnable<Boolean> cir) {
		if (BladeInput.onAttackPressed((Minecraft) (Object) this)) {
			cir.setReturnValue(true);
		}
	}

	@Inject(method = "continueAttack", at = @At("HEAD"), cancellable = true)
	private void blademode$continueAttack(boolean attacking, CallbackInfo ci) {
		if (BladeInput.suppressContinuousAttack((Minecraft) (Object) this)) {
			if (this.gameMode != null) {
				this.gameMode.stopDestroyBlock();
			}
			ci.cancel();
		}
	}
}
