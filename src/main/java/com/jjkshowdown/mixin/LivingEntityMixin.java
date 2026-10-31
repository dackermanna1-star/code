package com.jjkshowdown.mixin;

import com.jjkshowdown.combat.CombatHandler;
import com.jjkshowdown.sorcerer.SorcererTicker;
import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LivingEntity.class)
public abstract class LivingEntityMixin {
	/** Route all damage through the combat pipeline (Infinity, guard, combos, Black Flash, ...). */
	@WrapMethod(method = "hurtServer")
	private boolean jjk$hurtServer(ServerLevel level, DamageSource source, float amount, Operation<Boolean> original) {
		LivingEntity self = (LivingEntity) (Object) this;
		CombatHandler.Hit hit = CombatHandler.pre(self, level, source, amount);
		if (hit.cancel) return false;
		boolean applied = original.call(level, source, hit.amount);
		CombatHandler.post(self, level, source, hit, applied);
		return applied;
	}

	@Inject(method = "tick", at = @At("TAIL"))
	private void jjk$tick(CallbackInfo ci) {
		SorcererTicker.tick((LivingEntity) (Object) this);
	}
}
