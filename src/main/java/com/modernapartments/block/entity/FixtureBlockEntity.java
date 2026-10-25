package com.modernapartments.block.entity;

import com.modernapartments.block.FurnitureBlock;
import com.modernapartments.block.ModProperties;
import com.modernapartments.block.ToggleSettings.Effect;
import com.modernapartments.registry.ModBlockEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;

/**
 * Data-less block entity whose only job is a client ticker that animates running water, steam,
 * flames and the occasional ambient sound of switched-on fixtures.
 */
public class FixtureBlockEntity extends BlockEntity {
	public FixtureBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.FIXTURE, pos, state);
	}

	public static void clientTick(Level level, BlockPos pos, BlockState state, Effect effect) {
		boolean on = state.hasProperty(ModProperties.ON) ? state.getValue(ModProperties.ON)
			: !state.hasProperty(BlockStateProperties.LIT) || state.getValue(BlockStateProperties.LIT);
		if (!on) {
			return;
		}
		RandomSource r = level.random;
		Direction facing = state.hasProperty(FurnitureBlock.FACING) ? state.getValue(FurnitureBlock.FACING) : Direction.NORTH;
		switch (effect) {
			case SINK -> {
				if (r.nextInt(2) == 0) {
					particle(level, pos, facing, 0.5, 1.22, 0.62, ParticleTypes.FALLING_WATER);
				}
				if (r.nextInt(60) == 0) {
					sound(level, pos, SoundEvents.WATER_AMBIENT, 0.15F, 1.6F);
				}
			}
			case SHOWER -> {
				for (int i = 0; i < 2; i++) {
					particle(level, pos, facing, 0.38 + r.nextDouble() * 0.24, 0.55, 0.6 + r.nextDouble() * 0.24, ParticleTypes.FALLING_WATER);
				}
				if (r.nextInt(40) == 0) {
					sound(level, pos, SoundEvents.WEATHER_RAIN, 0.12F, 1.4F);
				}
			}
			case SPRAYER -> {
				if (r.nextInt(2) == 0) {
					particle(level, pos, facing, 0.5, 0.35, 0.82, ParticleTypes.FALLING_WATER);
				}
			}
			case WASHER, DISHWASHER -> {
				if (r.nextInt(80) == 0) {
					sound(level, pos, SoundEvents.BUBBLE_COLUMN_UPWARDS_AMBIENT, 0.2F, 0.8F);
				}
			}
			case DRYER -> {
				if (r.nextInt(30) == 0) {
					sound(level, pos, SoundEvents.WOOL_HIT, 0.25F, 0.6F);
				}
			}
			case FIREPLACE -> {
				if (r.nextInt(8) == 0) {
					particle(level, pos, facing, 0.2 + r.nextDouble() * 0.6, 0.45, 0.4, ParticleTypes.SMALL_FLAME);
				}
				if (r.nextInt(50) == 0) {
					sound(level, pos, SoundEvents.FIRE_AMBIENT, 0.3F, 1.0F);
				}
			}
			case GRILL -> {
				if (r.nextInt(4) == 0) {
					particle(level, pos, facing, 0.3 + r.nextDouble() * 0.4, 0.8, 0.3 + r.nextDouble() * 0.4, ParticleTypes.SMOKE);
				}
			}
			case HEATER -> {
				if (r.nextInt(6) == 0) {
					particle(level, pos, facing, 0.5, 0.5, 0.5, ParticleTypes.SMALL_FLAME);
				}
			}
			default -> {
			}
		}
	}

	/** Spawns a particle at a north-facing model position (0..1 block units) rotated to {@code facing}. */
	private static void particle(Level level, BlockPos pos, Direction facing, double x, double y, double z,
			net.minecraft.core.particles.SimpleParticleType type) {
		double rx = x, rz = z;
		switch (facing) {
			case EAST -> { rx = 1 - z; rz = x; }
			case SOUTH -> { rx = 1 - x; rz = 1 - z; }
			case WEST -> { rx = z; rz = 1 - x; }
			default -> { }
		}
		level.addParticle(type, pos.getX() + rx, pos.getY() + y, pos.getZ() + rz, 0, 0, 0);
	}

	private static void sound(Level level, BlockPos pos, net.minecraft.sounds.SoundEvent event, float volume, float pitch) {
		level.playLocalSound(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, event, SoundSource.BLOCKS, volume, pitch, false);
	}
}
