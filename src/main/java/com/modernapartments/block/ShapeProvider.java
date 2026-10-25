package com.modernapartments.block;

import java.util.IdentityHashMap;
import java.util.Map;
import java.util.function.Function;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Resolves (and caches per block state) the generated furniture shape for a block. Resolution is lazy
 * because the block id is only known once the block is registered.
 */
public final class ShapeProvider {
	private final Block block;
	private final Function<BlockState, String> key;
	private final Function<BlockState, Direction> facing;
	private volatile Map<BlockState, VoxelShape> cache;

	public ShapeProvider(Block block, Function<BlockState, String> key, Function<BlockState, Direction> facing) {
		this.block = block;
		this.key = key;
		this.facing = facing;
	}

	public VoxelShape get(BlockState state) {
		Map<BlockState, VoxelShape> map = cache;
		if (map == null) {
			synchronized (this) {
				map = cache;
				if (map == null) {
					map = new IdentityHashMap<>();
					String id = BuiltInRegistries.BLOCK.getKey(block).getPath();
					for (BlockState s : block.getStateDefinition().getPossibleStates()) {
						map.put(s, FurnitureShapes.get(id, key.apply(s), facing.apply(s)));
					}
					cache = map;
				}
			}
		}
		return map.get(state);
	}
}
