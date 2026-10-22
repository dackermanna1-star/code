package dev.juukulius.entity;

import dev.juukulius.character.JuliusServer;
import dev.juukulius.combat.CombatUtil;
import dev.juukulius.network.FxType;
import dev.juukulius.network.JuliusNetworking;
import dev.juukulius.particle.ParticleDensity;
import dev.juukulius.registry.JuliusDamageTypes;
import dev.juukulius.registry.JuliusEntities;
import dev.juukulius.registry.JuliusParticles;
import dev.juukulius.registry.JuliusSounds;
import dev.juukulius.spirit.Spirit;
import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import it.unimi.dsi.fastutil.ints.IntSet;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Elemental spirit projectile used by three arts:
 * <ul>
 *     <li>{@link Kind#FLAME}: Ia's exploding fire orb</li>
 *     <li>{@link Kind#TIDE}: Kua's piercing water lance that restores Julius on every hit</li>
 *     <li>{@link Kind#UMBRA}: Nes's slowly homing yin orb that slows and weakens</li>
 * </ul>
 */
public class SpiritBoltEntity extends JuliusProjectile {
	private static final EntityDataAccessor<Byte> KIND = SynchedEntityData.defineId(SpiritBoltEntity.class, EntityDataSerializers.BYTE);
	private static final EntityDataAccessor<Float> POWER = SynchedEntityData.defineId(SpiritBoltEntity.class, EntityDataSerializers.FLOAT);

	private final IntSet hits = new IntOpenHashSet();
	private int pierceLeft = 3;

	public SpiritBoltEntity(EntityType<? extends SpiritBoltEntity> type, Level level) {
		super(type, level);
	}

	public SpiritBoltEntity(Level level, ServerPlayer owner, Vec3 position, Vec3 direction, Kind kind, float power) {
		this(JuliusEntities.SPIRIT_BOLT, level);
		this.entityData.set(KIND, (byte) kind.ordinal());
		this.entityData.set(POWER, power);
		this.lifetime = kind.lifetime;
		this.launch(owner, position, direction, kind.speed);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(KIND, (byte) 0);
		builder.define(POWER, 1.0F);
	}

	public Kind kind() {
		return Kind.byId(this.entityData.get(KIND));
	}

	public float power() {
		return this.entityData.get(POWER);
	}

	@Override
	protected void steer(ServerLevel level) {
		if (this.kind() != Kind.UMBRA || this.tickCount < 4) {
			return;
		}

		Vec3 motion = this.getDeltaMovement();
		Vec3 heading = motion.normalize();
		LivingEntity best = null;
		double bestScore = 0.0;
		for (LivingEntity candidate : level.getEntitiesOfClass(LivingEntity.class, this.getBoundingBox().inflate(6.0), this::canHitEntity)) {
			Vec3 toTarget = candidate.getBoundingBox().getCenter().subtract(this.position());
			double distance = toTarget.length();
			double alignment = toTarget.normalize().dot(heading);
			double score = alignment - distance * 0.05;
			if (alignment > 0.6 && score > bestScore) {
				bestScore = score;
				best = candidate;
			}
		}

		if (best != null) {
			Vec3 desired = best.getBoundingBox().getCenter().subtract(this.position()).normalize().scale(motion.length());
			this.setDeltaMovement(motion.lerp(desired, 0.18).normalize().scale(motion.length()));
		}
	}

	@Override
	protected boolean sweepEntities(ServerLevel level, Vec3 from, Vec3 to) {
		Kind kind = this.kind();
		if (kind == Kind.TIDE) {
			for (EntityHitResult hit : this.sweepHits(level, from, to, 0.35)) {
				if (hit.getEntity() instanceof LivingEntity target && this.hits.add(target.getId())) {
					this.tideHit(level, target, hit.getLocation());
					if (--this.pierceLeft <= 0) {
						this.discard();
						return true;
					}
				}
			}

			return false;
		}

		for (EntityHitResult hit : this.sweepHits(level, from, to, 0.3)) {
			if (!(hit.getEntity() instanceof LivingEntity target)) {
				continue;
			}

			this.setPos(hit.getLocation());
			if (kind == Kind.FLAME) {
				this.explode(level, hit.getLocation());
			} else {
				this.umbraHit(level, target, hit.getLocation());
			}

			this.discard();
			return true;
		}

		return false;
	}

	@Override
	protected void onBlockImpact(ServerLevel level, BlockHitResult hit) {
		Vec3 location = hit.getLocation();
		switch (this.kind()) {
			case FLAME -> this.explode(level, location);
			case TIDE -> JuliusNetworking.sendFx(level, FxType.WATER_SPLASH, null, location, Vec3.atLowerCornerOf(hit.getDirection().getUnitVec3i()), Spirit.KUA.color, 0.8F);
			case UMBRA -> this.umbraBurst(level, location, null);
		}

		this.discard();
	}

	@Override
	protected void onExpire(ServerLevel level) {
		if (this.kind() == Kind.FLAME) {
			this.explode(level, this.position());
		} else if (this.kind() == Kind.UMBRA) {
			this.umbraBurst(level, this.position(), null);
		}
	}

	private void explode(ServerLevel level, Vec3 center) {
		ServerPlayer owner = this.ownerPlayer();
		float power = this.power();
		double radius = 2.8 * power;
		if (owner != null) {
			for (LivingEntity target : CombatUtil.targetsInSphere(owner, center, radius)) {
				double distance = CombatUtil.closestPoint(target.getBoundingBox(), center).distanceTo(center);
				float falloff = (float) Mth.clamp(1.0 - distance / (radius * 1.6), 0.45, 1.0);
				if (CombatUtil.damage(owner, target, JuliusDamageTypes.SPIRIT_FIRE, this, 8.0F * power * falloff)) {
					target.igniteForSeconds(3.0F);
					CombatUtil.knockback(target, CombatUtil.horizontalDirection(center, target.position(), this.getDeltaMovement()), 0.65 * falloff, 0.28);
				}
			}
		}

		JuliusNetworking.sendFx(level, FxType.FLAME_EXPLOSION, null, center, this.getDeltaMovement().normalize(), Spirit.IA.color, (float) radius);
		JuliusServer.playSoundAt(level, center, JuliusSounds.FIRE_EXPLODE, 1.0F, 0.95F + this.random.nextFloat() * 0.1F);
	}

	private void tideHit(ServerLevel level, LivingEntity target, Vec3 location) {
		ServerPlayer owner = this.ownerPlayer();
		if (owner == null) {
			return;
		}

		if (CombatUtil.damage(owner, target, JuliusDamageTypes.SPIRIT_ART, this, 7.0F * this.power())) {
			target.clearFire();
			CombatUtil.knockback(target, this.getDeltaMovement(), 0.9, 0.15);
			owner.heal(1.5F);
		}

		JuliusNetworking.sendFx(level, FxType.WATER_SPLASH, target, location, this.getDeltaMovement().normalize(), Spirit.KUA.color, 1.0F);
	}

	private void umbraHit(ServerLevel level, LivingEntity target, Vec3 location) {
		ServerPlayer owner = this.ownerPlayer();
		if (owner != null && CombatUtil.damage(owner, target, JuliusDamageTypes.SPIRIT_YIN, this, 6.0F * this.power())) {
			// Nes impairs the opponent's strength (canon: "Strength Impairment").
			target.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 100, 1), owner);
			target.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, 100, 0), owner);
			CombatUtil.knockback(target, this.getDeltaMovement(), 0.3, 0.0);
		}

		this.umbraBurst(level, location, target);
	}

	private void umbraBurst(ServerLevel level, Vec3 center, LivingEntity primary) {
		ServerPlayer owner = this.ownerPlayer();
		if (owner != null) {
			for (LivingEntity target : CombatUtil.targetsInSphere(owner, center, 2.2)) {
				if (target != primary) {
					target.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 60, 0), owner);
					CombatUtil.damage(owner, target, JuliusDamageTypes.SPIRIT_YIN, this, 2.0F * this.power());
				}
			}
		}

		JuliusNetworking.sendFx(level, FxType.UMBRAL_IMPACT, null, center, Vec3.ZERO, Spirit.NES.color, 2.2F);
	}

	@Override
	protected void spawnTrail(Vec3 position, Vec3 motion) {
		RandomSource random = this.random;
		Kind kind = this.kind();
		int count = ParticleDensity.scale(kind == Kind.UMBRA ? 2 : 3, random);
		for (int i = 0; i < count; i++) {
			double t = random.nextDouble();
			double x = position.x - motion.x * t + (random.nextDouble() - 0.5) * 0.18;
			double y = position.y - motion.y * t + (random.nextDouble() - 0.5) * 0.18;
			double z = position.z - motion.z * t + (random.nextDouble() - 0.5) * 0.18;
			switch (kind) {
				case FLAME -> {
					this.level().addParticle(JuliusParticles.of(JuliusParticles.FLAME, Spirit.IA.color, 0.8F), x, y, z, 0.0, 0.02, 0.0);
					if (random.nextFloat() < 0.5F) {
						this.level().addParticle(JuliusParticles.of(JuliusParticles.EMBER, Spirit.IA.accent, 1.0F), x, y, z,
							(random.nextDouble() - 0.5) * 0.06, 0.04, (random.nextDouble() - 0.5) * 0.06);
					}
				}
				case TIDE -> {
					this.level().addParticle(JuliusParticles.of(JuliusParticles.DROPLET, Spirit.KUA.color, 0.9F), x, y, z,
						(random.nextDouble() - 0.5) * 0.05, 0.02, (random.nextDouble() - 0.5) * 0.05);
					this.level().addParticle(JuliusParticles.of(JuliusParticles.GLOW_SPARK, Spirit.KUA.accent, 0.8F), x, y, z, 0.0, 0.0, 0.0);
				}
				case UMBRA -> {
					this.level().addParticle(JuliusParticles.of(JuliusParticles.SHADOW_WISP, Spirit.NES.accent, 1.2F), x, y, z, 0.0, 0.01, 0.0);
					this.level().addParticle(JuliusParticles.of(JuliusParticles.GLOW_SPARK, Spirit.NES.color, 0.7F), x, y, z, 0.0, 0.0, 0.0);
				}
			}
		}
	}

	public enum Kind {
		FLAME(1.3, 40),
		TIDE(1.85, 24),
		UMBRA(1.15, 50);

		private static final Kind[] VALUES = values();
		final double speed;
		final int lifetime;

		Kind(double speed, int lifetime) {
			this.speed = speed;
			this.lifetime = lifetime;
		}

		public static Kind byId(int id) {
			return id >= 0 && id < VALUES.length ? VALUES[id] : FLAME;
		}
	}
}
