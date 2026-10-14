package net.abyssaldescent.mixin;

import net.abyssaldescent.item.combat.DamageHooks;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(LivingEntity.class)
public abstract class LivingEntityDamageMixin {
	@ModifyVariable(method = "hurtServer", at = @At("HEAD"), argsOnly = true)
	private float abyssal_descent$modifyDamage(float amount, ServerLevel level, DamageSource source) {
		return DamageHooks.modify((LivingEntity) (Object) this, source, amount);
	}
}
