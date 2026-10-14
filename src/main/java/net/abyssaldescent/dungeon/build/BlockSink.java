package net.abyssaldescent.dungeon.build;

import java.util.function.Consumer;
import net.abyssaldescent.dungeon.layout.Box;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Write-only block target used by painters. Painters never read the world, so painting a room produces identical
 * results no matter which chunk is being generated; the sink silently drops writes outside its clip box.
 */
public interface BlockSink {
	BlockState AIR = Blocks.AIR.defaultBlockState();

	void set(int x, int y, int z, BlockState state);

	/** Configures the block entity at the position after placement (only if the position is inside the clip). */
	void configure(int x, int y, int z, Consumer<BlockEntity> configurer);

	/** Schedules a block tick for a freshly placed block (used by self-ticking traps). */
	void scheduleTick(int x, int y, int z, int delay);

	Box clip();

	default boolean inClip(int x, int y, int z) {
		return clip().contains(x, y, z);
	}

	default void set(BlockPos pos, BlockState state) {
		set(pos.getX(), pos.getY(), pos.getZ(), state);
	}

	default void fill(Box box, BlockState state) {
		Box c = clip();
		int x0 = Math.max(box.minX(), c.minX());
		int x1 = Math.min(box.maxX(), c.maxX());
		int y0 = Math.max(box.minY(), c.minY());
		int y1 = Math.min(box.maxY(), c.maxY());
		int z0 = Math.max(box.minZ(), c.minZ());
		int z1 = Math.min(box.maxZ(), c.maxZ());
		for (int x = x0; x <= x1; x++) {
			for (int z = z0; z <= z1; z++) {
				for (int y = y0; y <= y1; y++) {
					set(x, y, z, state);
				}
			}
		}
	}

	/** Iterates the intersection of {@code box} and the clip. */
	default void forEach(Box box, PosConsumer consumer) {
		Box c = clip();
		int x0 = Math.max(box.minX(), c.minX());
		int x1 = Math.min(box.maxX(), c.maxX());
		int y0 = Math.max(box.minY(), c.minY());
		int y1 = Math.min(box.maxY(), c.maxY());
		int z0 = Math.max(box.minZ(), c.minZ());
		int z1 = Math.min(box.maxZ(), c.maxZ());
		for (int x = x0; x <= x1; x++) {
			for (int z = z0; z <= z1; z++) {
				for (int y = y0; y <= y1; y++) {
					consumer.accept(x, y, z);
				}
			}
		}
	}

	@FunctionalInterface
	interface PosConsumer {
		void accept(int x, int y, int z);
	}
}
