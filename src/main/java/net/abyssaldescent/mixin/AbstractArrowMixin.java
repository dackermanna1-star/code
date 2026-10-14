package net.abyssaldescent.mixin;

import net.abyssaldescent.item.combat.ProjectileTraits;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Runs dungeon-weapon traits when one of their arrows or bolts lands. */
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
}
