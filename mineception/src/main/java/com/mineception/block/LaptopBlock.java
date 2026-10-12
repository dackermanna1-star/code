package com.mineception.block;

import com.mineception.ClientHooks;
import com.mineception.dream.Face;
import com.mineception.dream.LaptopGeometry;
import java.util.EnumMap;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * The real-world laptop. FACING is the direction its screen faces (toward the player who placed it). Using it opens
 * the laptop screen on the client. Its outline and collision follow the deck and lid from {@link LaptopGeometry}.
 */
public class LaptopBlock extends Block implements EntityBlock {
	public static final EnumProperty<Direction> FACING = BlockStateProperties.HORIZONTAL_FACING;
	private static final Map<Direction, VoxelShape> SHAPES = new EnumMap<>(Direction.class);

	static {
		for (Direction direction : Direction.Plane.HORIZONTAL) {
			VoxelShape shape = Shapes.empty();
			for (double[] box : LaptopGeometry.boxes(face(direction))) {
				shape = Shapes.or(shape, Shapes.box(box[0], box[1], box[2], box[3], box[4], box[5]));
			}
			SHAPES.put(direction, shape.optimize());
		}
	}

	public LaptopBlock(Properties properties) {
		super(properties);
		registerDefaultState(stateDefinition.any().setValue(FACING, Direction.SOUTH));
	}

	/** The dream-engine face matching a horizontal direction. */
	public static Face face(Direction direction) {
		return switch (direction) {
			case NORTH -> Face.NORTH;
			case EAST -> Face.EAST;
			case WEST -> Face.WEST;
			case UP -> Face.UP;
			case DOWN -> Face.DOWN;
			default -> Face.SOUTH;
		};
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(FACING);
	}

	@Override
	public BlockState getStateForPlacement(BlockPlaceContext context) {
		return defaultBlockState().setValue(FACING, context.getHorizontalDirection().getOpposite());
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPES.get(state.getValue(FACING));
	}

	@Override
	public void setPlacedBy(Level level, BlockPos pos, BlockState state, @Nullable LivingEntity placer, ItemStack stack) {
		super.setPlacedBy(level, pos, state, placer, stack);
		if (!level.isClientSide() && level.getBlockEntity(pos) instanceof LaptopBlockEntity laptop) {
			// A laptop fresh from the crafting table dreams up its own seed right away; one that was picked up keeps its data
			laptop.data();
		}
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (level.isClientSide()) {
			ClientHooks.openLaptop.accept(pos);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public @Nullable BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return new LaptopBlockEntity(pos, state);
	}

	@Override
	protected BlockState rotate(BlockState state, Rotation rotation) {
		return state.setValue(FACING, rotation.rotate(state.getValue(FACING)));
	}

	@Override
	protected BlockState mirror(BlockState state, Mirror mirror) {
		return state.rotate(mirror.getRotation(state.getValue(FACING)));
	}
}
