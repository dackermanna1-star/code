package net.abyssaldescent.dungeon.build;

import java.util.function.Consumer;
import net.abyssaldescent.dungeon.layout.Box;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** A {@link BlockSink} writing into the chunk currently being decorated. */
public final class ClippedSink implements BlockSink {
	private static final int FLAGS = Block.UPDATE_CLIENTS;
	private final WorldGenLevel level;
	private final Box clip;
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();

	public ClippedSink(WorldGenLevel level, Box clip) {
		this.level = level;
		this.clip = clip;
	}

	@Override
	public void set(int x, int y, int z, BlockState state) {
		if (clip.contains(x, y, z)) {
			level.setBlock(cursor.set(x, y, z), state, FLAGS);
		}
	}

	@Override
	public void configure(int x, int y, int z, Consumer<BlockEntity> configurer) {
		if (clip.contains(x, y, z)) {
			BlockEntity be = level.getBlockEntity(cursor.set(x, y, z));
			if (be != null) {
				configurer.accept(be);
			}
		}
	}

	@Override
	public void scheduleTick(int x, int y, int z, int delay) {
		if (clip.contains(x, y, z)) {
			BlockPos pos = new BlockPos(x, y, z);
			level.scheduleTick(pos, level.getBlockState(pos).getBlock(), delay);
		}
	}

	@Override
	public Box clip() {
		return clip;
	}
}
