package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.phys.BlockHitResult;

/**
 * Wall switch that turns every {@link LightFixture} in its room on or off. The "room" is found by a
 * bounded flood fill through open space that stops at walls and closed doors.
 */
public class LightSwitchBlock extends FurnitureBlock {
	public static final MapCodec<LightSwitchBlock> CODEC = simpleCodec(LightSwitchBlock::new);
	private static final int MAX_VISITED = 2500;
	private static final int MAX_RADIUS = 14;

	public LightSwitchBlock(Properties properties) {
		super(properties, true);
		this.registerDefaultState(this.defaultBlockState().setValue(ModProperties.ON, true));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(ModProperties.ON);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		boolean on = !state.getValue(ModProperties.ON);
		level.setBlock(pos, state.setValue(ModProperties.ON, on), Block.UPDATE_ALL);
		level.playSound(null, pos, SoundEvents.LEVER_CLICK, SoundSource.BLOCKS, 0.35F, on ? 1.4F : 1.1F);
		int changed = 0;
		for (BlockPos fixture : findFixtures(level, pos)) {
			BlockState fs = level.getBlockState(fixture);
			if (fs.getValue(BlockStateProperties.LIT) != on) {
				level.setBlock(fixture, fs.setValue(BlockStateProperties.LIT, on), Block.UPDATE_ALL);
				changed++;
			}
		}
		player.displayClientMessage(Component.translatable(on ? "message.modernapartments.lights_on" : "message.modernapartments.lights_off", changed), true);
		return InteractionResult.SUCCESS;
	}

	/** Light fixtures reachable from the switch through open space. */
	public static List<BlockPos> findFixtures(Level level, BlockPos start) {
		List<BlockPos> found = new ArrayList<>();
		Set<BlockPos> visited = new HashSet<>();
		ArrayDeque<BlockPos> queue = new ArrayDeque<>();
		queue.add(start);
		visited.add(start);
		while (!queue.isEmpty() && visited.size() < MAX_VISITED) {
			BlockPos p = queue.poll();
			for (Direction d : Direction.values()) {
				BlockPos n = p.relative(d);
				if (visited.contains(n) || n.distManhattan(start) > MAX_RADIUS * 2
					|| Math.abs(n.getX() - start.getX()) > MAX_RADIUS || Math.abs(n.getZ() - start.getZ()) > MAX_RADIUS
					|| Math.abs(n.getY() - start.getY()) > 6) {
					continue;
				}
				visited.add(n);
				BlockState s = level.getBlockState(n);
				if (s.getBlock() instanceof LightFixture && s.hasProperty(BlockStateProperties.LIT)) {
					found.add(n);
				}
				if (isOpen(level, n, s)) {
					queue.add(n);
				}
			}
		}
		return found;
	}

	private static boolean isOpen(Level level, BlockPos pos, BlockState state) {
		if (state.isAir()) {
			return true;
		}
		if (state.getBlock() instanceof DoorBlock) {
			return state.getValue(DoorBlock.OPEN);
		}
		if (state.getBlock() instanceof ElevatorDoorBlock) {
			return false;
		}
		return !state.isCollisionShapeFullBlock(level, pos) && state.getFluidState().isEmpty();
	}
}
