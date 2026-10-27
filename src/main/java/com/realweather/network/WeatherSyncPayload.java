package com.realweather.network;

import com.realweather.RealWeather;
import com.realweather.weather.WeatherState;
import com.realweather.weather.WeatherType;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Snapshot of the server's weather simulation. Sent periodically and whenever something changes; clients
 * interpolate towards it so motion stays smooth between packets.
 */
public record WeatherSyncPayload(
	int typeOrdinal,
	boolean dynamic,
	int remainingTicks,
	float intensity,
	float cloudCover,
	float precipitation,
	float storm,
	float coldSnap,
	float fog,
	float windSpeed,
	float windDirection,
	float gustiness,
	long seed,
	long simTicks,
	double cloudOffsetX,
	double cloudOffsetZ,
	float coldSnapStrength,
	boolean snap
) implements CustomPacketPayload {
	public static final Type<WeatherSyncPayload> TYPE = new Type<>(RealWeather.id("weather_sync"));
	public static final StreamCodec<FriendlyByteBuf, WeatherSyncPayload> CODEC = CustomPacketPayload.codec(WeatherSyncPayload::write, WeatherSyncPayload::read);

	public static WeatherSyncPayload of(WeatherState state, float coldSnapStrength, boolean snap) {
		return new WeatherSyncPayload(
			state.type.ordinal(),
			state.dynamic,
			state.remainingTicks,
			state.effectiveIntensity(),
			state.cloudCover,
			state.precipitation,
			state.storm,
			state.coldSnap,
			state.fog,
			state.windSpeed,
			state.windDirection,
			state.gustiness,
			state.seed,
			state.simTicks,
			state.cloudOffsetX,
			state.cloudOffsetZ,
			coldSnapStrength,
			snap
		);
	}

	public WeatherType weatherType() {
		return WeatherType.byOrdinal(this.typeOrdinal);
	}

	private static WeatherSyncPayload read(FriendlyByteBuf buf) {
		return new WeatherSyncPayload(
			buf.readVarInt(),
			buf.readBoolean(),
			buf.readVarInt(),
			buf.readFloat(),
			buf.readFloat(),
			buf.readFloat(),
			buf.readFloat(),
			buf.readFloat(),
			buf.readFloat(),
			buf.readFloat(),
			buf.readFloat(),
			buf.readFloat(),
			buf.readLong(),
			buf.readVarLong(),
			buf.readDouble(),
			buf.readDouble(),
			buf.readFloat(),
			buf.readBoolean()
		);
	}

	private void write(FriendlyByteBuf buf) {
		buf.writeVarInt(this.typeOrdinal);
		buf.writeBoolean(this.dynamic);
		buf.writeVarInt(Math.max(0, this.remainingTicks));
		buf.writeFloat(this.intensity);
		buf.writeFloat(this.cloudCover);
		buf.writeFloat(this.precipitation);
		buf.writeFloat(this.storm);
		buf.writeFloat(this.coldSnap);
		buf.writeFloat(this.fog);
		buf.writeFloat(this.windSpeed);
		buf.writeFloat(this.windDirection);
		buf.writeFloat(this.gustiness);
		buf.writeLong(this.seed);
		buf.writeVarLong(Math.max(0L, this.simTicks));
		buf.writeDouble(this.cloudOffsetX);
		buf.writeDouble(this.cloudOffsetZ);
		buf.writeFloat(this.coldSnapStrength);
		buf.writeBoolean(this.snap);
	}

	@Override
	public Type<WeatherSyncPayload> type() {
		return TYPE;
	}
}
