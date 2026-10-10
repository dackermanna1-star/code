package dev.overkill.block;

import com.mojang.serialization.MapCodec;
import dev.overkill.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

/**
 * Charred rubble left behind by the weapons. Freshly made ("hot") blocks glow faintly through
 * cracks, smoke and spit embers, then cool down over a few minutes.
 */
public class ScorchedStoneBlock extends Block {
	public static final MapCodec<ScorchedStoneBlock> CODEC = simpleCodec(ScorchedStoneBlock::new);
	public static final BooleanProperty HOT = BooleanProperty.create("hot");

	public ScorchedStoneBlock(BlockBehaviour.Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(HOT, false));
	}

	@Override
	public MapCodec<ScorchedStoneBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(HOT);
	}

	@Override
	protected boolean isRandomlyTicking(BlockState state) {
		return state.getValue(HOT);
	}

	@Override
	protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		if (state.getValue(HOT) && random.nextInt(3) == 0) {
			level.setBlock(pos, state.setValue(HOT, false), Block.UPDATE_ALL);
		}
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (!state.getValue(HOT) || !level.getBlockState(pos.above()).isAir()) {
			return;
		}
		double x = pos.getX() + random.nextDouble();
		double y = pos.getY() + 1.02;
		double z = pos.getZ() + random.nextDouble();
		if (random.nextInt(5) == 0) {
			level.addParticle(ParticleTypes.SMOKE, x, y, z, 0.0, 0.04, 0.0);
		}
		if (random.nextInt(18) == 0) {
			level.addParticle(ModParticles.HEAVY_SMOKE, x, y + 0.2, z, 0.0, 0.025, 0.0);
		}
		if (random.nextInt(9) == 0) {
			level.addParticle(ModParticles.EMBER, x, y, z, (random.nextDouble() - 0.5) * 0.02, 0.05, (random.nextDouble() - 0.5) * 0.02);
		}
	}
}
