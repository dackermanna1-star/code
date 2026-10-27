package com.realweather.network;

import com.realweather.RealWeather;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * A purely visual lightning event chosen by the server so every player sees (and hears) the same storm:
 * either a far-away cloud-to-ground bolt or a flash inside the clouds. Real, damaging strikes still use vanilla
 * lightning entities.
 */
public record LightningPayload(double x, double y, double z, long seed, int kind, float intensity) implements CustomPacketPayload {
	public static final int KIND_CLOUD_FLASH = 0;
	public static final int KIND_DISTANT_BOLT = 1;

	public static final Type<LightningPayload> TYPE = new Type<>(RealWeather.id("lightning"));
	public static final StreamCodec<FriendlyByteBuf, LightningPayload> CODEC = CustomPacketPayload.codec(LightningPayload::write, LightningPayload::read);

	private static LightningPayload read(FriendlyByteBuf buf) {
		return new LightningPayload(buf.readDouble(), buf.readDouble(), buf.readDouble(), buf.readLong(), buf.readByte(), buf.readFloat());
	}

	private void write(FriendlyByteBuf buf) {
		buf.writeDouble(this.x);
		buf.writeDouble(this.y);
		buf.writeDouble(this.z);
		buf.writeLong(this.seed);
		buf.writeByte(this.kind);
		buf.writeFloat(this.intensity);
	}

	@Override
	public Type<LightningPayload> type() {
		return TYPE;
	}
}
