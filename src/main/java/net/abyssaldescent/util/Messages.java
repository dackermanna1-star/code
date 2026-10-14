package net.abyssaldescent.util;

import java.util.Collection;
import net.minecraft.network.chat.Component;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;

/** Small helpers for player-facing feedback (titles, action bar, private sounds). */
public final class Messages {
	private Messages() {
	}

	public static void title(ServerPlayer player, Component title, Component subtitle, int fadeIn, int stay, int fadeOut) {
		player.connection.send(new ClientboundSetTitlesAnimationPacket(fadeIn, stay, fadeOut));
		player.connection.send(new ClientboundSetSubtitleTextPacket(subtitle));
		player.connection.send(new ClientboundSetTitleTextPacket(title));
	}

	public static void actionBar(ServerPlayer player, Component message) {
		player.displayClientMessage(message, true);
	}

	public static void actionBar(Collection<ServerPlayer> players, Component message) {
		for (ServerPlayer player : players) {
			player.displayClientMessage(message, true);
		}
	}

	public static void chat(Collection<ServerPlayer> players, Component message) {
		for (ServerPlayer player : players) {
			player.sendSystemMessage(message);
		}
	}

	/** Plays a sound only this player hears, at their position. */
	public static void privateSound(ServerPlayer player, SoundEvent sound, float volume, float pitch) {
		player.connection.send(new ClientboundSoundPacket(BuiltInRegistries.SOUND_EVENT.wrapAsHolder(sound), SoundSource.MASTER, player.getX(),
			player.getEyeY(), player.getZ(), volume, pitch, player.getRandom().nextLong()));
	}
}
