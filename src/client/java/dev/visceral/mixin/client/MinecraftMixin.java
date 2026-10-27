package dev.visceral.mixin.client;

import dev.visceral.client.input.CombatInput;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Routes left clicks into the timed melee system instead of vanilla's instant attack. */
@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
	@Shadow
	public MultiPlayerGameMode gameMode;

	@Inject(method = "startAttack", at = @At("HEAD"), cancellable = true)
	private void visceral$startAttack(CallbackInfoReturnable<Boolean> cir) {
		if (CombatInput.onAttackKey()) cir.setReturnValue(false);
	}

	@Inject(method = "continueAttack", at = @At("HEAD"), cancellable = true)
	private void visceral$continueAttack(boolean held, CallbackInfo ci) {
		if (held && CombatInput.suppressContinueAttack()) {
			if (gameMode != null) gameMode.stopDestroyBlock();
			ci.cancel();
		}
	}
}
