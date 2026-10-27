package dev.visceral.mixin;

import dev.visceral.combat.MobCombat;
import dev.visceral.entity.CombatState;
import dev.visceral.entity.VisceralEntity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Converts instant mob melee into a telegraphed, interruptible wind-up. */
@Mixin(MeleeAttackGoal.class)
public abstract class MeleeAttackGoalMixin {
	@Shadow
	@Final
	protected PathfinderMob mob;

	@Shadow
	protected abstract boolean canPerformAttack(LivingEntity target);

	@Shadow
	protected abstract void resetAttackCooldown();

	@Inject(method = "checkAndPerformAttack", at = @At("HEAD"), cancellable = true)
	private void visceral$windup(LivingEntity target, CallbackInfo ci) {
		CombatState cs = VisceralEntity.getOrCreate(mob);
		if (cs.windupTicks > 0) {
			ci.cancel();
			return;
		}
		if (!canPerformAttack(target)) return;
		if (MobCombat.beginWindup(mob, cs, target)) {
			resetAttackCooldown();
			ci.cancel();
		}
	}
}
