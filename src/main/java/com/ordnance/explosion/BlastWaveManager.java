package com.ordnance.explosion;

import com.ordnance.network.OrdnanceNetworking;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.entity.Entity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.jspecify.annotations.Nullable;

/**
 * The blast front travels outward at a finite speed: entities farther from the centre are hit a few ticks later,
 * matching the visual shockwave ring. Hits are queued per world and applied at the end of the world tick.
 */
public final class BlastWaveManager {
	private static final Map<RegistryKey<World>, List<Pending>> PENDING = new HashMap<>();

	private BlastWaveManager() {
	}

	public static void schedule(ServerWorld world, Hit hit, int delayTicks) {
		if (delayTicks <= 0) {
			apply(world, hit);
		} else {
			PENDING.computeIfAbsent(world.getRegistryKey(), key -> new ArrayList<>()).add(new Pending(hit, world.getTime() + delayTicks));
		}
	}

	public static void tick(ServerWorld world) {
		List<Pending> list = PENDING.get(world.getRegistryKey());
		if (list == null || list.isEmpty()) {
			return;
		}

		long now = world.getTime();
		List<Hit> due = new ArrayList<>();
		for (Iterator<Pending> it = list.iterator(); it.hasNext(); ) {
			Pending pending = it.next();
			if (pending.dueTime <= now) {
				due.add(pending.hit);
				it.remove();
			}
		}

		for (Hit hit : due) {
			apply(world, hit);
		}
	}

	public static void clear() {
		PENDING.clear();
	}

	/** Applies damage, burning and blast pressure. Ordnance hits ignore hurt cooldowns: each blast is a separate event. */
	public static void apply(ServerWorld world, Hit hit) {
		Entity entity = hit.entity();
		if (entity.isRemoved() || entity.getEntityWorld() != world) {
			return;
		}

		if (hit.damage() > 0.05F) {
			entity.timeUntilRegen = 0;
			entity.damage(world, hit.source(), hit.damage());
		}

		if (hit.igniteSeconds() > 0.0F && !entity.isFireImmune() && !entity.isTouchingWater()) {
			entity.setOnFireFor(hit.igniteSeconds());
		}

		Vec3d knockback = hit.knockback();
		if (knockback.lengthSquared() > 1.0E-5) {
			push(entity, knockback);
		}

		entity.onExplodedBy(hit.cause());
	}

	/** Player movement is client-authoritative, so players get their impulse through a packet. */
	public static void push(Entity entity, Vec3d impulse) {
		if (entity instanceof ServerPlayerEntity player) {
			if (player.isSpectator() || player.isCreative() && player.getAbilities().flying) {
				return;
			}

			player.addVelocity(impulse);
			ServerPlayNetworking.send(player, new OrdnanceNetworking.Knockback(impulse));
		} else {
			entity.addVelocity(impulse);
		}
	}

	public record Hit(Entity entity, float damage, DamageSource source, Vec3d knockback, float igniteSeconds, @Nullable Entity cause) {
	}

	private record Pending(Hit hit, long dueTime) {
	}
}
