package net.earthscapes.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/** A woody climbing liana that hangs from rainforest branches in long ropes. */
public class LianaBlock extends Block {
	public static final MapCodec<LianaBlock> CODEC = simpleCodec(LianaBlock::new);
	public static final BooleanProperty TIP = BooleanProperty.create("tip");
	private static final VoxelShape SHAPE = Block.column(8.0, 0.0, 16.0);

	public LianaBlock(Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(TIP, true));
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPE;
	}

	public static boolean canHangFrom(BlockState above, LevelReader level, BlockPos abovePos) {
		return above.getBlock() instanceof LianaBlock
			|| above.is(BlockTags.LOGS)
			|| above.is(BlockTags.LEAVES)
			|| above.isFaceSturdy(level, abovePos, Direction.DOWN);
	}

	@Override
	protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
		return canHangFrom(level.getBlockState(pos.above()), level, pos.above());
	}

	@Nullable
	@Override
	public BlockState getStateForPlacement(BlockPlaceContext context) {
		BlockState below = context.getLevel().getBlockState(context.getClickedPos().below());
		return this.defaultBlockState().setValue(TIP, !(below.getBlock() instanceof LianaBlock));
	}

	@Override
	protected BlockState updateShape(
		BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction, BlockPos neighborPos, BlockState neighbor, RandomSource random
	) {
		if (direction == Direction.UP && !state.canSurvive(level, pos)) {
			ticks.scheduleTick(pos, this, 1);
		}
		if (direction == Direction.DOWN) {
			return state.setValue(TIP, !(neighbor.getBlock() instanceof LianaBlock));
		}
		return super.updateShape(state, level, ticks, pos, direction, neighborPos, neighbor, random);
	}

	@Override
	protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		if (!state.canSurvive(level, pos)) {
			level.destroyBlock(pos, true);
		}
	}

	@Override
	protected boolean propagatesSkylightDown(BlockState state) {
		return true;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(TIP);
	}
}
