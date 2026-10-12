package com.chaosunleashed.events.blackhole;

import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModItems;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.projectile.thrown.ThrownItemEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.hit.HitResult;
import net.minecraft.world.World;

/**
 * A thrown Stabilizer Core. If it gets close to a Black Hole the event collapses the singularity safely
 * (see {@link BlackHoleEvent}); if it hits the ground instead it pops back out as an item so it isn't wasted.
 */
public class StabilizerCoreEntity extends ThrownItemEntity {
	public StabilizerCoreEntity(EntityType<? extends StabilizerCoreEntity> type, World world) {
		super(type, world);
	}

	public StabilizerCoreEntity(World world, LivingEntity owner, ItemStack stack) {
		super(ModEntities.STABILIZER_CORE, owner, world, stack);
	}

	@Override
	protected Item getDefaultItem() {
		return ModItems.STABILIZER_CORE;
	}

	@Override
	public void tick() {
		super.tick();
		if (this.getEntityWorld().isClient() && this.age % 2 == 0) {
			this.getEntityWorld().addParticleClient(ParticleTypes.END_ROD, this.getX(), this.getY(), this.getZ(), 0.0, 0.0, 0.0);
		}
	}

	@Override
	protected double getGravity() {
		return 0.04;
	}

	@Override
	protected void onCollision(HitResult hitResult) {
		super.onCollision(hitResult);
		if (this.getEntityWorld() instanceof ServerWorld world && !this.isRemoved()) {
			this.dropStack(world, this.getStack().copyWithCount(1));
			this.discard();
		}
	}
}
