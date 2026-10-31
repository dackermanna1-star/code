package com.jjkshowdown.client.sound;

import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.render.DomainClientState;
import com.jjkshowdown.domain.DomainType;
import com.jjkshowdown.entity.boss.GojoBoss;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.registry.ModSounds;
import net.minecraft.client.Minecraft;
import net.minecraft.sounds.Music;
import net.minecraft.world.entity.Entity;
import org.jetbrains.annotations.Nullable;

/** Situational music: domain themes inside domains, rival themes near a live boss. */
public final class MusicController {
	private static final Music VOID = new Music(ModSounds.MUSIC_UNLIMITED_VOID, 0, 0, true);
	private static final Music SHRINE = new Music(ModSounds.MUSIC_MALEVOLENT_SHRINE, 0, 0, true);
	private static final Music BATTLE_GOJO = new Music(ModSounds.MUSIC_BATTLE_GOJO, 0, 0, true);
	private static final Music BATTLE_SUKUNA = new Music(ModSounds.MUSIC_BATTLE_SUKUNA, 0, 0, true);

	private MusicController() {
	}

	@Nullable
	public static Music situational() {
		Minecraft mc = Minecraft.getInstance();
		if (!ClientConfig.get().music || mc.player == null || mc.level == null) return null;
		DomainType d = DomainClientState.insideType(mc.player.position());
		if (d == DomainType.UNLIMITED_VOID) return VOID;
		if (d == DomainType.MALEVOLENT_SHRINE) return SHRINE;
		SorcererBoss nearest = null;
		double best = 56 * 56;
		for (Entity e : mc.level.entitiesForRendering()) {
			if (e instanceof SorcererBoss b && b.isAlive()) {
				double ds = b.distanceToSqr(mc.player);
				if (ds < best) {
					best = ds;
					nearest = b;
				}
			}
		}
		if (nearest != null) return nearest instanceof GojoBoss ? BATTLE_GOJO : BATTLE_SUKUNA;
		return null;
	}
}
