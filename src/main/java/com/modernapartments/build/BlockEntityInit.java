package com.modernapartments.build;

import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.entity.BlockEntity;

/** Deferred block-entity setup (sign text, loot tables, unit labels) applied after a block is placed. */
@FunctionalInterface
public interface BlockEntityInit {
	void apply(BlockEntity blockEntity, RandomSource random);
}
