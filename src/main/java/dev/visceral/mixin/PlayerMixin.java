package dev.visceral.mixin;

import dev.visceral.combat.CombatContext;
import dev.visceral.entity.VisceralEntity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(Player.class)
public abstract class PlayerMixin {
	@Inject(method = "isImmobile", at = @At("RETURN"), cancellable = true)
	private void visceral$immobile(CallbackInfoReturnable<Boolean> cir) {
		if (VisceralEntity.state((Player) (Object) this).incapacitated()) cir.setReturnValue(true);
	}

	/** Our swings sweep their own arc; vanilla's sweep would double-dip. */
	@Inject(method = "isSweepAttack", at = @At("HEAD"), cancellable = true)
	private void visceral$noVanillaSweep(boolean charged, boolean crit, boolean sprint, CallbackInfoReturnable<Boolean> cir) {
		if (CombatContext.active()) cir.setReturnValue(false);
	}
}
