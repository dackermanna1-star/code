package com.chaosunleashed.block;

import com.chaosunleashed.network.ChaosNetworking;
import com.chaosunleashed.registry.ModBlockEntities;
import com.mojang.serialization.MapCodec;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.BlockWithEntity;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.block.entity.BlockEntityTicker;
import net.minecraft.block.entity.BlockEntityType;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemPlacementContext;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.state.StateManager;
import net.minecraft.state.property.EnumProperty;
import net.minecraft.state.property.Properties;
import net.minecraft.util.ActionResult;
import net.minecraft.util.BlockMirror;
import net.minecraft.util.BlockRotation;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.world.BlockView;
import net.minecraft.world.World;
import org.jetbrains.annotations.Nullable;

/**
 * The Chaos Control Panel: right-click opens the control GUI, sneak + right-click quick-stops the current event
 * (see {@code ChaosControlPanelInteraction}), and it outputs a redstone signal of 15 while any event is running.
 * A comparator reads which event is running (1-9, in menu order). Its output is exempt from Solar Flare.
 */
public class ChaosControlPanelBlock extends BlockWithEntity {
	public static final MapCodec<ChaosControlPanelBlock> CODEC = createCodec(ChaosControlPanelBlock::new);
	public static final EnumProperty<Direction> FACING = Properties.HORIZONTAL_FACING;
	public static final EnumProperty<PanelStatus> STATUS = EnumProperty.of("status", PanelStatus.class);

	public ChaosControlPanelBlock(AbstractBlock.Settings settings) {
		super(settings);
		this.setDefaultState(this.stateManager.getDefaultState().with(FACING, Direction.NORTH).with(STATUS, PanelStatus.IDLE));
	}

	@Override
	protected MapCodec<? extends BlockWithEntity> getCodec() {
		return CODEC;
	}

	@Override
	protected void appendProperties(StateManager.Builder<Block, BlockState> builder) {
		builder.add(FACING, STATUS);
	}

	@Nullable
	@Override
	public BlockState getPlacementState(ItemPlacementContext ctx) {
		return this.getDefaultState().with(FACING, ctx.getHorizontalPlayerFacing().getOpposite());
	}

	@Override
	protected BlockState rotate(BlockState state, BlockRotation rotation) {
		return state.with(FACING, rotation.rotate(state.get(FACING)));
	}

	@Override
	protected BlockState mirror(BlockState state, BlockMirror mirror) {
		return state.rotate(mirror.getRotation(state.get(FACING)));
	}

	@Override
	protected ActionResult onUse(BlockState state, World world, BlockPos pos, PlayerEntity player, BlockHitResult hit) {
		if (!world.isClient() && player instanceof ServerPlayerEntity serverPlayer) {
			ChaosNetworking.openPanel(serverPlayer, pos);
		}
		return ActionResult.SUCCESS;
	}

	@Override
	protected boolean emitsRedstonePower(BlockState state) {
		return true;
	}

	@Override
	protected int getWeakRedstonePower(BlockState state, BlockView world, BlockPos pos, Direction direction) {
		return state.get(STATUS) != PanelStatus.IDLE ? 15 : 0;
	}

	@Override
	protected boolean hasComparatorOutput(BlockState state) {
		return true;
	}

	@Override
	protected int getComparatorOutput(BlockState state, World world, BlockPos pos, Direction direction) {
		return world.getBlockEntity(pos) instanceof ChaosControlPanelBlockEntity panel ? panel.getComparatorOutput() : 0;
	}

	@Override
	public BlockEntity createBlockEntity(BlockPos pos, BlockState state) {
		return new ChaosControlPanelBlockEntity(pos, state);
	}

	@Nullable
	@Override
	public <T extends BlockEntity> BlockEntityTicker<T> getTicker(World world, BlockState state, BlockEntityType<T> type) {
		return world.isClient() ? null : validateTicker(type, ModBlockEntities.CHAOS_CONTROL_PANEL, ChaosControlPanelBlockEntity::serverTick);
	}
}
