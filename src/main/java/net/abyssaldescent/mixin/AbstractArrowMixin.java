package net.abyssaldescent.mixin;

import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.item.combat.ProjectileTraits;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Runs dungeon-weapon traits when their arrows land; keeps dungeon archers' arrows from hitting their allies. */
@Mixin(AbstractArrow.class)
public abstract class AbstractArrowMixin {
	@Inject(method = "onHitEntity", at = @At("TAIL"))
	private void abyssal_descent$onHitEntity(EntityHitResult result, CallbackInfo ci) {
		ProjectileTraits.onImpact((Projectile) (Object) this, result.getEntity(), result.getLocation());
	}

	@Inject(method = "onHitBlock", at = @At("TAIL"))
	private void abyssal_descent$onHitBlock(BlockHitResult result, CallbackInfo ci) {
		ProjectileTraits.onImpact((Projectile) (Object) this, null, result.getLocation());
	}

	/** Arrows loosed by dungeon enemies pass through other dungeon enemies, like soul bolts do. */
	@Inject(method = "canHitEntity", at = @At("HEAD"), cancellable = true)
	private void abyssal_descent$passThroughAllies(Entity entity, CallbackInfoReturnable<Boolean> cir) {
		if (((Projectile) (Object) this).getOwner() instanceof DungeonMonster && entity instanceof DungeonMonster) {
			cir.setReturnValue(false);
		}
	}

	/** Lets on-hit affixes (Vampiric) see damage dealt by an enemy's arrows. Runs only after a successful hurt. */
	@Inject(method = "doPostHurtEffects", at = @At("HEAD"))
	private void abyssal_descent$onArrowHurt(LivingEntity target, CallbackInfo ci) {
		AbstractArrow arrow = (AbstractArrow) (Object) this;
		if (arrow.getOwner() instanceof DungeonMonster monster && arrow.level() instanceof ServerLevel level) {
			monster.onDamageDealt(level, (float) (((AbstractArrowAccessor) arrow).abyssal_descent$getBaseDamage() * arrow.getDeltaMovement().length()));
		}
	}
}
