package com.modernapartments.build;

import net.minecraft.core.HolderLookup;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.entity.BlockEntity;

/**
 * Deferred block-entity setup (sign text, loot tables, unit labels) applied after a block is placed. It must not
 * rely on the block entity's level: during world generation the block entity is not attached to one yet.
 */
@FunctionalInterface
public interface BlockEntityInit {
	void apply(BlockEntity blockEntity, HolderLookup.Provider registries, RandomSource random);
}
