package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import net.abyssaldescent.dungeon.run.RunManager;
import net.abyssaldescent.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jetbrains.annotations.Nullable;

/** Optional challenge: offering blood at the altar summons an elite wave, and conquering it yields elite-tier loot. */
public class AltarOfTrialsBlock extends HorizontalDirectionalBlock {
	public static final MapCodec<AltarOfTrialsBlock> CODEC = simpleCodec(AltarOfTrialsBlock::new);
	public static final BooleanProperty USED = BooleanProperty.create("used");
	private static final VoxelShape SHAPE = Shapes.or(Block.box(1, 0, 1, 15, 4, 15), Block.box(3, 4, 3, 13, 11, 13), Block.box(1, 11, 1, 15, 14, 15));

	public AltarOfTrialsBlock(Properties properties) {
		super(properties);
		registerDefaultState(stateDefinition.any().setValue(FACING, Direction.SOUTH).setValue(USED, false));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(FACING, USED);
	}

	@Override
	public @Nullable BlockState getStateForPlacement(BlockPlaceContext context) {
		return defaultBlockState().setValue(FACING, context.getHorizontalDirection().getOpposite());
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPE;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (state.getValue(USED)) {
			// Still consumes the click: passing would let vanilla place the held block against the altar.
			return InteractionResult.CONSUME;
		}
		if (level instanceof ServerLevel serverLevel && player instanceof ServerPlayer serverPlayer) {
			if (RunManager.get(serverLevel.getServer()).useAltarOfTrials(serverPlayer, pos)) {
				level.setBlock(pos, state.setValue(USED, true), Block.UPDATE_ALL);
			}
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (state.getValue(USED)) {
			if (random.nextInt(4) == 0) {
				level.addParticle(ParticleTypes.SMOKE, pos.getX() + 0.5, pos.getY() + 0.95, pos.getZ() + 0.5, 0.0, 0.02, 0.0);
			}
			return;
		}
		if (random.nextInt(2) == 0) {
			level.addParticle(ModParticles.BLOOD_MOTE, pos.getX() + 0.25 + random.nextDouble() * 0.5, pos.getY() + 0.9,
				pos.getZ() + 0.25 + random.nextDouble() * 0.5, 0.0, 0.03, 0.0);
		}
	}
}
