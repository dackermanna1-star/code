package com.realweather.client.particle;

import com.realweather.RealWeather;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.data.AtlasIds;

/**
 * Looks up RealWeather's sprites in the vanilla particle atlas. The atlas stitches every PNG under
 * {@code textures/particle/} of every namespace, so no particle types need to be registered (which keeps the mod
 * free of registry entries and therefore compatible with servers and clients that do not have it).
 */
public final class ParticleSprites {
	private ParticleSprites() {
	}

	public static TextureAtlasSprite get(String name) {
		return Minecraft.getInstance().getAtlasManager().getAtlasOrThrow(AtlasIds.PARTICLES).getSprite(RealWeather.id(name));
	}

	public static TextureAtlasSprite get(String prefix, int index) {
		return get(prefix + "_" + index);
	}
}
