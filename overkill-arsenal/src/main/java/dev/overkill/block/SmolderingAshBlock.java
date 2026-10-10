package dev.overkill.block;

import com.mojang.serialization.MapCodec;
import dev.overkill.registry.ModBlocks;
import dev.overkill.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;

/** Still-glowing ash: smokes, crackles with embers, singes feet, then burns out into plain ash. */
public class SmolderingAshBlock extends AshLayerBlock {
	public static final MapCodec<SmolderingAshBlock> CODEC = simpleCodec(SmolderingAshBlock::new);

	public SmolderingAshBlock(BlockBehaviour.Properties properties) {
		super(properties);
	}

	@Override
	public MapCodec<SmolderingAshBlock> codec() {
		return CODEC;
	}

	@Override
	protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		if (random.nextInt(3) == 0) {
			level.setBlock(pos, ModBlocks.ASH_LAYER.defaultBlockState(), Block.UPDATE_ALL);
		}
	}

	@Override
	public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
		super.stepOn(level, pos, state, entity);
	}

	@Override
	protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, net.minecraft.world.entity.InsideBlockEffectApplier applier, boolean intersects) {
		super.entityInside(state, level, pos, entity, applier, intersects);
		if (level instanceof ServerLevel && entity instanceof LivingEntity living && !living.fireImmune() && level.random.nextInt(20) == 0) {
			living.igniteForSeconds(2.0F);
		}
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		double x = pos.getX() + random.nextDouble();
		double y = pos.getY() + 0.15;
		double z = pos.getZ() + random.nextDouble();
		if (random.nextInt(3) == 0) {
			level.addParticle(ParticleTypes.SMOKE, x, y, z, 0.0, 0.03, 0.0);
		}
		if (random.nextInt(7) == 0) {
			level.addParticle(ModParticles.EMBER, x, y, z, (random.nextDouble() - 0.5) * 0.02, 0.04 + random.nextDouble() * 0.03, (random.nextDouble() - 0.5) * 0.02);
		}
		if (random.nextInt(16) == 0) {
			level.addParticle(ModParticles.HEAVY_SMOKE, x, y + 0.4, z, 0.0, 0.02, 0.0);
		}
		if (random.nextInt(30) == 0) {
			level.addParticle(ModParticles.ASH, x, y + 0.6, z, 0.0, 0.02, 0.0);
		}
	}
}
