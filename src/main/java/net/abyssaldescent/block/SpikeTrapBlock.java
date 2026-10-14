package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.registry.ModDamageTypes;
import net.abyssaldescent.registry.ModSounds;
import net.abyssaldescent.world.DungeonDimension;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.pathfinder.PathComputationType;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Floor plate riddled with holes. Stepping on it primes the whole connected band (an audible click and puffs of dust),
 * then spikes erupt half a second later. Enemies trigger it too, so it can be turned against them.
 */
public class SpikeTrapBlock extends Block {
	public static final MapCodec<SpikeTrapBlock> CODEC = simpleCodec(SpikeTrapBlock::new);
	/** 0 idle, 1 primed (warning), 2 extended, 3 recovering. */
	public static final IntegerProperty STAGE = IntegerProperty.create("stage", 0, 3);
	public static final int WARNING_TICKS = 11;
	private static final int EXTENDED_TICKS = 22;
	private static final int RECOVER_TICKS = 34;
	private static final VoxelShape PLATE = Block.box(0, 0, 0, 16, 1, 16);
	private static final VoxelShape SPIKES = Block.box(1, 0, 1, 15, 13, 15);

	public SpikeTrapBlock(Properties properties) {
		super(properties);
		registerDefaultState(stateDefinition.any().setValue(STAGE, 0));
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(STAGE);
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return state.getValue(STAGE) == 2 ? SPIKES : PLATE;
	}

	@Override
	protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return Shapes.empty();
	}

	@Override
	protected VoxelShape getEntityInsideCollisionShape(BlockState state, BlockGetter level, BlockPos pos, Entity entity) {
		return state.getValue(STAGE) == 2 ? SPIKES : PLATE;
	}

	@Override
	protected boolean isPathfindable(BlockState state, PathComputationType type) {
		// Mobs path around armed traps they can see extended; otherwise they walk over them like players.
		return state.getValue(STAGE) != 2;
	}

	@Override
	protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects, boolean intersects) {
		if (!(level instanceof ServerLevel serverLevel) || !(entity instanceof LivingEntity living) || living.isSpectator()) {
			return;
		}
		if (living.isNoGravity() || living.getY() > pos.getY() + 0.5) {
			return;
		}
		int stage = state.getValue(STAGE);
		if (stage == 0) {
			primeBand(serverLevel, pos);
		} else if (stage == 2) {
			impale(serverLevel, pos, living);
		}
	}

	/** Primes every idle spike plate connected to {@code origin} (the whole band fires together). */
	private void primeBand(ServerLevel level, BlockPos origin) {
		Set<BlockPos> visited = new HashSet<>();
		ArrayDeque<BlockPos> queue = new ArrayDeque<>();
		queue.add(origin);
		visited.add(origin);
		while (!queue.isEmpty() && visited.size() < 24) {
			BlockPos pos = queue.poll();
			BlockState state = level.getBlockState(pos);
			if (!state.is(this) || state.getValue(STAGE) != 0) {
				continue;
			}
			level.setBlock(pos, state.setValue(STAGE, 1), Block.UPDATE_CLIENTS);
			level.scheduleTick(pos, this, WARNING_TICKS);
			level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.GRAVEL.defaultBlockState()), pos.getX() + 0.5, pos.getY() + 0.1,
				pos.getZ() + 0.5, 4, 0.3, 0.0, 0.3, 0.02);
			for (Direction d : Direction.Plane.HORIZONTAL) {
				BlockPos next = pos.relative(d);
				if (visited.add(next)) {
					queue.add(next);
				}
			}
		}
		level.playSound(null, origin, ModSounds.TRAP_CLICK, SoundSource.BLOCKS, 1.0F, 0.9F + level.random.nextFloat() * 0.2F);
	}

	@Override
	protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		switch (state.getValue(STAGE)) {
			case 1 -> {
				level.setBlock(pos, state.setValue(STAGE, 2), Block.UPDATE_CLIENTS);
				level.scheduleTick(pos, this, EXTENDED_TICKS);
				level.playSound(null, pos, ModSounds.SPIKES_EXTEND, SoundSource.BLOCKS, 0.9F, 0.9F + random.nextFloat() * 0.2F);
				level.sendParticles(ParticleTypes.CRIT, pos.getX() + 0.5, pos.getY() + 0.6, pos.getZ() + 0.5, 6, 0.3, 0.3, 0.3, 0.2);
				for (LivingEntity living : level.getEntitiesOfClass(LivingEntity.class, new AABB(pos).setMaxY(pos.getY() + 0.9))) {
					impale(level, pos, living);
				}
			}
			case 2 -> {
				level.setBlock(pos, state.setValue(STAGE, 3), Block.UPDATE_CLIENTS);
				level.scheduleTick(pos, this, RECOVER_TICKS);
				level.playSound(null, pos, SoundEvents.PISTON_CONTRACT, SoundSource.BLOCKS, 0.35F, 1.4F);
			}
			case 3 -> level.setBlock(pos, state.setValue(STAGE, 0), Block.UPDATE_CLIENTS);
			default -> {
			}
		}
	}

	private void impale(ServerLevel level, BlockPos pos, LivingEntity living) {
		if (living.isSpectator() || living.isNoGravity()) {
			return;
		}
		int floor = Math.max(1, DungeonDimension.floorAt(level, pos));
		float damage = (float) ((3.5F + 0.4F * floor) * AdConfig.get().difficulty.damageMultiplier);
		if (living.hurtServer(level, level.damageSources().source(ModDamageTypes.SPIKES), damage)) {
			living.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 30, 1));
		}
	}
}
