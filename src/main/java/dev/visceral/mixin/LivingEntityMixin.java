package dev.visceral.mixin;

import dev.visceral.combat.CombatContext;
import dev.visceral.config.CommonConfig;
import dev.visceral.entity.CombatState;
import dev.visceral.entity.EntityTicker;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.physics.BalanceSystem;
import dev.visceral.physics.ImpactSystem;
import dev.visceral.registry.VisceralRegistry;
import dev.visceral.state.BodyRegion;
import dev.visceral.wound.WoundSystem;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Pose;
import org.jspecify.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(LivingEntity.class)
public abstract class LivingEntityMixin implements VisceralEntity {
	@Unique
	private @Nullable CombatState visceral$combat;
	@Unique
	private @Nullable Object visceral$clientData;

	@Override
	public @Nullable CombatState visceral$combatOrNull() {
		return visceral$combat;
	}

	@Override
	public CombatState visceral$combat() {
		if (visceral$combat == null) visceral$combat = new CombatState();
		return visceral$combat;
	}

	@Override
	public @Nullable Object visceral$clientData() {
		return visceral$clientData;
	}

	@Override
	public void visceral$setClientData(@Nullable Object data) {
		visceral$clientData = data;
	}

	@Inject(method = "tick", at = @At("TAIL"))
	private void visceral$tick(CallbackInfo ci) {
		LivingEntity self = (LivingEntity) (Object) this;
		if (self.tickCount == 1 && !self.level().isClientSide() && self.hasAttached(VisceralRegistry.WOUNDS)) WoundSystem.onLoad(self);
		EntityTicker.tick(self);
	}

	@Inject(method = "isImmobile", at = @At("RETURN"), cancellable = true)
	private void visceral$immobile(CallbackInfoReturnable<Boolean> cir) {
		if (visceral$combat != null && visceral$combat.state.incapacitated()) cir.setReturnValue(true);
	}

	@Inject(method = "getDimensions", at = @At("RETURN"), cancellable = true)
	private void visceral$downedDimensions(Pose pose, CallbackInfoReturnable<EntityDimensions> cir) {
		if (visceral$combat != null && BalanceSystem.useLowHitbox(visceral$combat)) {
			cir.setReturnValue(BalanceSystem.lowDimensions(cir.getReturnValue()));
		}
	}

	@Inject(method = "isPushable", at = @At("RETURN"), cancellable = true)
	private void visceral$pushable(CallbackInfoReturnable<Boolean> cir) {
		if (visceral$combat != null && visceral$combat.state.grounded()) cir.setReturnValue(false);
	}

	/** Regional / opening / finisher damage scaling for our melee hits. */
	@ModifyVariable(method = "hurtServer", at = @At("HEAD"), argsOnly = true, ordinal = 0)
	private float visceral$scaleMeleeDamage(float amount) {
		LivingEntity self = (LivingEntity) (Object) this;
		CombatContext ctx = CombatContext.forTarget(self);
		if (ctx == null) return amount;
		CommonConfig cfg = CommonConfig.get();
		float mul = ctx.def.usesWeaponDamage() ? ctx.def.damage * cfg.meleeDamageMultiplier : 1f;
		if (cfg.regionalDamage) {
			if (ctx.region == BodyRegion.HEAD) mul *= cfg.headDamageMultiplier;
			else if (ctx.region != BodyRegion.TORSO) mul *= cfg.limbDamageMultiplier;
		}
		if (ctx.opening) mul *= 1f + cfg.openingDamageBonus;
		float result = amount * mul;
		if (ctx.finisher) {
			float max = Math.max(1f, self.getMaxHealth());
			if ((self.getHealth() - result) / max <= cfg.finisherExecuteThreshold) result = Math.max(result, self.getHealth() + self.getAbsorptionAmount() + 1f);
		}
		return result;
	}

	@Inject(method = "hurtServer", at = @At("RETURN"))
	private void visceral$afterHurt(ServerLevel level, DamageSource source, float amount, CallbackInfoReturnable<Boolean> cir) {
		if (cir.getReturnValueZ()) ImpactSystem.onDamaged((LivingEntity) (Object) this, source, amount);
	}

	/** Our melee applies its own directional knockback. */
	@Inject(method = "knockback", at = @At("HEAD"), cancellable = true)
	private void visceral$suppressVanillaKnockback(double strength, double x, double z, CallbackInfo ci) {
		if (CombatContext.forTarget((LivingEntity) (Object) this) != null) ci.cancel();
	}
}
