package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import net.abyssaldescent.dungeon.run.RunManager;
import net.abyssaldescent.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
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

/** Risk/reward shrine: grants a powerful relic or weapon at the cost of a curse that lasts until the expedition ends. */
public class CursedIdolBlock extends HorizontalDirectionalBlock {
	public static final MapCodec<CursedIdolBlock> CODEC = simpleCodec(CursedIdolBlock::new);
	public static final BooleanProperty USED = BooleanProperty.create("used");
	private static final VoxelShape SHAPE = Shapes.or(Block.box(2, 0, 2, 14, 3, 14), Block.box(4, 3, 4, 12, 16, 12));

	public CursedIdolBlock(Properties properties) {
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
			return InteractionResult.PASS;
		}
		if (level instanceof ServerLevel serverLevel && player instanceof ServerPlayer serverPlayer) {
			if (RunManager.get(serverLevel.getServer()).useCursedIdol(serverPlayer, pos)) {
				level.setBlock(pos, state.setValue(USED, true), Block.UPDATE_ALL);
			}
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (!state.getValue(USED) && random.nextInt(3) == 0) {
			level.addParticle(ModParticles.CURSE_MOTE, pos.getX() + 0.5 + (random.nextDouble() - 0.5) * 0.8, pos.getY() + 0.5 + random.nextDouble() * 0.8,
				pos.getZ() + 0.5 + (random.nextDouble() - 0.5) * 0.8, 0.0, 0.01, 0.0);
		}
	}
}
