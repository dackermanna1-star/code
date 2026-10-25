package com.godforge.network;

import com.godforge.Godforge;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server -> client: play an effect preset (see {@link FxType}). */
public record FxPayload(int kind, double x, double y, double z, float vx, float vy, float vz, float a, float b, int color, int seed)
	implements CustomPacketPayload {
	public static final CustomPacketPayload.Type<FxPayload> TYPE = new CustomPacketPayload.Type<>(Godforge.id("fx"));
	public static final StreamCodec<RegistryFriendlyByteBuf, FxPayload> CODEC = StreamCodec.of(
		(buf, p) -> {
			buf.writeVarInt(p.kind);
			buf.writeDouble(p.x);
			buf.writeDouble(p.y);
			buf.writeDouble(p.z);
			buf.writeFloat(p.vx);
			buf.writeFloat(p.vy);
			buf.writeFloat(p.vz);
			buf.writeFloat(p.a);
			buf.writeFloat(p.b);
			buf.writeInt(p.color);
			buf.writeInt(p.seed);
		},
		buf -> new FxPayload(
			buf.readVarInt(), buf.readDouble(), buf.readDouble(), buf.readDouble(), buf.readFloat(), buf.readFloat(), buf.readFloat(),
			buf.readFloat(), buf.readFloat(), buf.readInt(), buf.readInt()
		)
	);

	public FxType fx() {
		return FxType.byId(this.kind);
	}

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
