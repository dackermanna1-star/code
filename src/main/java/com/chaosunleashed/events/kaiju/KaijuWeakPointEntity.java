package com.chaosunleashed.events.kaiju;

import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityDimensions;
import net.minecraft.entity.EntityPose;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.damage.DamageTypes;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

/**
 * A glowing weak spot on the Kaiju's legs or back. It is a separate, hittable entity that the Kaiju keeps
 * glued to its body every tick; damage dealt to it is forwarded to the Kaiju with a big multiplier.
 */
public class KaijuWeakPointEntity extends Entity {
	private static final TrackedData<Float> SIZE = DataTracker.registerData(KaijuWeakPointEntity.class, TrackedDataHandlerRegistry.FLOAT);
	@Nullable
	private KaijuEntity owner;

	public KaijuWeakPointEntity(EntityType<? extends KaijuWeakPointEntity> type, World world) {
		super(type, world);
		this.noClip = true;
		this.setNoGravity(true);
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		builder.add(SIZE, 3.0F);
	}

	public float getSize() {
		return this.dataTracker.get(SIZE);
	}

	public void setSize(float size) {
		this.dataTracker.set(SIZE, size);
		this.calculateDimensions();
	}

	@Override
	public void onTrackedDataSet(TrackedData<?> data) {
		super.onTrackedDataSet(data);
		if (SIZE.equals(data)) {
			this.calculateDimensions();
		}
	}

	@Override
	public EntityDimensions getDimensions(EntityPose pose) {
		float size = this.getSize();
		return EntityDimensions.fixed(size, size);
	}

	public void setOwner(KaijuEntity owner) {
		this.owner = owner;
	}

	@Override
	public void tick() {
		super.tick();
		if (!this.getEntityWorld().isClient() && (this.owner == null || this.owner.isRemoved())) {
			this.discard();
		}
	}

	@Override
	public boolean canHit() {
		return !this.isRemoved();
	}

	@Override
	public boolean isAttackable() {
		return true;
	}

	@Override
	public boolean damage(ServerWorld world, DamageSource source, float amount) {
		if (source.isOf(DamageTypes.GENERIC_KILL)) {
			this.discard();
			return true;
		}
		if (this.owner != null && this.owner.isAlive()) {
			return this.owner.damageWeakPoint(world, source, amount, this);
		}
		return false;
	}

	@Override
	public boolean shouldRender(double distance) {
		return distance < 384.0 * 384.0;
	}

	@Override
	protected void readCustomData(ReadView view) {
	}

	@Override
	protected void writeCustomData(WriteView view) {
	}
}
