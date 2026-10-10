package com.blademode.piece;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import java.util.List;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.world.phys.Vec3;

/**
 * Immutable description of a piece: its blocks and where the block grid sits relative to the
 * piece's centre of mass. A block at cell {@code c} occupies {@code [c + gridOffset, c + gridOffset + 1]}
 * in the piece's local (body) frame, whose origin is the centre of mass.
 *
 * <p>Instances are compared by identity on purpose (entity data only re-syncs on a new instance).
 */
public final class PieceData {
	public static final PieceData EMPTY = new PieceData(List.of(), Vec3.ZERO);

	public static final Codec<PieceData> CODEC = RecordCodecBuilder.create(i -> i.group(
		PieceBlock.CODEC.listOf().fieldOf("blocks").forGetter(PieceData::blocks),
		Vec3.CODEC.fieldOf("grid_offset").forGetter(PieceData::gridOffset)
	).apply(i, PieceData::new));

	public static final StreamCodec<ByteBuf, PieceData> STREAM_CODEC = StreamCodec.composite(
		PieceBlock.STREAM_CODEC.apply(ByteBufCodecs.list()), PieceData::blocks,
		StreamCodec.composite(ByteBufCodecs.DOUBLE, Vec3::x, ByteBufCodecs.DOUBLE, Vec3::y, ByteBufCodecs.DOUBLE, Vec3::z, Vec3::new), PieceData::gridOffset,
		PieceData::new);

	private final List<PieceBlock> blocks;
	private final Vec3 gridOffset;

	public PieceData(List<PieceBlock> blocks, Vec3 gridOffset) {
		this.blocks = List.copyOf(blocks);
		this.gridOffset = gridOffset;
	}

	public List<PieceBlock> blocks() {
		return this.blocks;
	}

	public Vec3 gridOffset() {
		return this.gridOffset;
	}

	public boolean isEmpty() {
		return this.blocks.isEmpty();
	}
}
