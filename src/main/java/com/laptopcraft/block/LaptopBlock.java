package com.laptopcraft.block;

import com.laptopcraft.LaptopCraft;
import com.laptopcraft.account.AccountService;
import com.laptopcraft.network.ModPayloads;
import com.laptopcraft.registry.ModSounds;
import com.mojang.serialization.MapCodec;
import java.util.Map;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
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
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.pathfinder.PathComputationType;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * The CubeBook laptop. {@link #FACING} is the direction the screen faces (toward the player who placed it);
 * the lid hinge sits at the back edge. Right-click boots CubeOS (opening the lid first if needed),
 * sneak + right-click just opens/closes the lid. An open laptop glows softly.
 */
public class LaptopBlock extends BaseEntityBlock {
	public static final MapCodec<LaptopBlock> CODEC = simpleCodec(LaptopBlock::new);
	public static final EnumProperty<Direction> FACING = HorizontalDirectionalBlock.FACING;
	public static final BooleanProperty OPEN = BlockStateProperties.OPEN;
	/** Light emitted by the screen of an open laptop. */
	public static final int SCREEN_LIGHT = 5;

	// Shapes for FACING = NORTH (screen faces north, lid hinge at the south edge); rotated for the other facings.
	private static final VoxelShape DECK = Block.box(2, 0, 3.5, 14, 1, 12.5);
	private static final VoxelShape LID = Block.box(2, 1, 11, 14, 11, 12.5);
	private static final Map<Direction, VoxelShape> OPEN_SHAPES = Shapes.rotateHorizontal(Shapes.or(DECK, LID));
	private static final Map<Direction, VoxelShape> CLOSED_SHAPES = Shapes.rotateHorizontal(Block.box(2, 0, 3.5, 14, 2, 12.5));

	public LaptopBlock(BlockBehaviour.Properties properties) {
		super(properties);
		registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH).setValue(OPEN, false));
	}

	@Override
	protected MapCodec<LaptopBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(FACING, OPEN);
	}

	@Override
	public BlockState getStateForPlacement(BlockPlaceContext context) {
		return defaultBlockState().setValue(FACING, context.getHorizontalDirection().getOpposite());
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return (state.getValue(OPEN) ? OPEN_SHAPES : CLOSED_SHAPES).get(state.getValue(FACING));
	}

	@Override
	protected boolean isPathfindable(BlockState state, PathComputationType type) {
		return false;
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
		return new LaptopBlockEntity(pos, state);
	}

	@Override
	public void setPlacedBy(Level level, BlockPos pos, BlockState state, @Nullable LivingEntity placer, ItemStack stack) {
		super.setPlacedBy(level, pos, state, placer, stack);
		if (!level.isClientSide() && placer instanceof Player player && level.getBlockEntity(pos) instanceof LaptopBlockEntity laptop) {
			laptop.onPlacedBy(player);
		}
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		if (level.isClientSide() || !(player instanceof ServerPlayer serverPlayer)) {
			return InteractionResult.SUCCESS;
		}
		if (player.isSecondaryUseActive()) {
			setOpen(level, pos, state, !state.getValue(OPEN), player);
			return InteractionResult.SUCCESS;
		}
		if (!state.getValue(OPEN)) {
			setOpen(level, pos, state, true, player);
		}
		openScreen(serverPlayer, pos);
		return InteractionResult.SUCCESS;
	}

	/** Sends the CubeOS screen (OS data + account) for the laptop at {@code pos} to the player. */
	public static void openScreen(ServerPlayer player, BlockPos pos) {
		if (!(player.level().getBlockEntity(pos) instanceof LaptopBlockEntity laptop)) {
			return;
		}
		if (!laptop.hasOwner()) {
			// Laptops placed by commands/structures belong to the first person who boots them.
			laptop.setOwner(player);
		}
		LaptopSessions.open(player, pos);
		if (!ServerPlayNetworking.canSend(player, ModPayloads.OpenLaptop.TYPE)) {
			LaptopCraft.LOGGER.debug("{} can't receive the CubeOS screen (client without LaptopCraft?)", player.getGameProfile().name());
			return;
		}
		String owner = laptop.ownerName();
		if (owner.length() > 64) {
			owner = owner.substring(0, 64);
		}
		try {
			ServerPlayNetworking.send(player, new ModPayloads.OpenLaptop(pos.immutable(), laptop.copyOsData(), AccountService.snapshot(player), owner));
		} catch (RuntimeException e) {
			LaptopCraft.LOGGER.error("Could not open laptop at {} for {}", pos, player.getGameProfile().name(), e);
		}
	}

	/** Opens or closes the lid with a sound and game event; no-op if it's already in that state. */
	public static void setOpen(Level level, BlockPos pos, BlockState state, boolean open, @Nullable Entity source) {
		if (!state.hasProperty(OPEN) || state.getValue(OPEN) == open) {
			return;
		}
		level.setBlock(pos, state.setValue(OPEN, open), Block.UPDATE_ALL);
		level.playSound(null, pos, ModSounds.LAPTOP_LID, SoundSource.BLOCKS, 0.8f, open ? 1.1f : 0.9f);
		level.gameEvent(source, open ? GameEvent.BLOCK_OPEN : GameEvent.BLOCK_CLOSE, pos);
	}
}
