package com.laptopcraft.block.decor;

import com.mojang.serialization.MapCodec;
import java.util.Locale;
import java.util.Map;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.level.pathfinder.PathComputationType;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * A two-block-tall arcade cabinet running "Creeper Invaders" (animated, glowing screen). Click either half to play a
 * round: chiptune bleeps, particles and a random result in the action bar. Door-style half handling.
 */
public class ArcadeCabinetBlock extends HorizontalDirectionalBlock {
	public static final MapCodec<ArcadeCabinetBlock> CODEC = simpleCodec(ArcadeCabinetBlock::new);
	public static final EnumProperty<DoubleBlockHalf> HALF = BlockStateProperties.DOUBLE_BLOCK_HALF;
	public static final int RESULTS = 8;
	private static final Map<Direction, VoxelShape> LOWER = Shapes.rotateHorizontal(Shapes.or(Block.box(2, 0, 4, 14, 16, 15), Block.box(2, 13, 1, 14, 16, 4)));
	private static final Map<Direction, VoxelShape> UPPER = Shapes.rotateHorizontal(Block.box(2, 0, 2.5, 14, 16, 15));

	public ArcadeCabinetBlock(BlockBehaviour.Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(FACING, Direction.NORTH).setValue(HALF, DoubleBlockHalf.LOWER));
	}

	@Override
	protected MapCodec<? extends ArcadeCabinetBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(FACING, HALF);
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return (state.getValue(HALF) == DoubleBlockHalf.LOWER ? LOWER : UPPER).get(state.getValue(FACING));
	}

	@Override
	public @Nullable BlockState getStateForPlacement(BlockPlaceContext context) {
		BlockPos pos = context.getClickedPos();
		Level level = context.getLevel();
		if (pos.getY() >= level.getMaxY() || !level.getBlockState(pos.above()).canBeReplaced(context)) {
			return null;
		}
		return this.defaultBlockState().setValue(FACING, context.getHorizontalDirection().getOpposite()).setValue(HALF, DoubleBlockHalf.LOWER);
	}

	@Override
	public void setPlacedBy(Level level, BlockPos pos, BlockState state, @Nullable LivingEntity placer, ItemStack stack) {
		level.setBlock(pos.above(), state.setValue(HALF, DoubleBlockHalf.UPPER), Block.UPDATE_ALL);
	}

	@Override
	protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess scheduledTickAccess, BlockPos pos,
			Direction direction, BlockPos neighborPos, BlockState neighborState, RandomSource random) {
		DoubleBlockHalf half = state.getValue(HALF);
		if (direction.getAxis() == Direction.Axis.Y && (half == DoubleBlockHalf.LOWER) == (direction == Direction.UP)) {
			// the other half must be this cabinet's matching half
			return neighborState.is(this) && neighborState.getValue(HALF) != half
					? state.setValue(FACING, neighborState.getValue(FACING))
					: Blocks.AIR.defaultBlockState();
		}
		return super.updateShape(state, level, scheduledTickAccess, pos, direction, neighborPos, neighborState, random);
	}

	@Override
	public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
		if (!level.isClientSide() && player.preventsBlockDrops() && state.getValue(HALF) == DoubleBlockHalf.UPPER) {
			// creative: breaking the top must not make the bottom half drop an item
			BlockPos below = pos.below();
			BlockState lower = level.getBlockState(below);
			if (lower.is(this) && lower.getValue(HALF) == DoubleBlockHalf.LOWER) {
				level.setBlock(below, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL | Block.UPDATE_SUPPRESS_DROPS);
				level.levelEvent(player, 2001, below, Block.getId(lower));
			}
		}
		return super.playerWillDestroy(level, pos, state, player);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		if (level instanceof ServerLevel serverLevel) {
			RandomSource random = level.getRandom();
			BlockPos screen = state.getValue(HALF) == DoubleBlockHalf.LOWER ? pos.above() : pos;
			for (int i = 0; i < 3; i++) {
				float pitch = 0.8F + random.nextInt(8) * 0.15F;
				serverLevel.playSound(null, screen, SoundEvents.NOTE_BLOCK_BIT.value(), SoundSource.BLOCKS, 0.6F, pitch);
			}
			serverLevel.sendParticles(ParticleTypes.ELECTRIC_SPARK,
					screen.getX() + 0.5, screen.getY() + 0.4, screen.getZ() + 0.5, 8, 0.3, 0.25, 0.3, 0.05);
			int result = random.nextInt(RESULTS);
			int score = (random.nextInt(900) + 100) * 10;
			player.displayClientMessage(Component.translatable("block.laptopcraft.arcade_cabinet.result." + result, String.format(Locale.ROOT, "%,d", score))
					.withStyle(ChatFormatting.LIGHT_PURPLE), true);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	protected boolean isPathfindable(BlockState state, PathComputationType pathComputationType) {
		return false;
	}
}
