package dev.juukulius.entity;

import dev.juukulius.combat.CombatUtil;
import dev.juukulius.combat.SpiritArts;
import dev.juukulius.particle.ParticleDensity;
import dev.juukulius.registry.JuliusDamageTypes;
import dev.juukulius.registry.JuliusEntities;
import dev.juukulius.registry.JuliusParticles;
import dev.juukulius.spirit.Spirit;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Ul Gora: Julius calls on Ia and Aro together and their fire and wind become one spiralling firestorm that travels
 * along the ground, drawing enemies into its burning core.
 */
public class FirestormEntity extends Entity {
	public static final int LIFETIME = 64;
	public static final double RADIUS = 2.5;
	public static final double HEIGHT = 4.2;

	private static final EntityDataAccessor<Float> POWER = SynchedEntityData.defineId(FirestormEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Float> HEADING = SynchedEntityData.defineId(FirestormEntity.class, EntityDataSerializers.FLOAT);

	private @Nullable ServerPlayer owner;
	private Vec3 direction = Vec3.ZERO;

	public FirestormEntity(EntityType<? extends FirestormEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
		this.setNoGravity(true);
	}

	public FirestormEntity(Level level, ServerPlayer owner, Vec3 position, Vec3 direction, float power) {
		this(JuliusEntities.UL_GORA_FIRESTORM, level);
		this.owner = owner;
		this.direction = direction.normalize();
		this.setPos(position);
		this.entityData.set(POWER, power);
		this.entityData.set(HEADING, (float) Math.atan2(direction.x, direction.z));
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(POWER, 1.0F);
		builder.define(HEADING, 0.0F);
	}

	public float power() {
		return this.entityData.get(POWER);
	}

	/** Grows in over the first ticks, collapses at the end. */
	public float intensity(float partialTick) {
		float age = this.tickCount + partialTick;
		float in = Math.min(1.0F, age / 8.0F);
		float out = Math.min(1.0F, (LIFETIME - age) / 10.0F);
		return Math.max(0.0F, Math.min(in, out));
	}

	@Override
	public void tick() {
		super.tick();
		Level level = this.level();
		if (level instanceof ServerLevel serverLevel) {
			if (this.tickCount >= LIFETIME || this.owner == null || !this.owner.isAlive()) {
				this.discard();
				return;
			}

			Vec3 next = this.position().add(this.direction.scale(0.22));
			Vec3 ground = SpiritArts.findGround(level, next, this.getY());
			this.setPos(ground != null ? ground : next);
			this.pull(serverLevel);
			if (this.tickCount % 8 == 4) {
				this.burn(serverLevel);
			}
		} else {
			this.spawnSwirl(level.getRandom());
		}
	}

	private void pull(ServerLevel level) {
		Vec3 axis = this.position();
		double radius = RADIUS * this.power();
		for (LivingEntity target : CombatUtil.targetsInSphere(this.owner, axis.add(0.0, 1.5, 0.0), radius + 1.5)) {
			Vec3 offset = new Vec3(axis.x - target.getX(), 0.0, axis.z - target.getZ());
			double distance = offset.length();
			if (distance < 0.2) {
				continue;
			}

			Vec3 inward = offset.normalize();
			Vec3 tangent = new Vec3(-inward.z, 0.0, inward.x);
			Vec3 motion = target.getDeltaMovement().add(inward.scale(0.07)).add(tangent.scale(0.06)).add(0.0, 0.035, 0.0);
			double knockbackResistance = target.getAttributeValue(net.minecraft.world.entity.ai.attributes.Attributes.KNOCKBACK_RESISTANCE);
			target.setDeltaMovement(target.getDeltaMovement().lerp(motion, 1.0 - knockbackResistance));
			target.hurtMarked = true;
		}
	}

	private void burn(ServerLevel level) {
		double radius = RADIUS * this.power();
		for (LivingEntity target : CombatUtil.targetsInSphere(this.owner, this.position().add(0.0, 1.5, 0.0), radius + 0.5)) {
			if (target.getY() - this.getY() < HEIGHT && CombatUtil.damage(this.owner, target, JuliusDamageTypes.SPIRIT_FIRE, this, 3.5F * this.power())) {
				target.igniteForSeconds(4.0F);
			}
		}
	}

	private void spawnSwirl(RandomSource random) {
		int count = ParticleDensity.scale(9, random);
		float power = this.power() * this.intensity(0.0F);
		for (int i = 0; i < count; i++) {
			double height = random.nextDouble() * HEIGHT * power;
			double radius = (0.35 + height / HEIGHT * RADIUS) * power;
			double angle = this.tickCount * 0.55 + random.nextDouble() * Math.PI * 2.0;
			double x = this.getX() + Math.cos(angle) * radius;
			double z = this.getZ() + Math.sin(angle) * radius;
			double y = this.getY() + height;
			double vx = -Math.sin(angle) * 0.18;
			double vz = Math.cos(angle) * 0.18;
			if (random.nextFloat() < 0.6F) {
				this.level().addParticle(JuliusParticles.of(JuliusParticles.FLAME, Spirit.IA.color, 1.4F), x, y, z, vx, 0.06, vz);
			} else if (random.nextFloat() < 0.6F) {
				this.level().addParticle(JuliusParticles.of(JuliusParticles.WIND_STREAK, Spirit.ARO.accent, 1.0F), x, y, z, vx * 2.0, 0.08, vz * 2.0);
			} else {
				this.level().addParticle(JuliusParticles.of(JuliusParticles.EMBER, Spirit.IA.accent, 1.0F), x, y, z, vx, 0.12, vz);
			}
		}
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		return false;
	}

	@Override
	public boolean isPickable() {
		return false;
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 128.0 * 128.0;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}
}
