package com.godforge.entity;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;

/** A holographic targeting reticle + sky beam marking where a strike will land. Purely visual. */
public class TargetMarkerEntity extends GfEffectEntity {
	public TargetMarkerEntity(EntityType<? extends TargetMarkerEntity> type, Level level) {
		super(type, level);
	}

	/** @param color RGB; @param radius ring size in blocks; @param lifetime ticks */
	public void configure(int color, float radius, int lifetime) {
		this.setVariant(color);
		this.setSize(radius);
		this.setLifetime(lifetime);
	}

	public int color() {
		return this.variant();
	}

	@Override
	protected void serverTick(ServerLevel level, int age) {
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 512.0 * 512.0;
	}
}
