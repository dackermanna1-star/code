package com.godforge.entity;

import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.BlockOps;
import com.godforge.destruction.CraterJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.destruction.Palette;
import com.godforge.destruction.PathJob;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModParticles;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.EffectEntity;
import com.godforge.util.Loaded;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Event Horizon. Launched as a dark mote, it anchors itself, then drags in creatures, items and the
 * terrain itself, growing heavier with everything it swallows. At the end of its life it collapses and
 * releases the stored mass as a colossal blast (and, for the ultimate, twin quasar jets).
 */
public class SingularityEntity extends GfEffectEntity {
	private static final EntityDataAccessor<Float> DATA_MASS = SynchedEntityData.defineId(SingularityEntity.class, EntityDataSerializers.FLOAT);
	public static final int FLAG_ANCHORED = 1;
	public static final int FLAG_ULTIMATE = 2;
	public static final int FLAG_COLLAPSING = 4;
	public static final int COLLAPSE_TICKS = 18;
	private static final AtomicInteger ACTIVE = new AtomicInteger();

	private boolean counted;
	private float pullRadius = 24.0F;
	private float strength = 1.0F;
	private float damage = 8.0F;
	private int flightTicks;
	private float lastDevour;

	/** Live instances are never saved, so a starting server always begins from zero. */
	public static void resetLiveCount() {
		ACTIVE.set(0);
	}

	public SingularityEntity(EntityType<? extends SingularityEntity> type, Level level) {
		super(type, level);
		this.setLifetime(240);
	}

	public static int active() {
		return ACTIVE.get();
	}

	public static boolean canSpawn() {
		return ACTIVE.get() < GodforgeConfig.get().performance.maxSingularities;
	}

	public void configure(float mass, float pullRadius, float strength, float damage, int lifetime, boolean ultimate, boolean terrain) {
		this.entityData.set(DATA_MASS, mass);
		this.pullRadius = pullRadius;
		this.strength = strength;
		this.damage = damage;
		this.setLifetime(lifetime + COLLAPSE_TICKS);
		this.setVariant(ultimate ? FLAG_ULTIMATE : 0);
		this.terrain = terrain;
		this.updateSize();
	}

	public void markCounted() {
		if (!this.counted) {
			this.counted = true;
			ACTIVE.incrementAndGet();
		}
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(DATA_MASS, 10.0F);
	}

	public float mass() {
		return this.entityData.get(DATA_MASS);
	}

	public boolean has(int flag) {
		return (this.variant() & flag) != 0;
	}

	private void set(int flag) {
		this.setVariant(this.variant() | flag);
	}

	public float horizonRadius() {
		return this.size() * 0.75F;
	}

	private void updateSize() {
		float cap = this.has(FLAG_ULTIMATE) ? 12.0F : 5.5F;
		this.setSize(Math.min(cap, 0.7F + (float) Math.sqrt(this.mass()) * 0.32F));
	}

	/** Called when something is swallowed. */
	public void absorb(float amount) {
		this.entityData.set(DATA_MASS, this.mass() + amount);
		this.updateSize();
	}

	public void anchor() {
		this.set(FLAG_ANCHORED);
		this.setDeltaMovement(Vec3.ZERO);
	}

	@Override
	protected void serverTick(ServerLevel level, int age) {
		this.markCounted();
		if (!this.has(FLAG_ANCHORED)) {
			Vec3 motion = this.getDeltaMovement();
			Vec3 start = this.position();
			Vec3 end = start.add(motion);
			Vec3 reach = Loaded.clampRay(level, start, end);
			BlockHitResult hit = level.clip(new ClipContext(start, reach, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, this));
			if (hit.getType() != HitResult.Type.MISS) {
				this.setPos(hit.getLocation().subtract(motion.normalize().scale(1.5)));
				this.anchor();
			} else if (reach != end || !level.isPositionEntityTicking(BlockPos.containing(end))) {
				// the edge of the active world stops it like a wall
				this.anchor();
			} else {
				this.setPos(end);
				this.setDeltaMovement(motion.scale(0.94));
				if (++this.flightTicks > 28 || motion.lengthSqr() < 0.01) {
					this.anchor();
				}
			}
			return;
		}
		if (age >= this.lifetime() - COLLAPSE_TICKS) {
			if (!this.has(FLAG_COLLAPSING)) {
				this.set(FLAG_COLLAPSING);
				Fx.sound(level, this.position(), ModSounds.BLACKHOLE_COLLAPSE, 10.0F + this.size() * 2, 1.0F);
				Fx.send(level, FxType.IMPLOSION, this.position(), Vec3.ZERO, this.size() * 3.0F, COLLAPSE_TICKS, WeaponType.BLACK_HOLE.color(), 512);
			}
			// final violent inhale
			this.pull(level, 1.8F);
			return;
		}
		this.pull(level, 1.0F);
		if (this.terrain && WeaponAccess.terrainAllowed(level, this.getOwner(), true, this.blockPosition())) {
			this.tearTerrain(level);
		}
		if (age % 20 == 0) {
			Fx.distort(level, this.position(), Math.min(1.0F, 0.25F + this.size() * 0.1F), 24, this.pullRadius * 1.6);
			Fx.shake(level, this.position(), 0.15F + this.size() * 0.05F, 22, this.pullRadius * 1.5);
		}
	}

	private void pull(ServerLevel level, float multiplier) {
		Vec3 center = this.position();
		float radius = this.pullRadius * (this.has(FLAG_COLLAPSING) ? 1.2F : 1.0F);
		float horizon = this.horizonRadius();
		Entity owner = this.getOwner();
		DamageSource source = ModDamageTypes.source(level, WeaponType.BLACK_HOLE, this, owner);
		AABB box = new AABB(center, center).inflate(radius);
		for (Entity e : level.getEntities(this, box, e -> e.isAlive() && !(e instanceof EffectEntity))) {
			Vec3 to = center.subtract(e.getBoundingBox().getCenter());
			double d = to.length();
			if (d > radius) {
				continue;
			}
			boolean isOwner = e == owner;
			if (isOwner && !GodforgeConfig.get().general.damageOwner) {
				continue;
			}
			if (e instanceof Player player && (player.isCreative() || player.isSpectator()) && !Combat.canAffect(level, owner, e)) {
				continue;
			}
			if (e instanceof LivingEntity && !Combat.canAffect(level, owner, e)) {
				continue;
			}
			Vec3 dir = d < 1.0E-3 ? Vec3.ZERO : to.scale(1.0 / d);
			double accel = this.strength * multiplier * Math.min(1.1, 0.03 + 1.4 / (d + 2.0)) * (1.0 - d / radius * 0.6);
			Vec3 swirl = new Vec3(-dir.z, 0, dir.x).scale(accel * 0.35);
			Vec3 velocity = e.getDeltaMovement().scale(e instanceof Player ? 0.9 : 0.85).add(dir.scale(accel)).add(swirl);
			double max = e instanceof Player ? 1.6 : 2.5;
			if (velocity.length() > max) {
				velocity = velocity.normalize().scale(max);
			}
			e.setDeltaMovement(velocity);
			e.hurtMarked = true;
			e.resetFallDistance();
			if (d < horizon + 0.8 + e.getBbWidth() * 0.5) {
				if (e instanceof ItemEntity item) {
					this.absorb(item.getItem().getCount() * 0.05F);
					item.discard();
				} else if (e instanceof ExperienceOrb orb) {
					this.absorb(0.02F * orb.getValue());
					orb.discard();
				} else if (e instanceof LivingEntity living) {
					living.invulnerableTime = 0;
					float hp = living.getMaxHealth();
					Combat.hurt(level, living, source, this.damage * (1.0F + this.mass() * 0.01F));
					if (!living.isAlive()) {
						this.absorb(hp * 0.35F);
					}
				}
			}
		}
	}

	private void tearTerrain(ServerLevel level) {
		RandomSource random = this.random;
		boolean ultimate = this.has(FLAG_ULTIMATE);
		int tears = (int) Math.min(ultimate ? 60 : 28, 3 + this.mass() / 6.0F) ;
		float reach = Math.min(this.pullRadius * 0.75F, 5.0F + this.size() * 2.5F);
		Vec3 c = this.position();
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int i = 0; i < tears; i++) {
			Vec3 dir = new Vec3(random.nextGaussian(), random.nextGaussian() * 0.8 - 0.25, random.nextGaussian());
			if (dir.lengthSqr() < 1.0E-4) {
				continue;
			}
			double dist = this.horizonRadius() + 1.0 + random.nextDouble() * reach;
			Vec3 p = c.add(dir.normalize().scale(dist));
			pos.set(p.x, p.y, p.z);
			BlockState state = Loaded.state(level, pos);
			if (state == null || state.isAir() || BlockOps.isProtected(level, pos, state)) {
				continue;
			}
			BlockOps.erase(level, pos);
			FlyingDebrisEntity debris = FlyingDebrisEntity.spawn(level, Vec3.atCenterOf(pos), state, Vec3.ZERO, 0.6F + random.nextFloat() * 0.5F);
			if (debris != null) {
				debris.attractTo(this);
			} else {
				this.absorb(0.3F);
			}
		}
		// the region inside the horizon is simply erased as the singularity grows
		float horizon = this.horizonRadius();
		if (horizon > this.lastDevour + 0.75F) {
			this.lastDevour = horizon;
			CraterJob.builder(level, this.blockPosition(), horizon * 1.5 + 1.0).vertical(1.0).noise(0.12).lining(Palette.COMPRESSED, 0.8).submit();
		}
	}

	@Override
	protected void onEnd(ServerLevel level) {
		Vec3 at = this.position();
		Entity owner = this.getOwner();
		boolean ultimate = this.has(FLAG_ULTIMATE);
		float mass = this.mass();
		float blast = Math.min(ultimate ? 42.0F : 26.0F, 5.0F + (float) Math.sqrt(mass) * (ultimate ? 2.4F : 1.6F));
		DamageSource source = ModDamageTypes.source(level, WeaponType.BLACK_HOLE, this, owner);
		boolean terrain = this.terrain && WeaponAccess.terrainAllowed(level, owner, true, BlockPos.containing(at));
		if (terrain) {
			CraterJob.builder(level, BlockPos.containing(at), blast).vertical(0.8).noise(0.3).lining(Palette.COMPRESSED, 1.8).submit();
			if (ultimate) {
				// quasar jets: two beams of released energy bore straight up and down
				PathJob jets = new PathJob(level, this.random.nextLong());
				jets.add(at, at.add(0, 96, 0), 3.5, Palette.NONE);
				jets.add(at, at.add(0, -48, 0), 3.0, Palette.COMPRESSED);
				jets.seal();
				DestructionManager.submit(jets);
			}
		}
		Combat.sphere(level, source, owner, at, blast * 1.8, this.damage * 6.0F + mass * 0.3F, 0.9, 4.0, 1.6);
		Impacts.shockwaves(level, at, ultimate ? 5 : 3, blast * 3.5, 4, WeaponType.BLACK_HOLE.accent(), this.damage * 3.0F, source, owner);
		Fx.send(level, FxType.EXPLOSION, at, Vec3.ZERO, blast, 1.0F, WeaponType.BLACK_HOLE.color(), 512);
		if (ultimate) {
			Fx.send(level, FxType.ORBITAL, at, new Vec3(0, 1, 0), 4.0F, 30.0F, 0xC9A0FF, 512);
		}
		Fx.flash(level, at, 0xE6D2FF, 1.0F, ultimate ? 30 : 16, blast * 10);
		Fx.shake(level, at, ultimate ? 3.0F : 1.8F, ultimate ? 80 : 40, blast * 10);
		Fx.sound(level, at, ModSounds.BIG_EXPLOSION, 16.0F + blast, 0.45F);
	}

	@Override
	public void onRemoval(RemovalReason reason) {
		// runs for every removal, including chunk unloads that bypass remove()
		if (this.counted) {
			this.counted = false;
			ACTIVE.decrementAndGet();
		}
		super.onRemoval(reason);
	}

	@Override
	protected void clientTick() {
		if (!this.has(FLAG_ANCHORED)) {
			return;
		}
		Level level = this.level();
		float size = this.size();
		boolean collapsing = this.has(FLAG_COLLAPSING);
		int count = 4 + (int) (size * 3) + (collapsing ? 20 : 0);
		Vec3 c = this.position();
		for (int i = 0; i < count; i++) {
			double angle = this.random.nextDouble() * Math.PI * 2;
			double r = size * (2.2 + this.random.nextDouble() * 4.0);
			double y = (this.random.nextDouble() - 0.5) * size * 1.2;
			Vec3 p = c.add(Math.cos(angle) * r, y, Math.sin(angle) * r);
			int color = this.random.nextFloat() < 0.6F ? 0xFFB45A : 0xB78CFF;
			level.addParticle(
				FxParticleOptions.of(ModParticles.GLOW, color, 0x4A1A8A, 0.12F + size * 0.03F, 30, 0.0F,
					FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_NO_PHYSICS | FxParticleOptions.F_ATTRACT | FxParticleOptions.F_SPIN),
				p.x, p.y, p.z, c.x, c.y, c.z
			);
		}
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 640.0 * 640.0;
	}
}
