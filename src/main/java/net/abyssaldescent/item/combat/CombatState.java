package net.abyssaldescent.item.combat;

import java.util.Map;
import java.util.UUID;
import java.util.WeakHashMap;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.player.Player;

/**
 * Snapshot of the player's swing taken just before vanilla resets the attack-strength ticker, so weapon effects can
 * require a fully charged swing (spam-clicking never procs anything).
 */
public final class CombatState {
	private record Swing(float charge, boolean crit) {
	}

	private static final Map<UUID, Swing> LAST = new WeakHashMap<>();

	private CombatState() {
	}

	public static void capture(Player player) {
		float charge = player.getAttackStrengthScale(0.5F);
		boolean crit = charge > 0.9F && player.fallDistance > 0.0 && !player.onGround() && !player.onClimbable() && !player.isInWater()
			&& !player.hasEffect(MobEffects.BLINDNESS) && !player.isPassenger() && !player.isSprinting();
		LAST.put(player.getUUID(), new Swing(charge, crit));
	}

	public static float lastCharge(Player player) {
		Swing swing = LAST.get(player.getUUID());
		return swing == null ? 1.0F : swing.charge();
	}

	public static boolean lastCrit(Player player) {
		Swing swing = LAST.get(player.getUUID());
		return swing != null && swing.crit();
	}
}
