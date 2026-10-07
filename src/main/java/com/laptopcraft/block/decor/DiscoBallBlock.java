package com.laptopcraft.block.decor;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * A mirror ball. Hangs from a chain when placed under a block, otherwise stands on a little base. The mirror texture
 * spins and glints by itself; client-side it throws colourful light specks around the room, and clicking it drops
 * the beat (a random note + a burst of notes).
 */
public class DiscoBallBlock extends Block {
	public static final MapCodec<DiscoBallBlock> CODEC = simpleCodec(DiscoBallBlock::new);
	public static final BooleanProperty HANGING = BlockStateProperties.HANGING;
	private static final VoxelShape HANGING_SHAPE = Block.box(3, 2.5, 3, 13, 16, 13);
	private static final VoxelShape STANDING_SHAPE = Block.box(3, 0, 3, 13, 13, 13);
	private static final int[] SPECKS = {0xFF6FC4, 0x6FE8FF, 0xFFF07A, 0xA6FF8A, 0xFFFFFF, 0xC59BFF};

	public DiscoBallBlock(BlockBehaviour.Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(HANGING, true));
	}

	@Override
	protected MapCodec<? extends DiscoBallBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(HANGING);
	}

	@Override
	public @Nullable BlockState getStateForPlacement(BlockPlaceContext context) {
		return this.defaultBlockState().setValue(HANGING, context.getClickedFace() == Direction.DOWN);
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return state.getValue(HANGING) ? HANGING_SHAPE : STANDING_SHAPE;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		RandomSource random = level.getRandom();
		int note = random.nextInt(25);
		float pitch = (float) Math.pow(2.0, (note - 12) / 12.0);
		level.playSound(null, pos, SoundEvents.NOTE_BLOCK_PLING.value(), SoundSource.RECORDS, 1.0F, pitch);
		if (level instanceof ServerLevel serverLevel) {
			for (int i = 0; i < 6; i++) {
				double a = i * Math.PI / 3 + random.nextDouble() * 0.5;
				serverLevel.sendParticles(ParticleTypes.NOTE, pos.getX() + 0.5 + Math.cos(a) * 0.7, pos.getY() + 0.3, pos.getZ() + 0.5 + Math.sin(a) * 0.7,
						0, random.nextInt(25) / 24.0, 0.0, 0.0, 1.0);
			}
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		// light specks reflected around the room (client side only)
		for (int i = 0; i < 3; i++) {
			double dx = (random.nextDouble() - 0.5) * 5.0;
			double dy = -random.nextDouble() * 2.5 + 0.3;
			double dz = (random.nextDouble() - 0.5) * 5.0;
			int color = SPECKS[random.nextInt(SPECKS.length)];
			level.addParticle(new DustParticleOptions(color, 0.6F), pos.getX() + 0.5 + dx, pos.getY() + 0.5 + dy, pos.getZ() + 0.5 + dz, 0, 0, 0);
		}
		if (random.nextInt(4) == 0) {
			level.addParticle(ParticleTypes.END_ROD, pos.getX() + 0.5 + (random.nextDouble() - 0.5) * 0.7, pos.getY() + 0.45,
					pos.getZ() + 0.5 + (random.nextDouble() - 0.5) * 0.7, 0, -0.01, 0);
		}
	}
}
