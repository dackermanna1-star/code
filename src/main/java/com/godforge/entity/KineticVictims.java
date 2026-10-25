package com.godforge.entity;

import com.godforge.destruction.CraterJob;
import com.godforge.destruction.Palette;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.weapon.WeaponAccess;
import com.godforge.weapon.WeaponType;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Creatures launched by the Godfist become kinetic projectiles themselves: when they slam into terrain
 * at speed they shatter it on impact.
 */
public final class KineticVictims {
	private static final class Victim {
		final ServerLevel level;
		final UUID id;
		final @Nullable UUID owner;
		final float damage;
		int ticks;
		double lastSpeed;

		Victim(ServerLevel level, UUID id, @Nullable UUID owner, float damage, int ticks) {
			this.level = level;
			this.id = id;
			this.owner = owner;
			this.damage = damage;
			this.ticks = ticks;
		}
	}

	private static final List<Victim> VICTIMS = new ArrayList<>();

	private KineticVictims() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(KineticVictims::tick);
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> VICTIMS.clear());
	}

	public static void track(ServerLevel level, Entity victim, @Nullable Entity owner, float damage, int ticks) {
		VICTIMS.removeIf(v -> v.id.equals(victim.getUUID()));
		if (VICTIMS.size() < 256) {
			VICTIMS.add(new Victim(level, victim.getUUID(), owner == null ? null : owner.getUUID(), damage, ticks));
		}
	}

	private static void tick(MinecraftServer server) {
		Iterator<Victim> it = VICTIMS.iterator();
		while (it.hasNext()) {
			Victim v = it.next();
			Entity e = v.level.getEntity(v.id);
			if (e == null || !e.isAlive() || --v.ticks <= 0) {
				it.remove();
				continue;
			}
			double speed = e.getDeltaMovement().length();
			boolean slammed = (e.horizontalCollision || e.verticalCollision && v.ticks < 55) && v.lastSpeed > 0.9;
			v.lastSpeed = Math.max(speed, v.lastSpeed * 0.9);
			if (!slammed) {
				continue;
			}
			it.remove();
			Entity owner = v.owner == null ? null : v.level.getEntity(v.owner);
			Vec3 at = e.position().add(0, e.getBbHeight() * 0.5, 0);
			float power = (float) Math.min(4.0, 1.5 + v.lastSpeed * 0.6);
			if (WeaponAccess.terrainAllowed(v.level, owner, (net.minecraft.world.item.ItemStack) null, BlockPos.containing(at))) {
				CraterJob.builder(v.level, BlockPos.containing(at), power).vertical(0.9).noise(0.3).lining(Palette.KINETIC, 1.0).submit();
				Impacts.debris(v.level, at, power, 6, 0.6, 0.6);
			}
			Combat.hurt(v.level, e, ModDamageTypes.source(v.level, WeaponType.GODFIST, owner, owner), v.damage);
			Fx.send(v.level, FxType.KINETIC, at, e.getDeltaMovement(), power * 1.5F, 0.0F, WeaponType.GODFIST.accent(), 160);
			Fx.sound(v.level, at, ModSounds.GODFIST_PUNCH, 3.0F, 0.9F);
		}
	}
}
