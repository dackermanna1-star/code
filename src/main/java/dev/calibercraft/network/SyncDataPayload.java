package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.data.CaliberData;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server → client: definitions, the session's shot-seed salt and client-relevant server settings. */
public record SyncDataPayload(CaliberData data, long shotSalt, ServerSettings settings) implements CustomPacketPayload {
	public static final Type<SyncDataPayload> TYPE = new Type<>(CaliberCraft.id("sync_data"));
	public static final StreamCodec<ByteBuf, SyncDataPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.fromCodecTrusted(CaliberData.CODEC), SyncDataPayload::data,
		ByteBufCodecs.LONG, SyncDataPayload::shotSalt,
		ServerSettings.STREAM_CODEC, SyncDataPayload::settings,
		SyncDataPayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
