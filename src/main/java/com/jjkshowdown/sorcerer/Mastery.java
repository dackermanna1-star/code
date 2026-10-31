package com.jjkshowdown.sorcerer;

import com.jjkshowdown.ability.Abilities;
import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModSounds;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

/** Mastery levels 1..10: XP curve, unlocks and power scaling. */
public final class Mastery {
	private Mastery() {
	}

	/** XP required to go from {@code level} to {@code level + 1}. */
	public static float xpToNext(int level) {
		if (level >= SorcererData.MAX_MASTERY) return 0;
		return (float) (80.0 * Math.pow(level, 1.5));
	}

	/** Effective mastery used for power/unlock checks (creative and UNLOCKED mode count as max). */
	public static int effective(LivingEntity e) {
		JjkConfig cfg = JjkConfig.get();
		if (cfg.progressionUnlocked()) return SorcererData.MAX_MASTERY;
		if (e instanceof Player p && p.isCreative() && cfg.progression.creativeUnlocksAll) return SorcererData.MAX_MASTERY;
		if (!(e instanceof Player)) return SorcererData.MAX_MASTERY; // bosses are fully realised
		return Sorcerers.data(e).mastery();
	}

	public static boolean isUnlocked(LivingEntity e, Ability ability) {
		return effective(e) >= ability.unlockLevel;
	}

	/** Generic damage scaling from mastery (+6% per level) and Sukuna's fingers (+2.5% each). */
	public static float powerMultiplier(LivingEntity e) {
		SorcererData d = Sorcerers.data(e);
		float m = 1.0f + 0.06f * (effective(e) - 1);
		if (d.character() == CharacterType.SUKUNA) m *= 1.0f + 0.025f * d.fingers();
		return m;
	}

	public static void addXp(LivingEntity e, float amount) {
		if (!(e instanceof ServerPlayer player) || amount <= 0) return;
		SorcererData d = Sorcerers.data(player);
		CharacterType c = d.character();
		if (!c.isSorcerer()) return;
		int level = d.mastery(c);
		if (level >= SorcererData.MAX_MASTERY) return;
		float xp = d.xp(c) + amount * JjkConfig.get().progression.xpMultiplier;
		boolean leveled = false;
		while (level < SorcererData.MAX_MASTERY && xp >= xpToNext(level)) {
			xp -= xpToNext(level);
			level++;
			leveled = true;
			announceLevel(player, c, level);
		}
		if (level >= SorcererData.MAX_MASTERY) xp = 0;
		d.setMastery(c, level);
		d.setXp(c, xp);
		Sorcerers.state(player).dirty = true;
		if (leveled) SorcererStats.apply(player);
	}

	private static void announceLevel(ServerPlayer player, CharacterType c, int level) {
		JjkNetwork.notify(player, Payloads.Notify.LEVEL_UP, Component.translatable("message.jjkshowdown.level_up", level), c.energyColor);
		player.level().playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.LEVEL_UP, SoundSource.PLAYERS, 0.9f, 1.0f);
		for (Ability a : Abilities.forCharacter(c)) {
			if (a.unlockLevel == level) {
				JjkNetwork.notify(player, Payloads.Notify.UNLOCK, Component.translatable("message.jjkshowdown.unlocked", a.displayName()), c.accentColor);
			}
		}
	}
}
