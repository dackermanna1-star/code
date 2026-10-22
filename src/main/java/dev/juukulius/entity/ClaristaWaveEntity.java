package dev.juukulius.entity;

import dev.juukulius.combat.CombatRules;
import dev.juukulius.combat.CombatUtil;
import dev.juukulius.network.FxType;
import dev.juukulius.network.JuliusNetworking;
import dev.juukulius.particle.ParticleDensity;
import dev.juukulius.registry.JuliusDamageTypes;
import dev.juukulius.registry.JuliusEntities;
import dev.juukulius.registry.JuliusParticles;
import it.unimi.dsi.fastutil.ints.IntOpenHashSet;
import it.unimi.dsi.fastutil.ints.IntSet;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * The long-range form of Al Clarista: the six spirits' light leaves the blade as a rainbow crescent that cuts through
 * every enemy in its path (each once) and dissipates against walls.
 */
public class ClaristaWaveEntity extends JuliusProjectile {
	private static final EntityDataAccessor<Float> POWER = SynchedEntityData.defineId(ClaristaWaveEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Float> ROLL = SynchedEntityData.defineId(ClaristaWaveEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Boolean> EMPOWERED = SynchedEntityData.defineId(ClaristaWaveEntity.class, EntityDataSerializers.BOOLEAN);

	private final IntSet hits = new IntOpenHashSet();

	public ClaristaWaveEntity(EntityType<? extends ClaristaWaveEntity> type, Level level) {
		super(type, level);
	}

	public ClaristaWaveEntity(Level level, ServerPlayer owner, Vec3 position, Vec3 direction, float power, boolean empowered) {
		this(JuliusEntities.AL_CLARISTA_WAVE, level);
		this.entityData.set(POWER, power);
		this.entityData.set(ROLL, (owner.getRandom().nextFloat() - 0.5F) * 30.0F);
		this.entityData.set(EMPOWERED, empowered);
		this.lifetime = 14 + Math.round(10 * power);
		this.launch(owner, position, direction, 1.45 + 0.45 * power);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(POWER, 0.0F);
		builder.define(ROLL, 0.0F);
		builder.define(EMPOWERED, false);
	}

	public float power() {
		return this.entityData.get(POWER);
	}

	public float roll() {
		return this.entityData.get(ROLL);
	}

	public boolean empowered() {
		return this.entityData.get(EMPOWERED);
	}

	/** Half the width of the crescent in blocks. */
	public float halfWidth() {
		return 1.15F + 1.25F * this.power() + (this.empowered() ? 0.5F : 0.0F);
	}

	@Override
	protected boolean sweepEntities(ServerLevel level, Vec3 from, Vec3 to) {
		ServerPlayer owner = this.ownerPlayer();
		if (owner == null) {
			return false;
		}

		double halfWidth = this.halfWidth();
		AABB swept = new AABB(from, to).inflate(halfWidth, 1.0, halfWidth);
		Vec3 segment = to.subtract(from);
		double lengthSqr = Math.max(1.0E-6, segment.lengthSqr());
		float power = this.power();
		float damage = Mth.lerp(power, CombatRules.WAVE_MIN_DAMAGE, CombatRules.WAVE_MAX_DAMAGE) * (this.empowered() ? CombatRules.ULTIMATE_DAMAGE_MULTIPLIER : 1.0F);
		for (LivingEntity target : level.getEntitiesOfClass(LivingEntity.class, swept, this::canHitEntity)) {
			Vec3 center = target.getBoundingBox().getCenter();
			double t = Mth.clamp(center.subtract(from).dot(segment) / lengthSqr, 0.0, 1.0);
			Vec3 nearest = from.add(segment.scale(t));
			double lateral = new Vec3(center.x - nearest.x, 0.0, center.z - nearest.z).length();
			double vertical = Math.abs(center.y - nearest.y);
			if (lateral <= halfWidth + target.getBbWidth() * 0.5 && vertical <= 1.0 + target.getBbHeight() * 0.5 && this.hits.add(target.getId())) {
				if (CombatUtil.damage(owner, target, JuliusDamageTypes.AL_CLARISTA, this, damage)) {
					CombatUtil.knockback(target, this.getDeltaMovement(), 0.6 + 0.6 * power, 0.18);
					JuliusNetworking.sendFx(level, FxType.SLASH_HIT, target, center, this.getDeltaMovement().normalize(), 0xFFFFFF, 3.0F);
				}
			}
		}

		return false;
	}

	@Override
	protected void onBlockImpact(ServerLevel level, BlockHitResult hit) {
		this.burst(level, hit.getLocation());
		this.discard();
	}

	@Override
	protected void onExpire(ServerLevel level) {
		this.burst(level, this.position());
	}

	private void burst(ServerLevel level, Vec3 position) {
		JuliusNetworking.sendFx(level, FxType.WAVE_IMPACT, null, position, this.getDeltaMovement().normalize(), 0xFFFFFF, this.power());
	}

	@Override
	protected void spawnTrail(Vec3 position, Vec3 motion) {
		int count = ParticleDensity.scale(4 + Math.round(4 * this.power()), this.random);
		Vec3 heading = motion.normalize();
		Vec3 side = heading.cross(new Vec3(0.0, 1.0, 0.0));
		side = side.lengthSqr() < 1.0E-6 ? new Vec3(1.0, 0.0, 0.0) : side.normalize();
		double halfWidth = this.halfWidth();
		for (int i = 0; i < count; i++) {
			double s = (this.random.nextDouble() * 2.0 - 1.0) * halfWidth;
			double back = this.random.nextDouble() * motion.length();
			double bow = (1.0 - (s / halfWidth) * (s / halfWidth)) * 0.6;
			Vec3 p = position.add(side.scale(s)).subtract(heading.scale(back - bow));
			this.level().addParticle(JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, 0xFFFFFF, 0.9F + this.random.nextFloat() * 0.6F), p.x, p.y, p.z,
				heading.x * 0.05, 0.01, heading.z * 0.05);
		}
	}
}
