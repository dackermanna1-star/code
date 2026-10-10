package dev.overkill.block;

import com.mojang.serialization.MapCodec;
import dev.overkill.registry.ModBlocks;
import dev.overkill.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Glowing half-melted rock lining craters and blast trenches. Burns whatever walks on it, bubbles
 * and spits magma, and slowly cools into hot scorched stone (instantly if it touches water).
 */
public class MoltenRockBlock extends Block {
	public static final MapCodec<MoltenRockBlock> CODEC = simpleCodec(MoltenRockBlock::new);

	public MoltenRockBlock(BlockBehaviour.Properties properties) {
		super(properties);
	}

	@Override
	public MapCodec<MoltenRockBlock> codec() {
		return CODEC;
	}

	@Override
	public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
		if (level instanceof ServerLevel serverLevel && !entity.isSteppingCarefully() && entity instanceof LivingEntity living
			&& !living.fireImmune()) {
			living.hurtServer(serverLevel, level.damageSources().hotFloor(), 2.0F);
			living.igniteForSeconds(3.0F);
		}
		super.stepOn(level, pos, state, entity);
	}

	@Override
	protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		boolean quenched = false;
		for (Direction direction : Direction.values()) {
			if (level.getFluidState(pos.relative(direction)).is(FluidTags.WATER)) {
				quenched = true;
				break;
			}
		}
		if (quenched || random.nextInt(4) == 0) {
			level.setBlock(pos, ModBlocks.SCORCHED_STONE.defaultBlockState().setValue(ScorchedStoneBlock.HOT, true), Block.UPDATE_ALL);
			level.playSound(null, pos, SoundEvents.LAVA_EXTINGUISH, SoundSource.BLOCKS, 0.5F, 0.8F + random.nextFloat() * 0.4F);
			level.sendParticles(ParticleTypes.LARGE_SMOKE, pos.getX() + 0.5, pos.getY() + 1.0, pos.getZ() + 0.5, 6, 0.3, 0.1, 0.3, 0.01);
		}
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		BlockPos above = pos.above();
		if (!level.getBlockState(above).isAir()) {
			return;
		}
		double x = pos.getX() + random.nextDouble();
		double y = pos.getY() + 1.02;
		double z = pos.getZ() + random.nextDouble();
		if (random.nextInt(4) == 0) {
			level.addParticle(ModParticles.EMBER, x, y, z, (random.nextDouble() - 0.5) * 0.03, 0.06 + random.nextDouble() * 0.04, (random.nextDouble() - 0.5) * 0.03);
		}
		if (random.nextInt(25) == 0) {
			level.addParticle(ModParticles.MAGMA, x, y, z, (random.nextDouble() - 0.5) * 0.12, 0.25 + random.nextDouble() * 0.15, (random.nextDouble() - 0.5) * 0.12);
			level.playLocalSound(x, y, z, SoundEvents.LAVA_POP, SoundSource.BLOCKS, 0.4F + random.nextFloat() * 0.2F, 0.9F + random.nextFloat() * 0.15F, false);
		}
		if (random.nextInt(12) == 0) {
			level.addParticle(ModParticles.HEAVY_SMOKE, x, y + 0.3, z, 0.0, 0.03, 0.0);
		}
		if (random.nextInt(120) == 0) {
			level.playLocalSound(x, y, z, SoundEvents.LAVA_AMBIENT, SoundSource.BLOCKS, 0.3F, 0.7F + random.nextFloat() * 0.3F, false);
		}
	}
}
