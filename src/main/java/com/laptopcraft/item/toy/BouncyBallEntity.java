package com.laptopcraft.item.toy;

import com.laptopcraft.content.ToyContent;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrowableItemProjectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * A thrown bouncy ball. It ricochets off blocks (losing a bit of energy each time), bonks mobs harmlessly and drops
 * back as an item once it has settled or bounced {@link #MAX_BOUNCES} times. The bounce maths runs on both sides
 * so the client prediction stays smooth.
 */
public class BouncyBallEntity extends ThrowableItemProjectile {
	public static final int MAX_BOUNCES = 10;
	private static final double RESTITUTION = 0.72;
	private static final double FRICTION = 0.88;
	private int bounces;

	public BouncyBallEntity(EntityType<? extends BouncyBallEntity> type, Level level) {
		super(type, level);
	}

	public BouncyBallEntity(Level level, LivingEntity owner, ItemStack stack) {
		super(ToyContent.BOUNCY_BALL_ENTITY, owner, level, stack);
	}

	@Override
	protected Item getDefaultItem() {
		return ToyContent.BOUNCY_BALL;
	}

	@Override
	protected double getDefaultGravity() {
		return 0.05;
	}

	@Override
	protected void onHitBlock(BlockHitResult result) {
		super.onHitBlock(result);
		Direction face = result.getDirection();
		Vec3 v = this.getDeltaMovement();
		v = switch (face.getAxis()) {
			case X -> new Vec3(-v.x * RESTITUTION, v.y, v.z * FRICTION);
			case Y -> new Vec3(v.x * FRICTION, -v.y * RESTITUTION, v.z * FRICTION);
			case Z -> new Vec3(v.x * FRICTION, v.y, -v.z * RESTITUTION);
		};
		this.setDeltaMovement(v);
		Vec3 normal = Vec3.atLowerCornerOf(face.getUnitVec3i());
		this.setPos(result.getLocation().add(normal.scale(0.06)));
		bounce(v);
	}

	@Override
	protected void onHitEntity(EntityHitResult result) {
		super.onHitEntity(result);
		Entity target = result.getEntity();
		if (this.level() instanceof ServerLevel serverLevel) {
			target.hurtServer(serverLevel, this.damageSources().thrown(this, this.getOwner()), 0.0F);
		}
		Vec3 v = this.getDeltaMovement().scale(-0.45);
		this.setDeltaMovement(v);
		bounce(v);
	}

	private void bounce(Vec3 velocity) {
		if (!(this.level() instanceof ServerLevel serverLevel)) {
			return;
		}
		bounces++;
		float speed = (float) velocity.length();
		if (speed > 0.08) {
			serverLevel.playSound(null, this.getX(), this.getY(), this.getZ(), SoundEvents.SLIME_JUMP_SMALL, SoundSource.NEUTRAL,
					Math.min(0.8F, 0.25F + speed), 1.5F + this.random.nextFloat() * 0.3F);
			serverLevel.sendParticles(ParticleTypes.CRIT, this.getX(), this.getY(), this.getZ(), 2, 0.05, 0.05, 0.05, 0.05);
		}
		if (bounces >= MAX_BOUNCES || velocity.lengthSqr() < 0.004) {
			ItemEntity drop = new ItemEntity(serverLevel, this.getX(), this.getY() + 0.1, this.getZ(), this.getItem().copyWithCount(1));
			drop.setDefaultPickUpDelay();
			drop.setDeltaMovement(velocity.scale(0.3));
			serverLevel.addFreshEntity(drop);
			this.discard();
		}
	}
}
