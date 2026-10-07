package com.laptopcraft.block.decor;

import com.laptopcraft.registry.ModSounds;
import com.mojang.serialization.MapCodec;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A classic rubber duck. Squeaks when clicked or stepped on; when waterlogged it pops up and floats on the surface
 * (blockstate {@code waterlogged=true} uses the raised "floating" model).
 */
public class RubberDuckBlock extends FacingDecorBlock {
	public static final MapCodec<RubberDuckBlock> CODEC = simpleCodec(RubberDuckBlock::new);
	private static final VoxelShape SHAPE = Shapes.or(
			Block.box(5, 0, 4.5, 11, 4, 12.5),
			Block.box(6, 4, 4.5, 10, 8, 8.5),
			Block.box(7, 4.5, 2.5, 9, 6, 4.5));
	/** Floating model is raised by 12px; only the body fits inside the block. */
	private static final Map<Direction, VoxelShape> FLOATING = Shapes.rotateHorizontal(Block.box(5, 12, 4.5, 11, 16, 12.5));
	/** Floating offset in blocks (matches the generated rubber_duck_floating model). */
	public static final double FLOAT_OFFSET = 12 / 16.0;

	public RubberDuckBlock(BlockBehaviour.Properties properties) {
		super(properties, SHAPE);
	}

	@Override
	protected MapCodec<? extends RubberDuckBlock> codec() {
		return CODEC;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return state.getValue(WATERLOGGED) ? FLOATING.get(state.getValue(FACING)) : super.getShape(state, level, pos, context);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hitResult) {
		double y = pos.getY() + (state.getValue(WATERLOGGED) ? FLOAT_OFFSET + 0.6 : 0.6);
		squeak(level, pos.getX() + 0.5, y, pos.getZ() + 0.5);
		return InteractionResult.SUCCESS;
	}

	@Override
	public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
		if (!level.isClientSide() && !entity.isSteppingCarefully() && level.getGameTime() % 10 == 0) {
			squeak(level, pos.getX() + 0.5, pos.getY() + 0.6, pos.getZ() + 0.5);
		}
		super.stepOn(level, pos, state, entity);
	}

	/** Squeak sound + a single note particle (server side; no-op for the particle on the client). */
	public static void squeak(Level level, double x, double y, double z) {
		level.playSound(null, x, y, z, ModSounds.TOY_SQUEAK, SoundSource.BLOCKS, 0.9F, 0.85F + level.getRandom().nextFloat() * 0.35F);
		if (level instanceof ServerLevel serverLevel) {
			serverLevel.sendParticles(ParticleTypes.NOTE, x, y + 0.2, z, 0, level.getRandom().nextInt(25) / 24.0, 0.0, 0.0, 1.0);
		}
	}
}
