package com.ordnance.weapon;

import com.ordnance.Ordnance;
import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.entity.HypersonicMissileEntity;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.explosion.OrdnanceExplosion;
import com.ordnance.network.OrdnanceNetworking;
import com.ordnance.registry.ModSounds;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.entity.Entity;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ChunkTicketType;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.ChunkPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.jspecify.annotations.Nullable;

/**
 * Schedules hypersonic missile strikes: a countdown with warnings at the target, then a missile released high above
 * and behind the caller that streaks in to the target. The target chunks are kept loaded until impact, and a
 * failsafe detonates on schedule even if the missile entity never got to tick.
 */
public final class MissileStrikeManager {
	public static final ChunkTicketType STRIKE_TICKET = Registry.register(
		Registries.TICKET_TYPE, Ordnance.id("missile_strike"), new ChunkTicketType(60L, ChunkTicketType.FOR_LOADING | ChunkTicketType.FOR_SIMULATION)
	);
	private static final Map<RegistryKey<World>, List<Strike>> STRIKES = new HashMap<>();
	private static int nextId;

	private MissileStrikeManager() {
	}

	public static void init() {
	}

	public static int schedule(ServerWorld world, Vec3d target, @Nullable Entity caller) {
		OrdnanceConfig.MissileStrike cfg = ConfigManager.get().weapons.missileStrike;
		Strike strike = new Strike(nextId++, target, caller == null ? null : caller.getUuid(), caller == null ? null : caller.getEntityPos(), cfg.countdownTicks);
		STRIKES.computeIfAbsent(world.getRegistryKey(), key -> new ArrayList<>()).add(strike);
		keepLoaded(world, strike);
		return strike.id;
	}

	public static void onImpact(ServerWorld world, int strikeId) {
		List<Strike> list = STRIKES.get(world.getRegistryKey());
		if (list != null) {
			for (Strike strike : list) {
				if (strike.id == strikeId) {
					strike.detonated = true;
				}
			}
		}
	}

	public static void tick(ServerWorld world) {
		List<Strike> list = STRIKES.get(world.getRegistryKey());
		if (list == null || list.isEmpty()) {
			return;
		}

		OrdnanceConfig.MissileStrike cfg = ConfigManager.get().weapons.missileStrike;
		for (Iterator<Strike> it = list.iterator(); it.hasNext(); ) {
			Strike strike = it.next();
			strike.age++;
			if (strike.age % 20 == 0) {
				keepLoaded(world, strike);
			}

			if (strike.detonated) {
				it.remove();
				continue;
			}

			if (strike.missile == null) {
				int remaining = strike.countdown - strike.age;
				if (remaining % 20 == 0 || remaining == 10) {
					warn(world, strike, remaining, cfg);
				}

				if (remaining <= 0) {
					launch(world, strike, cfg);
				}
			} else if (strike.age > strike.impactAge + 40) {
				// Failsafe: the missile never arrived (unloaded chunks, removed entity).
				strike.missile.discard();
				OrdnanceExplosion.detonate(world, strike.target, ExplosionProfile.HYPERSONIC_MISSILE, null, ownerOf(world, strike), new Vec3d(0.0, -1.0, 0.0));
				it.remove();
			}
		}
	}

	public static void clear() {
		STRIKES.clear();
	}

	@Nullable
	private static Entity ownerOf(ServerWorld world, Strike strike) {
		return strike.owner == null ? null : world.getEntity(strike.owner);
	}

	private static void keepLoaded(ServerWorld world, Strike strike) {
		world.getChunkManager().addTicket(STRIKE_TICKET, new ChunkPos(BlockPos.ofFloored(strike.target)), 2);
		if (strike.release != null) {
			world.getChunkManager().addTicket(STRIKE_TICKET, new ChunkPos(BlockPos.ofFloored(strike.release)), 1);
		}
	}

	private static void warn(ServerWorld world, Strike strike, int remaining, OrdnanceConfig.MissileStrike cfg) {
		int ticksToImpact = remaining + estimateFlightTicks(strike, cfg);
		for (ServerPlayerEntity player : world.getPlayers()) {
			double distance = player.getEntityPos().distanceTo(strike.target);
			boolean caller = strike.owner != null && strike.owner.equals(player.getUuid());
			if (caller || cfg.warnNearbyPlayers && distance < 160.0) {
				ServerPlayNetworking.send(player, new OrdnanceNetworking.StrikeWarning(strike.target, ticksToImpact));
			}
		}

		world.playSound(null, strike.target.x, strike.target.y, strike.target.z, ModSounds.MISSILE_ALARM, SoundCategory.HOSTILE, 3.0F, 1.0F);
	}

	private static Vec3d releasePoint(Strike strike) {
		Vec3d horizontal;
		if (strike.callerPos != null && strike.callerPos.squaredDistanceTo(strike.target) > 4.0) {
			Vec3d toCaller = strike.callerPos.subtract(strike.target);
			horizontal = new Vec3d(toCaller.x, 0.0, toCaller.z).normalize();
		} else {
			double angle = (strike.id * 2.39996) % (Math.PI * 2.0);
			horizontal = new Vec3d(Math.cos(angle), 0.0, Math.sin(angle));
		}

		double offset = strike.callerPos == null ? 70.0 : Math.min(110.0, strike.callerPos.distanceTo(strike.target) * 0.8 + 35.0);
		return strike.target.add(horizontal.multiply(offset)).add(0.0, 180.0, 0.0);
	}

	private static int estimateFlightTicks(Strike strike, OrdnanceConfig.MissileStrike cfg) {
		return (int)Math.ceil(releasePoint(strike).distanceTo(strike.target) / cfg.missileSpeed);
	}

	private static void launch(ServerWorld world, Strike strike, OrdnanceConfig.MissileStrike cfg) {
		Vec3d start = releasePoint(strike);
		strike.release = start;
		keepLoaded(world, strike);
		HypersonicMissileEntity missile = new HypersonicMissileEntity(world, start, strike.target, cfg.missileSpeed, ownerOf(world, strike), strike.id);
		world.spawnEntity(missile);
		strike.missile = missile;
		strike.impactAge = strike.age + estimateFlightTicks(strike, cfg);
		for (ServerPlayerEntity player : world.getPlayers()) {
			if (player.getEntityPos().distanceTo(strike.target) < 240.0) {
				ServerPlayNetworking.send(player, new OrdnanceNetworking.StrikeWarning(strike.target, estimateFlightTicks(strike, cfg)));
			}
		}
	}

	private static final class Strike {
		final int id;
		final Vec3d target;
		@Nullable
		final UUID owner;
		@Nullable
		final Vec3d callerPos;
		final int countdown;
		int age;
		int impactAge;
		@Nullable
		Vec3d release;
		@Nullable
		HypersonicMissileEntity missile;
		boolean detonated;

		Strike(int id, Vec3d target, @Nullable UUID owner, @Nullable Vec3d callerPos, int countdown) {
			this.id = id;
			this.target = target;
			this.owner = owner;
			this.callerPos = callerPos;
			this.countdown = countdown;
		}
	}
}
