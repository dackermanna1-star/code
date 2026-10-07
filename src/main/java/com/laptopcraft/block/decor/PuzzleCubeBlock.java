package com.laptopcraft.block.decor;

import com.mojang.serialization.MapCodec;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A Rubik's-style puzzle cube. Every click twists it into the next arrangement; state 0 is solved and earns a little
 * celebration ("mostly by accident").
 */
public class PuzzleCubeBlock extends Block {
	public static final MapCodec<PuzzleCubeBlock> CODEC = simpleCodec(PuzzleCubeBlock::new);
	public static final int STATES = 4;
	public static final IntegerProperty STATE = IntegerProperty.create("state", 0, STATES - 1);
	private static final VoxelShape SHAPE = Block.box(1.5, 0, 1.5, 14.5, 13, 14.5);

	public PuzzleCubeBlock(BlockBehaviour.Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(STATE, 1));
	}

	@Override
	protected MapCodec<? extends PuzzleCubeBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(STATE);
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPE;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		if (!(level instanceof ServerLevel serverLevel)) {
			return InteractionResult.SUCCESS;
		}
		int next = (state.getValue(STATE) + 1) % STATES;
		level.setBlock(pos, state.setValue(STATE, next), Block.UPDATE_ALL);
		level.playSound(null, pos, SoundEvents.LEVER_CLICK, SoundSource.BLOCKS, 0.4F, 1.6F + level.getRandom().nextFloat() * 0.3F);
		if (next == 0) {
			level.playSound(null, pos, SoundEvents.PLAYER_LEVELUP, SoundSource.BLOCKS, 0.5F, 1.4F);
			serverLevel.sendParticles(ParticleTypes.HAPPY_VILLAGER, pos.getX() + 0.5, pos.getY() + 0.9, pos.getZ() + 0.5, 12, 0.35, 0.25, 0.35, 0.0);
			player.displayClientMessage(Component.translatable("block.laptopcraft.puzzle_cube.solved").withStyle(ChatFormatting.GOLD), true);
		}
		return InteractionResult.SUCCESS;
	}
}
