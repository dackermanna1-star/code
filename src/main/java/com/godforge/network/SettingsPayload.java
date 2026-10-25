package com.godforge.network;

import com.godforge.Godforge;
import com.godforge.weapon.WeaponSettings;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Client -> server: apply new settings to the weapon held in the given hand (0 = main, 1 = off hand). */
public record SettingsPayload(int hand, WeaponSettings settings) implements CustomPacketPayload {
	public static final CustomPacketPayload.Type<SettingsPayload> TYPE = new CustomPacketPayload.Type<>(Godforge.id("settings"));
	public static final StreamCodec<RegistryFriendlyByteBuf, SettingsPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, SettingsPayload::hand,
		WeaponSettings.STREAM_CODEC, SettingsPayload::settings,
		SettingsPayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
