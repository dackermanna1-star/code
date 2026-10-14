package net.abyssaldescent.client.fx;

import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.registry.ModSounds;
import net.abyssaldescent.world.DungeonDimension;
import net.minecraft.client.Minecraft;
import net.minecraft.core.Holder;
import net.minecraft.sounds.Music;
import net.minecraft.sounds.SoundEvent;
import org.jetbrains.annotations.Nullable;

/** Chooses the boss theme while a dungeon boss bar asks for music. */
public final class BossMusic {
	private static final Music FORGOTTEN_HALLS = music(ModSounds.MUSIC_FORGOTTEN_HALLS_BOSS);

	private BossMusic() {
	}

	private static Music music(Holder<SoundEvent> sound) {
		// No delay and replace whatever ambient track is playing: the theme must land with the boss bar.
		return new Music(sound, 0, 0, true);
	}

	@Nullable
	public static Music select(Minecraft minecraft) {
		if (minecraft.screen != null || minecraft.player == null || !AdConfig.get().client.bossMusic) {
			return null;
		}
		if (!DungeonDimension.isDungeon(minecraft.player.level()) || !minecraft.gui.getBossOverlay().shouldPlayMusic()) {
			return null;
		}
		// Only the Forgotten Halls is playable so far; later zones get their own themes as they are built.
		return FORGOTTEN_HALLS;
	}
}
