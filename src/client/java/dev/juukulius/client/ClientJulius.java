package dev.juukulius.client;

import dev.juukulius.character.JuliusAppearance;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.character.JuliusStats;
import dev.juukulius.client.anim.ClientClock;
import dev.juukulius.combat.Ability;
import dev.juukulius.combat.CombatRules;
import dev.juukulius.spirit.Spirit;
import java.util.Arrays;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;
import org.jspecify.annotations.Nullable;

/**
 * The local player's view of Julius state: synced values from the server plus short-lived predictions (selection, mana
 * spent, cooldowns started) so the HUD reacts instantly and never flickers back while waiting for the server.
 */
public final class ClientJulius {
	private static int predictedSpirit = -1;
	private static long predictedSpiritUntil;
	private static float manaSpentPrediction;
	private static @Nullable JuliusStats lastStats;
	private static final long[] localCooldownEnd = new long[Ability.COUNT];
	private static final int[] localCooldownLength = new int[Ability.COUNT];
	private static @Nullable Component message;
	private static int messageTicks;
	private static int deniedFlashTicks;

	private ClientJulius() {
	}

	public static @Nullable Player player() {
		return Minecraft.getInstance().player;
	}

	public static JuliusAppearance appearance() {
		Player player = player();
		return player != null ? JuliusAttachments.appearance(player) : JuliusAppearance.NONE;
	}

	public static JuliusStats stats() {
		Player player = player();
		return player != null ? JuliusAttachments.stats(player) : JuliusStats.EMPTY;
	}

	public static boolean transformed() {
		return appearance().transformed();
	}

	public static boolean ultimateActive() {
		Player player = player();
		return player != null && appearance().ultimateActive(player.level().getGameTime());
	}

	public static float mana() {
		return Math.max(0.0F, stats().mana() - manaSpentPrediction);
	}

	public static int cooldown(Ability ability) {
		long local = localCooldownEnd[ability.ordinal()] - ClientClock.ticks();
		return (int) Math.max(stats().cooldown(ability), local);
	}

	/** Full length of the most recent cooldown, for the HUD sweep. */
	public static int cooldownLength(Ability ability) {
		int length = localCooldownLength[ability.ordinal()];
		return length > 0 ? length : CombatRules.cooldown(ability);
	}

	public static Spirit selectedSpirit() {
		if (predictedSpirit >= 0 && ClientClock.ticks() < predictedSpiritUntil) {
			if (appearance().selectedSpirit() == predictedSpirit) {
				predictedSpirit = -1;
			} else {
				return Spirit.byIndex(predictedSpirit);
			}
		}

		return Spirit.byIndex(appearance().selectedSpirit());
	}

	public static void predictSpirit(int index) {
		predictedSpirit = Spirit.byIndex(index).ordinal();
		predictedSpiritUntil = ClientClock.ticks() + 20;
	}

	public static void predictUse(Ability ability, float cost) {
		manaSpentPrediction += cost;
		int cooldown = CombatRules.cooldown(ability);
		localCooldownEnd[ability.ordinal()] = ClientClock.ticks() + cooldown + 2;
		localCooldownLength[ability.ordinal()] = cooldown;
	}

	public static void undoPrediction(Ability ability, float cost) {
		manaSpentPrediction = Math.max(0.0F, manaSpentPrediction - cost);
		localCooldownEnd[ability.ordinal()] = 0L;
	}

	public static void showMessage(Component text, boolean denied) {
		message = text;
		messageTicks = 40;
		if (denied) {
			deniedFlashTicks = 8;
		}
	}

	public static @Nullable Component message() {
		return messageTicks > 0 ? message : null;
	}

	public static float messageAlpha(float partialTick) {
		return Math.min(1.0F, (messageTicks - partialTick) / 10.0F);
	}

	public static float deniedFlash(float partialTick) {
		return Math.max(0.0F, (deniedFlashTicks - partialTick) / 8.0F);
	}

	public static void tick() {
		JuliusStats stats = stats();
		if (stats != lastStats) {
			lastStats = stats;
			manaSpentPrediction = 0.0F;
		}

		if (messageTicks > 0) {
			messageTicks--;
		}

		if (deniedFlashTicks > 0) {
			deniedFlashTicks--;
		}
	}

	public static void reset() {
		predictedSpirit = -1;
		manaSpentPrediction = 0.0F;
		lastStats = null;
		Arrays.fill(localCooldownEnd, 0L);
		messageTicks = 0;
	}
}
