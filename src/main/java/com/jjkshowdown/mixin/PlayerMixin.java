package com.jjkshowdown.mixin;

import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Player.class)
public abstract class PlayerMixin {
	/** No attacking while paralysed, staggered, guarding or locked in a cinematic. */
	@Inject(method = "attack", at = @At("HEAD"), cancellable = true)
	private void jjk$attack(Entity target, CallbackInfo ci) {
		Player self = (Player) (Object) this;
		if (self.level().isClientSide()) return;
		if (self.hasEffect(ModEffects.INFORMATION_OVERLOAD)) {
			ci.cancel();
			return;
		}
		SorcererState s = Sorcerers.peekState(self);
		if (s != null && (s.staggerTicks > 0 || s.cinematicLock > 0 || s.blocking)) ci.cancel();
	}
}
