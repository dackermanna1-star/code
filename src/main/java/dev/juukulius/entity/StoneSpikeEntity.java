package dev.juukulius.entity;

import dev.juukulius.combat.CombatUtil;
import dev.juukulius.registry.JuliusDamageTypes;
import dev.juukulius.registry.JuliusEntities;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
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
 * One of Iku's stone spires. It erupts from the ground (launching whatever stands on it), lingers, then sinks back.
 * Purely an attack and a visual: it never changes terrain and has no collision.
 */
public class StoneSpikeEntity extends Entity {
	public static final int RISE_TICKS = 4;
	public static final int LIFETIME = 34;
	public static final int SINK_TICKS = 9;

	private static final EntityDataAccessor<Float> SIZE = SynchedEntityData.defineId(StoneSpikeEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Float> SPIN = SynchedEntityData.defineId(StoneSpikeEntity.class, EntityDataSerializers.FLOAT);

	private @Nullable ServerPlayer owner;

	public StoneSpikeEntity(EntityType<? extends StoneSpikeEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
		this.setNoGravity(true);
	}

	public StoneSpikeEntity(Level level, ServerPlayer owner, Vec3 position, float size, float spin) {
		this(JuliusEntities.STONE_SPIKE, level);
		this.owner = owner;
		this.setPos(position);
		this.entityData.set(SIZE, size);
		this.entityData.set(SPIN, spin);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(SIZE, 1.0F);
		builder.define(SPIN, 0.0F);
	}

	public float size() {
		return this.entityData.get(SIZE);
	}

	public float spin() {
		return this.entityData.get(SPIN);
	}

	/** 0 → 1 while erupting, 1 while standing, 1 → 0 while sinking. */
	public float extension(float partialTick) {
		float age = this.tickCount + partialTick;
		if (age < RISE_TICKS) {
			float t = age / RISE_TICKS;
			return 1.0F - (1.0F - t) * (1.0F - t) * (1.0F - t);
		}

		float remaining = LIFETIME - age;
		if (remaining < SINK_TICKS) {
			return Math.max(0.0F, remaining / SINK_TICKS);
		}

		return 1.0F;
	}

	@Override
	public void tick() {
		super.tick();
		if (this.level() instanceof ServerLevel level) {
			if (this.tickCount == 2 && this.owner != null) {
				this.erupt(level);
			}

			if (this.tickCount >= LIFETIME) {
				this.discard();
			}
		}
	}

	private void erupt(ServerLevel level) {
		float size = this.size();
		double radius = 0.75 + 0.35 * size;
		Vec3 base = this.position();
		for (LivingEntity target : CombatUtil.targetsInSphere(this.owner, base.add(0.0, 0.6, 0.0), radius + 0.6)) {
			if (Math.abs(target.getY() - base.y) < 2.2 && CombatUtil.damage(this.owner, target, JuliusDamageTypes.SPIRIT_ART, this, 6.0F * size)) {
				CombatUtil.knockback(target, CombatUtil.horizontalDirection(base, target.position(), this.owner.getLookAngle()), 0.25, 0.75 * size);
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
		return distance < 96.0 * 96.0;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}
}
