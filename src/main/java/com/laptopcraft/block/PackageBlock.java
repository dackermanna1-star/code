package com.laptopcraft.block;

import com.laptopcraft.shop.Store;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A delivered parcel: the Emerazon cardboard box or the Ender Eats paper bag. Right-click to unbox
 * (contents go to the player, with confetti); breaking it spills the contents. There is no item form:
 * packages only exist as deliveries.
 */
public class PackageBlock extends BaseEntityBlock {
	public static final MapCodec<PackageBlock> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
			Store.CODEC.fieldOf("store").forGetter(PackageBlock::store),
			propertiesCodec()
	).apply(i, PackageBlock::new));
	public static final EnumProperty<Direction> FACING = HorizontalDirectionalBlock.FACING;

	private static final Map<Direction, VoxelShape> BOX_SHAPES = Shapes.rotateHorizontal(Block.box(3, 0, 3, 13, 9, 13));
	private static final Map<Direction, VoxelShape> BAG_SHAPES = Shapes.rotateHorizontal(Block.box(4, 0, 5, 12, 10, 11));

	private final Store store;

	public PackageBlock(Store store, BlockBehaviour.Properties properties) {
		super(properties);
		this.store = store;
		registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH));
	}

	/** Which shop's packaging this is. */
	public Store store() {
		return store;
	}

	@Override
	protected MapCodec<PackageBlock> codec() {
		return CODEC;
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
		return (store == Store.ENDER_EATS ? BAG_SHAPES : BOX_SHAPES).get(state.getValue(FACING));
	}

	@Override
	protected BlockState rotate(BlockState state, Rotation rotation) {
		return state.setValue(FACING, rotation.rotate(state.getValue(FACING)));
	}

	@Override
	protected BlockState mirror(BlockState state, Mirror mirror) {
		return state.rotate(mirror.getRotation(state.getValue(FACING)));
	}

	@Override
	public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return new PackageBlockEntity(pos, state);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		if (!level.isClientSide() && player instanceof ServerPlayer serverPlayer && level.getBlockEntity(pos) instanceof PackageBlockEntity parcel) {
			parcel.unbox(serverPlayer);
		}
		return InteractionResult.SUCCESS;
	}
}
