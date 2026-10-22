package dev.juukulius.client.fx;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Where an effect sits: either fixed in the world, or following an entity (so effects stay attached to Julius, his
 * sword hand or a projectile instead of being left behind).
 */
public final class Anchor {
	private final int entityId;
	private final Vec3 offset;
	private Vec3 lastKnown;

	private Anchor(int entityId, Vec3 offset, Vec3 lastKnown) {
		this.entityId = entityId;
		this.offset = offset;
		this.lastKnown = lastKnown;
	}

	public static Anchor fixed(Vec3 position) {
		return new Anchor(-1, Vec3.ZERO, position);
	}

	/** Follows {@code entity}; {@code worldPosition} is converted into an offset from the entity's feet. */
	public static Anchor follow(@Nullable Entity entity, Vec3 worldPosition) {
		if (entity == null) {
			return fixed(worldPosition);
		}

		return new Anchor(entity.getId(), worldPosition.subtract(entity.position()), worldPosition);
	}

	public Vec3 position(float partialTick) {
		if (this.entityId >= 0) {
			ClientLevel level = Minecraft.getInstance().level;
			Entity entity = level != null ? level.getEntity(this.entityId) : null;
			if (entity != null && !entity.isRemoved()) {
				this.lastKnown = entity.getPosition(partialTick).add(this.offset);
			}
		}

		return this.lastKnown;
	}

	public @Nullable Entity entity() {
		ClientLevel level = Minecraft.getInstance().level;
		return this.entityId >= 0 && level != null ? level.getEntity(this.entityId) : null;
	}
}
