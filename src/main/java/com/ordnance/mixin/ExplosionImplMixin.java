package com.ordnance.mixin;

import com.ordnance.entity.DebrisEntity;
import com.ordnance.explosion.VanillaExplosions;
import java.util.List;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.explosion.ExplosionImpl;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Adds flying debris and scorch marks to vanilla explosions. */
@Mixin(ExplosionImpl.class)
public abstract class ExplosionImplMixin {
	@Shadow
	@Final
	private ServerWorld world;
	@Unique
	private List<DebrisEntity.Seed> ordnance$debris = List.of();

	@Inject(method = "destroyBlocks", at = @At("HEAD"))
	private void ordnance$sampleDebris(List<BlockPos> positions, CallbackInfo ci) {
		this.ordnance$debris = VanillaExplosions.sampleDebris((ExplosionImpl)(Object)this, this.world, positions);
	}

	@Inject(method = "explode", at = @At("RETURN"))
	private void ordnance$afterExplode(CallbackInfoReturnable<Integer> cir) {
		VanillaExplosions.afterExplosion((ExplosionImpl)(Object)this, this.world, this.ordnance$debris);
		this.ordnance$debris = List.of();
	}
}
