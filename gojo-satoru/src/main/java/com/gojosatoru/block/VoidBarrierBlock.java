package com.gojosatoru.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The starry wall of Infinite Void. It removes itself on a scheduled tick, so a domain that never got
 * the chance to close (server crash, unloaded chunk) still cleans up after itself.
 */
public class VoidBarrierBlock extends Block {
    public static final MapCodec<VoidBarrierBlock> CODEC = simpleCodec(VoidBarrierBlock::new);

    public VoidBarrierBlock(Properties properties) {
        super(properties);
    }

    @Override
    protected MapCodec<? extends Block> codec() {
        return CODEC;
    }

    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        level.removeBlock(pos, false);
    }
}
