package com.jjkshowdown.sorcerer;

import com.jjkshowdown.ability.AbilityHandler;
import com.jjkshowdown.cinematic.CinematicType;
import com.jjkshowdown.cinematic.Cinematics;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.Permissions;
import net.minecraft.sounds.SoundSource;

/** Character choice and first-join flow. */
public final class Characters {
	private Characters() {
	}

	public static void requestSelect(ServerPlayer player, CharacterType type) {
		SorcererData d = Sorcerers.data(player);
		if (d.character() == type) return;
		boolean op = player.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER);
		if (d.character().isSorcerer() && !JjkConfig.get().characters.allowSwitching && !op) {
			JjkNetwork.notify(player, Payloads.Notify.WARN, Component.translatable("message.jjkshowdown.switch_denied"), 0xFF6060);
			return;
		}
		set(player, type, true);
	}

	public static void set(ServerPlayer player, CharacterType type, boolean intro) {
		SorcererData d = Sorcerers.data(player);
		SorcererState s = Sorcerers.state(player);
		AbilityHandler.interrupt(player);
		s.resetCombat();
		SorcererStats.clearTransient(player);
		d.setCharacter(type);
		int start = JjkConfig.get().progression.startingMastery;
		if (type.isSorcerer() && d.mastery(type) < start) d.setMastery(type, start);
		d.prompted = true;
		SorcererStats.apply(player);
		CursedEnergy.fill(player);
		player.setHealth(player.getMaxHealth());
		s.dirty = s.visualDirty = true;
		if (!type.isSorcerer()) {
			JjkNetwork.notify(player, Payloads.Notify.INFO, Component.translatable("message.jjkshowdown.character_cleared"), 0xFFFFFF);
			return;
		}
		player.level().playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.UI_SELECT, SoundSource.PLAYERS, 1.0f, 1.0f);
		JjkNetwork.notify(player, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.became", type.displayName()), type.energyColor);
		if (intro) {
			Cinematics.play(player.level(), CinematicType.CHARACTER_INTRO, player, null, null);
			JjkNetwork.voice(player, type == CharacterType.GOJO ? VoiceLine.GOJO_SELECT : VoiceLine.SUKUNA_SELECT);
		}
	}

	public static void onJoin(ServerPlayer player) {
		SorcererData d = Sorcerers.data(player);
		SorcererStats.apply(player);
		Sorcerers.state(player).dirty = true;
		Sorcerers.state(player).visualDirty = true;
		JjkNetwork.sendConfig(player);
		if (JjkConfig.get().characters.promptOnFirstJoin && !d.prompted && !d.character().isSorcerer()) {
			d.prompted = true;
			JjkNetwork.send(player, new Payloads.OpenSelection(true));
		}
	}
}
