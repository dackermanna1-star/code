package com.blademode.piece;

import com.blademode.geom.Plane;
import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/**
 * One block (or cut fragment of a block) carried by a piece.
 *
 * @param pos         integer cell coordinates inside the piece grid
 * @param state       the original block state
 * @param planes      cut planes in block-local coordinates (empty = whole block)
 * @param blockEntity saved block entity data (server only; never sent to clients)
 */
public record PieceBlock(BlockPos pos, BlockState state, List<Plane> planes, Optional<CompoundTag> blockEntity) {
	public static final Codec<PieceBlock> CODEC = RecordCodecBuilder.create(i -> i.group(
		BlockPos.CODEC.fieldOf("pos").forGetter(PieceBlock::pos),
		BlockState.CODEC.fieldOf("state").forGetter(PieceBlock::state),
		Plane.CODEC.listOf().optionalFieldOf("planes", List.of()).forGetter(PieceBlock::planes),
		CompoundTag.CODEC.optionalFieldOf("block_entity").forGetter(PieceBlock::blockEntity)
	).apply(i, PieceBlock::new));

	/** Network form: block entity data is deliberately not synced. */
	public static final StreamCodec<ByteBuf, PieceBlock> STREAM_CODEC = StreamCodec.composite(
		BlockPos.STREAM_CODEC, PieceBlock::pos,
		ByteBufCodecs.idMapper(Block.BLOCK_STATE_REGISTRY), PieceBlock::state,
		Plane.STREAM_CODEC.apply(ByteBufCodecs.list()), PieceBlock::planes,
		(pos, state, planes) -> new PieceBlock(pos, state, planes, Optional.empty()));

	public PieceBlock {
		planes = List.copyOf(planes);
	}

	public boolean isCut() {
		return !this.planes.isEmpty();
	}

	public PieceBlock withPos(BlockPos newPos) {
		return new PieceBlock(newPos, this.state, this.planes, this.blockEntity);
	}

	public PieceBlock withPlanes(List<Plane> newPlanes) {
		return new PieceBlock(this.pos, this.state, newPlanes, this.blockEntity);
	}
}
