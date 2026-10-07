package dev.visceral.mixin;

import dev.visceral.wound.WoundService;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Observes every successful hit, including the lethal one (Fabric's AFTER_DAMAGE skips those),
 * and measures how much health it really took after armor and absorption.
 */
@Mixin(LivingEntity.class)
abstract class LivingEntityMixin {
	@Unique
	private float visceral$healthBeforeHurt;

	@Inject(method = "hurtServer", at = @At("HEAD"))
	private void visceral$rememberHealth(ServerLevel level, DamageSource source, float amount, CallbackInfoReturnable<Boolean> cir) {
		LivingEntity self = (LivingEntity) (Object) this;
		this.visceral$healthBeforeHurt = self.getHealth() + self.getAbsorptionAmount();
	}

	@Inject(method = "hurtServer", at = @At("RETURN"))
	private void visceral$afterHurt(ServerLevel level, DamageSource source, float amount, CallbackInfoReturnable<Boolean> cir) {
		if (!cir.getReturnValueZ()) {
			return;
		}
		LivingEntity self = (LivingEntity) (Object) this;
		float lost = this.visceral$healthBeforeHurt - (self.getHealth() + self.getAbsorptionAmount());
		WoundService.onDamaged(self, level, source, amount, lost);
	}
}
