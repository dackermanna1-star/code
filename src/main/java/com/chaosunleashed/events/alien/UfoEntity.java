package com.chaosunleashed.events.alien;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.ChaosEventManager;
import com.chaosunleashed.registry.ModSounds;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.attribute.DefaultAttributeContainer;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.damage.DamageTypes;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.DamageTypeTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

/**
 * A flying saucer. Hovers over the invasion area, abducts animals and villagers with a tractor beam, and can be
 * shot down with arrows, tridents or plasma. A "killed" UFO doesn't just die: it crashes to the ground in flames
 * and leaves a crash site with alien loot (handled by {@link AlienInvasionEvent}).
 */
public class UfoEntity extends MobEntity {
	private static final TrackedData<Boolean> BEAM = DataTracker.registerData(UfoEntity.class, TrackedDataHandlerRegistry.BOOLEAN);
	private static final TrackedData<Float> BEAM_LENGTH = DataTracker.registerData(UfoEntity.class, TrackedDataHandlerRegistry.FLOAT);
	private static final TrackedData<Boolean> CRASHING = DataTracker.registerData(UfoEntity.class, TrackedDataHandlerRegistry.BOOLEAN);

	@Nullable
	private Vec3d moveTarget;
	private double speed = 0.3;
	@Nullable
	private LivingEntity abductee;
	private int crashTicks;
	private int beamFlash;

	public UfoEntity(EntityType<? extends UfoEntity> type, World world) {
		super(type, world);
		this.noClip = true;
		this.setNoGravity(true);
		this.setPersistent();
	}

	public static DefaultAttributeContainer.Builder createAttributes() {
		return MobEntity.createMobAttributes()
			.add(EntityAttributes.MAX_HEALTH, 40.0)
			.add(EntityAttributes.ARMOR, 2.0)
			.add(EntityAttributes.KNOCKBACK_RESISTANCE, 1.0);
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		super.initDataTracker(builder);
		builder.add(BEAM, false);
		builder.add(BEAM_LENGTH, 0.0F);
		builder.add(CRASHING, false);
	}

	public boolean isBeaming() {
		return this.dataTracker.get(BEAM);
	}

	public float getBeamLength() {
		return this.dataTracker.get(BEAM_LENGTH);
	}

	public boolean isCrashing() {
		return this.dataTracker.get(CRASHING);
	}

	public void setMoveTarget(@Nullable Vec3d target, double speed) {
		this.moveTarget = target;
		this.speed = speed;
	}

	@Nullable
	public Vec3d getMoveTarget() {
		return this.moveTarget;
	}

	@Nullable
	public LivingEntity getAbductee() {
		return this.abductee;
	}

	public void startAbduction(LivingEntity target) {
		this.abductee = target;
	}

	/** Flash the tractor beam briefly (used when dropping soldiers). */
	public void flashBeam(int ticks, float length) {
		this.beamFlash = ticks;
		this.dataTracker.set(BEAM, true);
		this.dataTracker.set(BEAM_LENGTH, length);
	}

	@Override
	public boolean isPushable() {
		return false;
	}

	@Override
	public boolean isCollidable(@Nullable Entity entity) {
		return false;
	}

	@Override
	public boolean canImmediatelyDespawn(double distanceSquared) {
		return false;
	}

	@Override
	public boolean shouldRender(double distance) {
		return distance < 256.0 * 256.0;
	}

	@Override
	public boolean damage(ServerWorld world, DamageSource source, float amount) {
		if (this.isCrashing() && !source.isOf(DamageTypes.GENERIC_KILL)) {
			return false;
		}
		if (source.isIn(DamageTypeTags.IS_FALL) || source.isOf(DamageTypes.IN_WALL) || source.isOf(DamageTypes.CRAMMING)
			|| source.isOf(DamageTypes.DROWN) || source.isIn(DamageTypeTags.IS_FIRE)) {
			return false;
		}
		return super.damage(world, source, amount);
	}

	/** Called instead of dying (see ChaosUnleashed's ALLOW_DEATH hook). Returns whether death is allowed. */
	public boolean interceptDeath(DamageSource source) {
		if (source.isOf(DamageTypes.GENERIC_KILL)) {
			return true;
		}
		if (!this.isCrashing()) {
			this.startCrash();
		}
		this.setHealth(1.0F);
		return false;
	}

	private void startCrash() {
		this.dataTracker.set(CRASHING, true);
		this.dataTracker.set(BEAM, false);
		this.releaseAbductee();
		this.noClip = false;
		this.setNoGravity(false);
		this.setVelocity(this.getVelocity().add((this.random.nextDouble() - 0.5) * 0.6, 0.15, (this.random.nextDouble() - 0.5) * 0.6));
		this.getEntityWorld().playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.UFO_CRASH, SoundCategory.HOSTILE, 6.0F, 0.8F);
	}

	private void releaseAbductee() {
		if (this.abductee != null) {
			this.abductee.setNoGravity(false);
			this.abductee = null;
		}
	}

	@Override
	public void tickMovement() {
		if (this.getEntityWorld() instanceof ServerWorld world) {
			if (this.isCrashing()) {
				this.tickCrash(world);
			} else {
				this.tickFlight(world);
			}
		}
		super.tickMovement();
	}

	private void tickFlight(ServerWorld world) {
		Vec3d target = this.moveTarget != null ? this.moveTarget : this.getEntityPos();
		Vec3d diff = target.subtract(this.getEntityPos());
		double distance = diff.length();
		Vec3d velocity = distance < 0.05 ? Vec3d.ZERO : diff.normalize().multiply(Math.min(this.speed, distance * 0.08));
		double bob = MathHelper.sin(this.age * 0.06F + this.getId()) * 0.02;
		this.setVelocity(velocity.x, velocity.y + bob, velocity.z);
		this.setYaw(this.getYaw() + 1.5F);
		this.bodyYaw = this.getYaw();

		boolean beaming = false;
		float beamLength = 0.0F;
		if (this.abductee != null) {
			LivingEntity target2 = this.abductee;
			double horizontal = Math.hypot(target2.getX() - this.getX(), target2.getZ() - this.getZ());
			if (target2.isRemoved() || !target2.isAlive() || horizontal > 40.0 || target2.getEntityWorld() != world) {
				this.releaseAbductee();
			} else if (horizontal < 4.0) {
				beaming = true;
				beamLength = (float) Math.max(2.0, this.getY() - target2.getY() + 1.0);
				target2.setNoGravity(true);
				Vec3d pull = new Vec3d((this.getX() - target2.getX()) * 0.08, 0.16, (this.getZ() - target2.getZ()) * 0.08);
				target2.setVelocity(pull);
				target2.velocityDirty = true;
				target2.fallDistance = 0.0;
				if (this.age % 40 == 0) {
					world.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.UFO_BEAM, SoundCategory.HOSTILE, 3.0F, 1.0F);
				}
				if (target2.getY() > this.getY() - 2.0) {
					world.spawnParticles(ParticleTypes.END_ROD, target2.getX(), target2.getBodyY(0.5), target2.getZ(), 30, 0.4, 0.4, 0.4, 0.15);
					world.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.PLASMA_HIT, SoundCategory.HOSTILE, 2.0F, 0.5F);
					target2.discard();
					this.abductee = null;
				}
			}
		}
		if (this.beamFlash > 0) {
			this.beamFlash--;
			beaming = true;
			beamLength = Math.max(beamLength, this.getBeamLength());
		}
		if (beaming != this.isBeaming()) {
			this.dataTracker.set(BEAM, beaming);
		}
		if (beaming) {
			this.dataTracker.set(BEAM_LENGTH, beamLength);
		}
		if (this.age % 60 == 0) {
			world.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.UFO_HUM, SoundCategory.HOSTILE, 4.0F, 0.8F + this.random.nextFloat() * 0.2F);
		}
	}

	private void tickCrash(ServerWorld world) {
		this.crashTicks++;
		this.setYaw(this.getYaw() + 25.0F);
		this.bodyYaw = this.getYaw();
		world.spawnParticles(ParticleTypes.LARGE_SMOKE, this.getX(), this.getY() + 0.5, this.getZ(), 6, 1.2, 0.3, 1.2, 0.02);
		world.spawnParticles(ParticleTypes.FLAME, this.getX(), this.getY() + 0.5, this.getZ(), 8, 1.4, 0.3, 1.4, 0.05);
		if (this.crashTicks % 8 == 0) {
			world.spawnParticles(ParticleTypes.EXPLOSION, this.getX(), this.getY(), this.getZ(), 1, 1.0, 0.3, 1.0, 0.0);
		}
		if ((this.crashTicks > 5 && (this.isOnGround() || this.verticalCollision || this.isTouchingWater())) || this.crashTicks > 400
			|| this.getY() < world.getBottomY()) {
			this.impact(world);
		}
	}

	private void impact(ServerWorld world) {
		ChaosEventManager manager = ChaosEventManager.get();
		ChaosEvent owner = manager != null ? manager.ownerOf(this) : null;
		if (owner instanceof AlienInvasionEvent invasion) {
			invasion.onUfoCrashed(this);
		} else {
			world.spawnParticles(ParticleTypes.EXPLOSION_EMITTER, this.getX(), this.getY(), this.getZ(), 1, 0, 0, 0, 0);
		}
		this.discard();
	}

	@Override
	public void remove(RemovalReason reason) {
		this.releaseAbductee();
		super.remove(reason);
	}
}
