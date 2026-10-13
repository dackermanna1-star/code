package dev.calibercraft.network;

import dev.calibercraft.config.ServerConfig;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/** Subset of the server config the client needs for prediction and UI. */
public record ServerSettings(String displayName, String fieldCustomization, boolean rareSkinsRequireKit, boolean infiniteAmmo,
		boolean infiniteAmmoCreative, boolean weaponHeat, boolean meleeBash) {
	public static final ServerSettings DEFAULT = from(new ServerConfig());

	public static final StreamCodec<ByteBuf, ServerSettings> STREAM_CODEC = StreamCodec.composite(
		ByteBufCodecs.STRING_UTF8, ServerSettings::displayName,
		ByteBufCodecs.STRING_UTF8, ServerSettings::fieldCustomization,
		ByteBufCodecs.BOOL, ServerSettings::rareSkinsRequireKit,
		ByteBufCodecs.BOOL, ServerSettings::infiniteAmmo,
		ByteBufCodecs.BOOL, ServerSettings::infiniteAmmoCreative,
		ByteBufCodecs.BOOL, ServerSettings::weaponHeat,
		ByteBufCodecs.BOOL, ServerSettings::meleeBash,
		ServerSettings::new);

	public static ServerSettings from(ServerConfig c) {
		return new ServerSettings(c.displayName, c.fieldCustomization, c.rareSkinsRequireKit, c.infiniteAmmo, c.infiniteAmmoCreative,
			c.weaponHeat, c.meleeBash);
	}
}
