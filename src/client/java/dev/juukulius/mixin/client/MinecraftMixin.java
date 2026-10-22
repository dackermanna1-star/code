package dev.juukulius.mixin.client;

import dev.juukulius.client.input.ClientCombat;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** While transformed with the sword in hand, the attack key drives Julius's combo instead of the vanilla attack. */
@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
	@Inject(method = "startAttack", at = @At("HEAD"), cancellable = true)
	private void julius$combo(CallbackInfoReturnable<Boolean> cir) {
		if (ClientCombat.onAttackKey((Minecraft) (Object) this)) {
			cir.setReturnValue(false);
		}
	}

	@Inject(method = "continueAttack", at = @At("HEAD"), cancellable = true)
	private void julius$noMiningWhileFighting(boolean attacking, CallbackInfo ci) {
		if (attacking && ClientCombat.blocksContinuousAttack((Minecraft) (Object) this)) {
			ci.cancel();
		}
	}
}
