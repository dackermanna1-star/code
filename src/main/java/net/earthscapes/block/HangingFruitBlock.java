package net.earthscapes.block;

import com.mojang.serialization.MapCodec;
import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A fruit bunch hanging beneath a palm crown (dates). It ripens over time and can be picked by
 * hand, which leaves the green stalk to ripen again.
 */
public class HangingFruitBlock extends Block {
	public static final MapCodec<HangingFruitBlock> CODEC = simpleCodec(p -> new HangingFruitBlock(() -> Items.SWEET_BERRIES, p));
	public static final IntegerProperty AGE = BlockStateProperties.AGE_2;
	private static final VoxelShape SHAPE = Block.box(3.0, 2.0, 3.0, 13.0, 16.0, 13.0);

	private final Supplier<Item> fruit;

	public HangingFruitBlock(Supplier<Item> fruit, Properties properties) {
		super(properties);
		this.fruit = fruit;
		this.registerDefaultState(this.stateDefinition.any().setValue(AGE, 2));
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPE;
	}

	@Override
	protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
		BlockState above = level.getBlockState(pos.above());
		return above.is(BlockTags.LOGS) || above.is(BlockTags.LEAVES) || above.isFaceSturdy(level, pos.above(), Direction.DOWN);
	}

	@Override
	protected BlockState updateShape(
		BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction, BlockPos neighborPos, BlockState neighbor, RandomSource random
	) {
		return direction == Direction.UP && !state.canSurvive(level, pos)
			? Blocks.AIR.defaultBlockState()
			: super.updateShape(state, level, ticks, pos, direction, neighborPos, neighbor, random);
	}

	@Override
	protected boolean isRandomlyTicking(BlockState state) {
		return state.getValue(AGE) < 2;
	}

	@Override
	protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		int age = state.getValue(AGE);
		if (age < 2 && random.nextInt(6) == 0) {
			BlockState grown = state.setValue(AGE, age + 1);
			level.setBlock(pos, grown, 2);
			level.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(grown));
		}
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (state.getValue(AGE) < 2) {
			return super.useWithoutItem(state, level, pos, player, hit);
		}
		if (level instanceof ServerLevel serverLevel) {
			Block.popResource(serverLevel, pos, new ItemStack(this.fruit.get(), 2 + serverLevel.random.nextInt(3)));
			serverLevel.playSound(null, pos, SoundEvents.SWEET_BERRY_BUSH_PICK_BERRIES, SoundSource.BLOCKS, 1.0F, 0.8F + serverLevel.random.nextFloat() * 0.4F);
			BlockState picked = state.setValue(AGE, 0);
			serverLevel.setBlock(pos, picked, 2);
			serverLevel.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(player, picked));
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(AGE);
	}
}
