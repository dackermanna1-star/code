package com.chaosunleashed.events.kaiju;

import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModItems;
import com.chaosunleashed.registry.ModSounds;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.ExperienceOrbEntity;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.attribute.DefaultAttributeContainer;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.damage.DamageTypes;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.DamageTypeTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * The Kaiju: a ~100 block tall monster. Its movement, footsteps, roars and breath beam are driven by
 * {@link KaijuAttackEvent}; the entity itself handles health, its glowing weak points and the long death animation.
 * The body shrugs off most damage; the weak points take extra damage.
 */
public class KaijuEntity extends MobEntity {
	public static final float SCALE = 20.0F;
	private static final TrackedData<Integer> ROAR_TICKS = DataTracker.registerData(KaijuEntity.class, TrackedDataHandlerRegistry.INTEGER);
	private static final TrackedData<Boolean> BEAMING = DataTracker.registerData(KaijuEntity.class, TrackedDataHandlerRegistry.BOOLEAN);
	public static final float BODY_DAMAGE_MULTIPLIER = 0.2F;
	public static final float WEAK_POINT_MULTIPLIER = 2.5F;

	/** Local offsets (blocks) of the weak points: x = right, y = up, z = forward. */
	private static final float[][] WEAK_POINTS = {
		{-8.75F, 11.0F, 4.5F, 3.0F},
		{8.75F, 11.0F, 4.5F, 3.0F},
		{0.0F, 60.0F, -12.5F, 4.0F},
		{0.0F, 72.0F, -11.0F, 4.0F},
	};

	private final List<KaijuWeakPointEntity> weakPoints = new ArrayList<>();
	private int lootTier = 3;

	public KaijuEntity(EntityType<? extends KaijuEntity> type, World world) {
		super(type, world);
		this.noClip = true;
		this.setNoGravity(true);
		this.setPersistent();
		this.setAiDisabled(true);
	}

	public static DefaultAttributeContainer.Builder createAttributes() {
		return MobEntity.createMobAttributes()
			.add(EntityAttributes.MAX_HEALTH, 1024.0)
			.add(EntityAttributes.ARMOR, 10.0)
			.add(EntityAttributes.KNOCKBACK_RESISTANCE, 1.0);
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		super.initDataTracker(builder);
		builder.add(ROAR_TICKS, 0);
		builder.add(BEAMING, false);
	}

	public int getRoarTicks() {
		return this.dataTracker.get(ROAR_TICKS);
	}

	public void setRoarTicks(int ticks) {
		this.dataTracker.set(ROAR_TICKS, ticks);
	}

	public boolean isBeaming() {
		return this.dataTracker.get(BEAMING);
	}

	public void setBeaming(boolean beaming) {
		this.dataTracker.set(BEAMING, beaming);
	}

	public void setLootTier(int tier) {
		this.lootTier = tier;
	}

	/** World position of the mouth (beam origin). */
	public Vec3d getMouthPos() {
		Vec3d forward = Vec3d.fromPolar(0.0F, this.getYaw());
		return this.getEntityPos().add(0, 84.0, 0).add(forward.multiply(26.0));
	}

	public List<KaijuWeakPointEntity> getWeakPoints() {
		return this.weakPoints;
	}

	/** Spawns the weak point hitboxes. Called by the event after the Kaiju is in the world. */
	public List<KaijuWeakPointEntity> createWeakPoints(ServerWorld world) {
		for (float[] spec : WEAK_POINTS) {
			KaijuWeakPointEntity point = ModEntities.KAIJU_WEAK_POINT.create(world, SpawnReason.EVENT);
			if (point == null) {
				continue;
			}
			point.setSize(spec[3]);
			point.setOwner(this);
			Vec3d pos = this.localToWorld(spec[0], spec[1], spec[2]);
			point.refreshPositionAndAngles(pos.x, pos.y, pos.z, 0.0F, 0.0F);
			this.weakPoints.add(point);
		}
		return this.weakPoints;
	}

	private Vec3d localToWorld(float right, float up, float forward) {
		Vec3d f = Vec3d.fromPolar(0.0F, this.getYaw());
		Vec3d r = new Vec3d(-f.z, 0.0, f.x);
		return this.getEntityPos().add(r.multiply(right)).add(f.multiply(forward)).add(0, up, 0);
	}

	@Override
	public void tick() {
		super.tick();
		if (this.getEntityWorld() instanceof ServerWorld) {
			if (this.getRoarTicks() > 0) {
				this.setRoarTicks(this.getRoarTicks() - 1);
			}
			// Keep the weak points glued to the body; the shins swing with the walk cycle.
			float swing = MathHelper.sin(this.limbAnimator.getAnimationProgress() * 0.25F) * 4.0F;
			for (int i = 0; i < this.weakPoints.size() && i < WEAK_POINTS.length; i++) {
				KaijuWeakPointEntity point = this.weakPoints.get(i);
				if (point.isRemoved()) {
					continue;
				}
				float[] spec = WEAK_POINTS[i];
				float forward = spec[2] + (i == 0 ? swing : i == 1 ? -swing : 0.0F);
				Vec3d pos = this.localToWorld(spec[0], spec[1] - spec[3] / 2.0F, forward);
				point.setPosition(pos.x, pos.y, pos.z);
			}
		}
	}

	// ------------------------------------------------------------------------------------------ damage

	@Override
	public boolean damage(ServerWorld world, DamageSource source, float amount) {
		if (source.isOf(DamageTypes.GENERIC_KILL)) {
			return super.damage(world, source, amount);
		}
		if (this.isImmuneTo(source)) {
			return false;
		}
		return super.damage(world, source, amount * BODY_DAMAGE_MULTIPLIER);
	}

	boolean damageWeakPoint(ServerWorld world, DamageSource source, float amount, KaijuWeakPointEntity point) {
		if (this.isImmuneTo(source) || this.isDead()) {
			return false;
		}
		world.spawnParticles(ParticleTypes.CRIT, point.getX(), point.getBodyY(0.5), point.getZ(), 20, 1.0, 1.0, 1.0, 0.3);
		world.spawnParticles(ParticleTypes.LAVA, point.getX(), point.getBodyY(0.5), point.getZ(), 4, 0.6, 0.6, 0.6, 0.0);
		if (this.age % 4 == 0) {
			world.playSound(null, point.getX(), point.getY(), point.getZ(), ModSounds.KAIJU_HURT, SoundCategory.HOSTILE, 4.0F, 0.9F);
		}
		this.timeUntilRegen = 0;
		return super.damage(world, source, amount * WEAK_POINT_MULTIPLIER);
	}

	private boolean isImmuneTo(DamageSource source) {
		if (source.isIn(DamageTypeTags.IS_EXPLOSION) && source.getAttacker() == null) {
			return true;
		}
		return source.isIn(DamageTypeTags.IS_FALL) || source.isOf(DamageTypes.IN_WALL) || source.isOf(DamageTypes.CRAMMING)
			|| source.isOf(DamageTypes.DROWN) || source.isIn(DamageTypeTags.IS_FIRE);
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return ModSounds.KAIJU_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return ModSounds.KAIJU_DEATH;
	}

	@Override
	protected float getSoundVolume() {
		return 8.0F;
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
		return distance < 768.0 * 768.0;
	}

	// ------------------------------------------------------------------------------------------ death

	/** A long, explosive death: the Kaiju topples over for 5 seconds before dissolving into loot. */
	@Override
	protected void updatePostDeath() {
		this.deathTime++;
		if (!(this.getEntityWorld() instanceof ServerWorld world)) {
			return;
		}
		for (KaijuWeakPointEntity point : this.weakPoints) {
			point.discard();
		}
		if (this.deathTime % 4 == 0) {
			Vec3d pos = this.localToWorld((this.random.nextFloat() - 0.5F) * 14.0F, this.random.nextFloat() * 70.0F * (1.0F - this.deathTime / 120.0F),
				(this.random.nextFloat() - 0.5F) * 14.0F);
			for (var player : world.getPlayers()) {
				world.spawnParticles(player, ParticleTypes.EXPLOSION_EMITTER, true, true, pos.x, pos.y, pos.z, 1, 0, 0, 0, 0);
			}
			world.playSound(null, pos.x, pos.y, pos.z, net.minecraft.sound.SoundEvents.ENTITY_GENERIC_EXPLODE.value(), SoundCategory.HOSTILE, 6.0F, 0.6F);
		}
		if (this.deathTime == 60) {
			world.playSound(null, this.getX(), this.getY(), this.getZ(), ModSounds.KAIJU_STEP, SoundCategory.HOSTILE, 16.0F, 0.4F);
		}
		if (this.deathTime >= 100 && !this.isRemoved()) {
			this.dropKaijuLoot(world);
			for (var player : world.getPlayers()) {
				world.spawnParticles(player, ParticleTypes.EXPLOSION_EMITTER, true, true, this.getX(), this.getY() + 4, this.getZ(), 8, 10, 4, 10, 0);
			}
			this.remove(RemovalReason.KILLED);
		}
	}

	private void dropKaijuLoot(ServerWorld world) {
		Vec3d pos = this.getEntityPos().add(0, 2, 0);
		int scales = 8 + this.random.nextInt(9) + this.lootTier * 2;
		while (scales > 0) {
			int count = Math.min(scales, 4);
			scales -= count;
			this.spawnLoot(world, pos, new ItemStack(ModItems.KAIJU_SCALE, count));
		}
		this.spawnLoot(world, pos, new ItemStack(ModItems.KAIJU_HEART));
		ExperienceOrbEntity.spawn(world, pos, 500 + this.lootTier * 100);
	}

	private void spawnLoot(ServerWorld world, Vec3d pos, ItemStack stack) {
		ItemEntity item = new ItemEntity(world, pos.x + (this.random.nextDouble() - 0.5) * 6, pos.y, pos.z + (this.random.nextDouble() - 0.5) * 6, stack);
		item.setVelocity((this.random.nextDouble() - 0.5) * 0.4, 0.5, (this.random.nextDouble() - 0.5) * 0.4);
		item.setNeverDespawn();
		world.spawnEntity(item);
	}

	@Override
	protected void dropLoot(ServerWorld world, DamageSource damageSource, boolean causedByPlayer) {
		// Loot is dropped at the end of the death animation instead.
	}

	@Override
	public void remove(RemovalReason reason) {
		for (KaijuWeakPointEntity point : this.weakPoints) {
			if (!point.isRemoved()) {
				point.discard();
			}
		}
		super.remove(reason);
	}
}
