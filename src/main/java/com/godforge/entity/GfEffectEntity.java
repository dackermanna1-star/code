package com.godforge.entity;

import com.godforge.util.EffectEntity;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityReference;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.TraceableEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import org.jspecify.annotations.Nullable;

/** Base for stationary/scripted effect entities (singularities, suns, rifts, markers ...). */
public abstract class GfEffectEntity extends Entity implements EffectEntity, TraceableEntity {
	protected static final EntityDataAccessor<Float> DATA_SIZE = SynchedEntityData.defineId(GfEffectEntity.class, EntityDataSerializers.FLOAT);
	protected static final EntityDataAccessor<Integer> DATA_AGE = SynchedEntityData.defineId(GfEffectEntity.class, EntityDataSerializers.INT);
	protected static final EntityDataAccessor<Integer> DATA_LIFETIME = SynchedEntityData.defineId(GfEffectEntity.class, EntityDataSerializers.INT);
	protected static final EntityDataAccessor<Integer> DATA_VARIANT = SynchedEntityData.defineId(GfEffectEntity.class, EntityDataSerializers.INT);

	protected @Nullable EntityReference<Entity> owner;
	protected boolean terrain = true;

	protected GfEffectEntity(EntityType<?> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_SIZE, 1.0F);
		builder.define(DATA_AGE, 0);
		builder.define(DATA_LIFETIME, 100);
		builder.define(DATA_VARIANT, 0);
	}

	public void setOwner(@Nullable Entity entity) {
		this.owner = EntityReference.of(entity);
	}

	@Override
	public @Nullable Entity getOwner() {
		return EntityReference.getEntity(this.owner, this.level());
	}

	public void setTerrain(boolean terrain) {
		this.terrain = terrain;
	}

	public float size() {
		return this.entityData.get(DATA_SIZE);
	}

	public void setSize(float size) {
		this.entityData.set(DATA_SIZE, size);
	}

	public int age() {
		return this.entityData.get(DATA_AGE);
	}

	public int lifetime() {
		return this.entityData.get(DATA_LIFETIME);
	}

	public void setLifetime(int ticks) {
		this.entityData.set(DATA_LIFETIME, ticks);
	}

	public int variant() {
		return this.entityData.get(DATA_VARIANT);
	}

	public void setVariant(int variant) {
		this.entityData.set(DATA_VARIANT, variant);
	}

	/** 0..1 progress through the lifetime (client-smooth with partial ticks). */
	public float progress(float partialTick) {
		return Math.min(1.0F, (this.age() + partialTick) / Math.max(1, this.lifetime()));
	}

	@Override
	public void tick() {
		super.tick();
		if (this.level() instanceof ServerLevel server) {
			int age = this.age() + 1;
			this.entityData.set(DATA_AGE, age);
			this.serverTick(server, age);
			if (!this.isRemoved() && age >= this.lifetime()) {
				this.onEnd(server);
				if (!this.isRemoved()) {
					this.discard();
				}
			}
		} else {
			this.clientTick();
		}
	}

	protected abstract void serverTick(ServerLevel level, int age);

	protected void onEnd(ServerLevel level) {
	}

	protected void clientTick() {
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		double d = 320.0 + this.size() * 16.0;
		return distance < d * d;
	}

	@Override
	public boolean isPickable() {
		return false;
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		return false;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}
}
