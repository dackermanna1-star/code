package com.laptopcraft.delivery;

import com.laptopcraft.LaptopCraft;
import com.laptopcraft.shop.Store;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Leashable;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Purely cosmetic couriers that appear for a moment when a package is delivered: an Enderman for
 * Ender Eats (it teleports in, sets the bag down and teleports away) and a hovering Allay "Prime Air drone"
 * for Emerazon. Couriers have no AI, are invulnerable and silent, and are removed after a couple of seconds.
 * They are tagged so a courier that somehow got saved (crash, chunk unload) is discarded when it loads again.
 */
public final class CourierManager {
	public static final String TAG = "laptopcraft_courier";
	private static final int LIFETIME_TICKS = 50;
	private static final double SPECTATOR_RANGE = 48;

	private record Active(ResourceKey<Level> dimension, UUID entity, long despawnAt, Store store) {
	}

	private static final Map<UUID, Active> ACTIVE = new HashMap<>();
	private static long ticks;

	private CourierManager() {
	}

	static void init() {
		ServerEntityEvents.ENTITY_LOAD.register((entity, level) -> {
			if (entity.getTags().contains(TAG) && !ACTIVE.containsKey(entity.getUUID())) {
				entity.discard();
			}
		});
		ServerLifecycleEvents.SERVER_STOPPING.register(CourierManager::removeAll);
	}

	/** Spawns the courier next to a freshly delivered package if a player is around to see it. */
	static void spawn(ServerLevel level, BlockPos packagePos, Store store, @Nullable Vec3 recipient) {
		try {
			if (!level.hasNearbyAlivePlayer(packagePos.getX() + 0.5, packagePos.getY(), packagePos.getZ() + 0.5, SPECTATOR_RANGE)) {
				return;
			}
			Mob courier = store == Store.ENDER_EATS ? createEnderman(level, packagePos, recipient) : createAllay(level, packagePos, recipient);
			if (courier == null) {
				return;
			}
			courier.setNoAi(true);
			courier.setInvulnerable(true);
			courier.setSilent(true);
			courier.setPersistenceRequired();
			courier.addTag(TAG);
			ACTIVE.put(courier.getUUID(), new Active(level.dimension(), courier.getUUID(), ticks + LIFETIME_TICKS, store));
			if (!level.addFreshEntity(courier)) {
				ACTIVE.remove(courier.getUUID());
			}
		} catch (RuntimeException e) {
			// Couriers are decoration: never let them break a delivery.
			LaptopCraft.LOGGER.warn("Could not spawn delivery courier", e);
		}
	}

	private static @Nullable Mob createEnderman(ServerLevel level, BlockPos packagePos, @Nullable Vec3 recipient) {
		Mob enderman = EntityType.ENDERMAN.create(level, EntitySpawnReason.EVENT);
		if (enderman == null) {
			return null;
		}
		// Stand beside the bag, preferably on the side facing away from the recipient (so they see both).
		List<Direction> sides = new ArrayList<>(Direction.Plane.HORIZONTAL.stream().toList());
		if (recipient != null) {
			Vec3 center = Vec3.atBottomCenterOf(packagePos);
			sides.sort((a, b) -> Double.compare(
					center.add(b.getStepX(), 0, b.getStepZ()).distanceToSqr(recipient),
					center.add(a.getStepX(), 0, a.getStepZ()).distanceToSqr(recipient)));
		}
		for (Direction side : sides) {
			BlockPos spot = packagePos.relative(side);
			if (!level.getBlockState(spot.below()).isFaceSturdy(level, spot.below(), Direction.UP)) {
				continue;
			}
			place(enderman, Vec3.atBottomCenterOf(spot), recipient);
			if (level.noCollision(enderman)) {
				return enderman;
			}
		}
		return null;
	}

	private static @Nullable Mob createAllay(ServerLevel level, BlockPos packagePos, @Nullable Vec3 recipient) {
		Mob allay = EntityType.ALLAY.create(level, EntitySpawnReason.EVENT);
		if (allay == null) {
			return null;
		}
		allay.setNoGravity(true);
		place(allay, Vec3.atBottomCenterOf(packagePos).add(0, 0.85, 0), recipient);
		return level.noCollision(allay) ? allay : null;
	}

	private static void place(Entity entity, Vec3 pos, @Nullable Vec3 lookAt) {
		float yaw = 0;
		if (lookAt != null) {
			yaw = (float) (Mth.atan2(lookAt.z - pos.z, lookAt.x - pos.x) * Mth.RAD_TO_DEG) - 90f;
		}
		entity.snapTo(pos.x, pos.y, pos.z, yaw, 0);
		entity.setYHeadRot(yaw);
		if (entity instanceof Mob mob) {
			mob.setYBodyRot(yaw);
		}
	}

	/** Removes couriers whose moment is over. Called every server tick. */
	static void tick(MinecraftServer server) {
		ticks++;
		if (ACTIVE.isEmpty()) {
			return;
		}
		Iterator<Active> it = ACTIVE.values().iterator();
		while (it.hasNext()) {
			Active active = it.next();
			if (active.despawnAt() > ticks) {
				continue;
			}
			it.remove();
			ServerLevel level = server.getLevel(active.dimension());
			Entity entity = level == null ? null : level.getEntity(active.entity());
			if (entity != null) {
				leave(level, entity, active.store());
			}
		}
	}

	private static void leave(ServerLevel level, Entity entity, Store store) {
		double x = entity.getX();
		double y = entity.getY();
		double z = entity.getZ();
		if (store == Store.ENDER_EATS) {
			level.sendParticles(ParticleTypes.PORTAL, x, y + 1.2, z, 60, 0.3, 1.0, 0.3, 0.5);
			level.playSound(null, x, y, z, SoundEvents.ENDERMAN_TELEPORT, SoundSource.NEUTRAL, 0.9f, 1.2f);
		} else {
			level.sendParticles(ParticleTypes.POOF, x, y + 0.3, z, 10, 0.2, 0.2, 0.2, 0.02);
			level.playSound(null, x, y, z, SoundEvents.ALLAY_AMBIENT_WITHOUT_ITEM, SoundSource.NEUTRAL, 0.8f, 1.3f);
		}
		despawn(entity);
	}

	/** Discards a courier, returning anything a player handed it. */
	private static void despawn(Entity entity) {
		if (entity instanceof Mob mob) {
			ItemStack held = mob.getItemInHand(InteractionHand.MAIN_HAND);
			if (!held.isEmpty()) {
				mob.spawnAtLocation((ServerLevel) mob.level(), held.copy());
				mob.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
			}
		}
		if (entity instanceof Leashable leashable && leashable.isLeashed()) {
			leashable.dropLeash();
		}
		entity.discard();
	}

	private static void removeAll(MinecraftServer server) {
		for (Active active : ACTIVE.values()) {
			ServerLevel level = server.getLevel(active.dimension());
			Entity entity = level == null ? null : level.getEntity(active.entity());
			if (entity != null) {
				despawn(entity);
			}
		}
		ACTIVE.clear();
	}
}
