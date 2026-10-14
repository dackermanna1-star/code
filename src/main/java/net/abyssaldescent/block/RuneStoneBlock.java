package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import net.abyssaldescent.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/** Carved tuff with softly pulsing runes; purely atmospheric. */
public class RuneStoneBlock extends Block {
	public static final MapCodec<RuneStoneBlock> CODEC = simpleCodec(RuneStoneBlock::new);

	public RuneStoneBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (random.nextInt(6) == 0) {
			level.addParticle(ModParticles.RUNE_GLYPH, pos.getX() + random.nextDouble(), pos.getY() + 1.05, pos.getZ() + random.nextDouble(), 0.0, 0.015, 0.0);
		}
	}
}
