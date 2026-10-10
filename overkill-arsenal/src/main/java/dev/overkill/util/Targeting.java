package dev.overkill.util;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.gamerules.GameRules;
import org.jspecify.annotations.Nullable;

/** Who the weapons are allowed to hurt, pull, launch or swallow. */
public final class Targeting {
	private Targeting() {
	}

	/** True if {@code attacker}'s weapon effects may affect {@code target} (damage, pulls, rifts...). */
	public static boolean canAffect(@Nullable Entity attacker, Entity target) {
		if (target == attacker || !target.isAlive() || target.isSpectator()) {
			return false;
		}
		if (target instanceof Player player && player.isCreative()) {
			return false;
		}
		if (target instanceof ArmorStand stand && stand.isMarker()) {
			return false;
		}
		if (attacker == null) {
			return true;
		}
		if (target.isAlliedTo(attacker) || target.isPassengerOfSameVehicle(attacker) || attacker.hasPassenger(target)) {
			return false;
		}
		if (target instanceof OwnableEntity ownable && ownable.getOwner() == attacker) {
			return false;
		}
		if (target instanceof Player && attacker instanceof Player && target.level() instanceof ServerLevel level) {
			return level.getGameRules().get(GameRules.PVP);
		}
		return true;
	}

	/** Like {@link #canAffect} but only for living things (things that can actually take a beating). */
	public static boolean canHurt(@Nullable Entity attacker, Entity target) {
		return target instanceof LivingEntity && canAffect(attacker, target);
	}
}
