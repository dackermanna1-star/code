package com.jjkshowdown.mixin;

import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import net.minecraft.world.entity.Mob;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Mob.class)
public abstract class MobMixin {
	/** Paralysed (Unlimited Void), staggered or cinematic-locked mobs stop thinking. Bosses handle this themselves. */
	@Inject(method = "serverAiStep", at = @At("HEAD"), cancellable = true)
	private void jjk$freezeAi(CallbackInfo ci) {
		Mob self = (Mob) (Object) this;
		if (self instanceof SorcererBoss) return;
		SorcererState s = Sorcerers.peekState(self);
		if (self.hasEffect(ModEffects.INFORMATION_OVERLOAD) || (s != null && (s.staggerTicks > 0 || s.cinematicLock > 0))) {
			self.getNavigation().stop();
			self.setZza(0);
			self.setXxa(0);
			self.setYya(0);
			self.setJumping(false);
			ci.cancel();
		}
	}
}
