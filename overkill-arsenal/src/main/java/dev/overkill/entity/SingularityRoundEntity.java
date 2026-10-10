package dev.overkill.entity;

import dev.overkill.registry.ModEntities;
import dev.overkill.registry.ModItems;
import dev.overkill.registry.ModParticles;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrowableItemProjectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/** The Gravemaker's marble. Renders as its item; blooms into a {@link SingularityEntity} on impact. */
public class SingularityRoundEntity extends ThrowableItemProjectile {
	public SingularityRoundEntity(EntityType<? extends SingularityRoundEntity> type, Level level) {
		super(type, level);
	}

	public SingularityRoundEntity(Level level, LivingEntity owner, ItemStack stack) {
		super(ModEntities.SINGULARITY_ROUND, owner, level, stack);
	}

	@Override
	protected Item getDefaultItem() {
		return ModItems.SINGULARITY_ROUND;
	}

	public boolean isWhiteHole() {
		return this.getItem().is(ModItems.WHITE_HOLE_ROUND);
	}

	@Override
	protected double getDefaultGravity() {
		return 0.01;
	}

	@Override
	public void tick() {
		super.tick();
		if (this.level().isClientSide()) {
			boolean white = this.isWhiteHole();
			for (int i = 0; i < 3; i++) {
				this.level().addParticle(white ? ModParticles.WHITE_FLARE : ModParticles.VOID_MOTE, true, true,
					this.getX() + this.random.nextGaussian() * 0.1, this.getY() + this.random.nextGaussian() * 0.1, this.getZ() + this.random.nextGaussian() * 0.1,
					this.random.nextGaussian() * 0.02, this.random.nextGaussian() * 0.02, this.random.nextGaussian() * 0.02);
			}
			this.level().addParticle(white ? ModParticles.ORB_CORE : ModParticles.RIFT_GLOW, true, true, this.getX(), this.getY(), this.getZ(), 0.8, 0.6, 3.0);
		}
		if (this.tickCount > 200 && !this.level().isClientSide()) {
			this.bloom(this.position());
		}
	}

	@Override
	protected void onHit(HitResult hitResult) {
		super.onHit(hitResult);
		if (this.level().isClientSide()) {
			return;
		}
		Vec3 at;
		if (hitResult instanceof BlockHitResult blockHit) {
			Vec3 normal = Vec3.atLowerCornerOf(blockHit.getDirection().getUnitVec3i());
			at = blockHit.getLocation().add(normal.scale(1.4));
		} else if (hitResult instanceof EntityHitResult entityHit) {
			at = entityHit.getEntity().getBoundingBox().getCenter();
		} else {
			at = this.position();
		}
		this.bloom(at);
	}

	private void bloom(Vec3 at) {
		if (this.isRemoved() || !(this.level() instanceof ServerLevel level)) {
			return;
		}
		SingularityEntity.spawn(level, this.getOwner(), at, this.isWhiteHole());
		this.discard();
	}
}
