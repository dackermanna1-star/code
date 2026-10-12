package com.chaosunleashed.events.alien;

import com.chaosunleashed.registry.ModDamageTypes;
import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModItems;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.projectile.thrown.ThrownItemEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.hit.EntityHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.world.World;

/** A slow, glowing, gravity-free plasma bolt fired by Alien Soldiers and the Plasma Pistol. */
public class PlasmaBoltEntity extends ThrownItemEntity {
	private float damage = 5.0F;

	public PlasmaBoltEntity(EntityType<? extends PlasmaBoltEntity> type, World world) {
		super(type, world);
	}

	public PlasmaBoltEntity(World world, LivingEntity owner, ItemStack stack) {
		super(ModEntities.PLASMA_BOLT, owner, world, stack);
	}

	public PlasmaBoltEntity(World world, LivingEntity owner) {
		this(world, owner, new ItemStack(ModItems.PLASMA_BOLT));
	}

	public PlasmaBoltEntity setDamage(float damage) {
		this.damage = damage;
		return this;
	}

	@Override
	protected Item getDefaultItem() {
		return ModItems.PLASMA_BOLT;
	}

	@Override
	protected double getGravity() {
		return 0.0;
	}

	@Override
	public void tick() {
		super.tick();
		World world = this.getEntityWorld();
		if (world.isClient()) {
			world.addParticleClient(ModParticles.PLASMA, this.getX(), this.getY(), this.getZ(), 0.0, 0.0, 0.0);
		} else if (this.age > 120) {
			this.discard();
		}
	}

	@Override
	public boolean isOnFire() {
		return false;
	}

	@Override
	protected void onEntityHit(EntityHitResult hit) {
		super.onEntityHit(hit);
		Entity target = hit.getEntity();
		if (this.getEntityWorld() instanceof ServerWorld world) {
			Entity owner = this.getOwner();
			target.damage(world, ModDamageTypes.of(world, ModDamageTypes.PLASMA, this, owner), this.damage);
			target.setOnFireFor(2.0F);
		}
	}

	@Override
	protected void onCollision(HitResult hitResult) {
		super.onCollision(hitResult);
		if (this.getEntityWorld() instanceof ServerWorld world && !this.isRemoved()) {
			world.spawnParticles(ModParticles.PLASMA, this.getX(), this.getY(), this.getZ(), 14, 0.2, 0.2, 0.2, 0.15);
			world.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.PLASMA_HIT, SoundCategory.HOSTILE, 0.8F, 1.0F);
			this.discard();
		}
	}
}
