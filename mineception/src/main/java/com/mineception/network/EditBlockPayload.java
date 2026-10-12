package com.mineception.network;

import com.mineception.Mineception;
import io.netty.buffer.ByteBuf;
import net.minecraft.core.BlockPos;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Client to server: a player broke or placed a block inside one of a laptop's dream levels.
 *
 * @param pos   the real-world laptop block
 * @param depth dream level, 1..4
 * @param index cell index within the level ({@link com.mineception.dream.MiniWorld#index})
 * @param block new block id ({@link com.mineception.dream.MiniBlock#id}); 0 means the block was broken
 */
public record EditBlockPayload(BlockPos pos, int depth, int index, int block) implements CustomPacketPayload {
	public static final Type<EditBlockPayload> TYPE = new Type<>(Mineception.id("edit_block"));
	public static final StreamCodec<ByteBuf, EditBlockPayload> CODEC = StreamCodec.composite(
		BlockPos.STREAM_CODEC, EditBlockPayload::pos,
		ByteBufCodecs.VAR_INT, EditBlockPayload::depth,
		ByteBufCodecs.VAR_INT, EditBlockPayload::index,
		ByteBufCodecs.VAR_INT, EditBlockPayload::block,
		EditBlockPayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
