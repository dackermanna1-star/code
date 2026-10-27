package com.realweather.world;

import com.realweather.config.RealWeatherConfig;
import com.realweather.weather.Climate;
import com.realweather.weather.WeatherState;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.SnowLayerBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.material.Fluids;

/**
 * Progressive snow cover: layers build up while it snows (faster in blizzards), drift evenly into hollows and
 * against walls, and melt again once a cold snap passes in a biome that is normally too warm for snow.
 *
 * <p>Work is sampled in a disk around each player instead of iterating loaded chunks, which keeps the cost
 * constant (a handful of heightmap lookups per player per tick) regardless of render distance.
 */
public final class SnowAccumulation {
	/** Layers per column per second at full precipitation and rate 1 is roughly {@code SAMPLES * 20 / area}. */
	private static final float ACCUMULATION_SAMPLES = 9.0F;
	private static final float MELT_SAMPLES = 3.0F;
	private static final int MAX_LAYERS = 7;

	private final RandomSource random = RandomSource.create();
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();

	public void tick(ServerLevel level, WeatherState state) {
		RealWeatherConfig config = RealWeatherConfig.get();
		List<ServerPlayer> players = level.players();
		if (players.isEmpty()) {
			return;
		}
		int vanillaCap = level.getGameRules().get(GameRules.MAX_SNOW_ACCUMULATION_HEIGHT);
		boolean accumulate = config.snowAccumulation && vanillaCap > 0 && state.precipitation > 0.08F;
		boolean melt = config.snowMelting;
		if (!accumulate && !melt) {
			return;
		}
		float blizzard = Mth.clamp((state.precipitation - 0.6F) / 0.35F, 0.0F, 1.0F) * Mth.clamp(state.coldSnap * 2.0F, 0.35F, 1.0F);
		int maxLayers = Math.min(MAX_LAYERS, Math.round(Mth.lerp(blizzard, config.maxSnowLayers, Math.max(config.maxSnowLayers, config.maxBlizzardSnowLayers))));
		int radius = config.accumulationRadius;

		for (ServerPlayer player : players) {
			if (accumulate) {
				int samples = stochasticCount(ACCUMULATION_SAMPLES * config.snowAccumulationRate * state.precipitation * (radius * radius) / (48.0F * 48.0F));
				for (int i = 0; i < samples; i++) {
					if (this.pickColumn(level, player, radius)) {
						this.trySnow(level, state, maxLayers, config.freezeWaterInColdSnaps);
					}
				}
			}
			if (melt) {
				float daylight = level.isBrightOutside() ? 1.5F : 0.5F;
				float rainBoost = state.precipitation > 0.1F ? 2.0F : 1.0F;
				int samples = stochasticCount(MELT_SAMPLES * config.snowMeltRate * daylight * rainBoost * (radius * radius) / (48.0F * 48.0F));
				for (int i = 0; i < samples; i++) {
					if (this.pickColumn(level, player, radius)) {
						this.tryMelt(level, state, config.freezeWaterInColdSnaps);
					}
				}
			}
		}
	}

	private int stochasticCount(float expected) {
		int whole = (int) expected;
		return whole + (this.random.nextFloat() < expected - whole ? 1 : 0);
	}

	/** Moves the cursor to the top (first non-motion-blocking position) of a random loaded column near the player. */
	private boolean pickColumn(ServerLevel level, ServerPlayer player, int radius) {
		double angle = this.random.nextDouble() * Math.PI * 2.0;
		double distance = Math.sqrt(this.random.nextDouble()) * radius;
		int x = Mth.floor(player.getX() + Math.cos(angle) * distance);
		int z = Mth.floor(player.getZ() + Math.sin(angle) * distance);
		this.cursor.set(x, player.getBlockY(), z);
		if (!level.isLoaded(this.cursor)) {
			return false;
		}
		int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z);
		if (top <= level.getMinY() || top > level.getMaxY()) {
			return false;
		}
		this.cursor.setY(top);
		return true;
	}

	private void trySnow(ServerLevel level, WeatherState state, int maxLayers, boolean freezeWater) {
		BlockPos pos = this.cursor;
		Biome biome = level.getBiome(pos).value();
		if (Climate.precipitationFor(level, biome, pos, state.coldSnap) != Climate.Precipitation.SNOW) {
			return;
		}
		// Rain bands: the thickest parts of the cloud field snow hardest.
		double nx = pos.getX() - state.cloudOffsetX;
		double nz = pos.getZ() - state.cloudOffsetZ;
		float local = state.precipitation * Climate.localIntensity(biome, nx, nz, state.cloudCover);
		if (this.random.nextFloat() > Mth.clamp(local * 1.4F, 0.0F, 1.0F)) {
			return;
		}
		if (level.getBrightness(LightLayer.BLOCK, pos) >= 10) {
			return;
		}

		BlockState current = level.getBlockState(pos);
		if (current.is(Blocks.SNOW)) {
			int layers = current.getValue(SnowLayerBlock.LAYERS);
			if (layers >= maxLayers) {
				return;
			}
			// Snow settles evenly: a column only grows if it is not already higher than its lowest neighbour.
			if (layers > this.lowestNeighbourLayers(level, pos) + 1) {
				return;
			}
			BlockState grown = current.setValue(SnowLayerBlock.LAYERS, layers + 1);
			Block.pushEntitiesUp(current, grown, level, pos);
			level.setBlockAndUpdate(pos, grown);
		} else if (current.isAir()) {
			BlockState snow = Blocks.SNOW.defaultBlockState();
			if (snow.canSurvive(level, pos)) {
				level.setBlockAndUpdate(pos, snow);
			} else if (freezeWater && state.coldSnap > 0.5F) {
				this.tryFreeze(level, pos.below());
			}
		}
	}

	/** Neighbour heights in layers; solid walls count as full so snow drifts up against them. */
	private int lowestNeighbourLayers(ServerLevel level, BlockPos pos) {
		int lowest = SnowLayerBlock.MAX_HEIGHT;
		for (Direction direction : Direction.Plane.HORIZONTAL) {
			BlockPos side = pos.relative(direction);
			if (!level.isLoaded(side)) {
				continue;
			}
			BlockState state = level.getBlockState(side);
			int height;
			if (state.is(Blocks.SNOW)) {
				height = state.getValue(SnowLayerBlock.LAYERS);
			} else if (state.isFaceSturdy(level, side, direction.getOpposite())) {
				height = SnowLayerBlock.MAX_HEIGHT;
			} else {
				height = 0;
			}
			lowest = Math.min(lowest, height);
		}
		return lowest;
	}

	private void tryFreeze(ServerLevel level, BlockPos water) {
		BlockState state = level.getBlockState(water);
		if (!(state.getBlock() instanceof LiquidBlock) || level.getFluidState(water).getType() != Fluids.WATER) {
			return;
		}
		// Like vanilla: water freezes from the edges inwards.
		boolean enclosed = level.isWaterAt(water.west()) && level.isWaterAt(water.east()) && level.isWaterAt(water.north()) && level.isWaterAt(water.south());
		if (!enclosed) {
			level.setBlockAndUpdate(water, Blocks.ICE.defaultBlockState());
		}
	}

	private void tryMelt(ServerLevel level, WeatherState state, boolean meltIce) {
		BlockPos pos = this.cursor;
		BlockState current = level.getBlockState(pos);
		BlockPos target;
		if (current.is(Blocks.SNOW)) {
			target = pos;
		} else {
			BlockState below = level.getBlockState(pos.below());
			if (meltIce && below.is(Blocks.ICE)) {
				target = pos.below();
				current = below;
			} else {
				return;
			}
		}
		Biome biome = level.getBiome(target).value();
		// Only melt where it is currently warm enough to rain; naturally snowy biomes keep their snow.
		if (Climate.effectiveTemperature(level, biome, target, state.coldSnap) < Climate.SLEET_TEMPERATURE) {
			return;
		}
		if (current.is(Blocks.ICE)) {
			if (level.canSeeSky(target.above())) {
				level.setBlockAndUpdate(target, Blocks.WATER.defaultBlockState());
			}
			return;
		}
		int layers = current.getValue(SnowLayerBlock.LAYERS);
		if (layers <= 1) {
			level.removeBlock(target, false);
		} else {
			level.setBlockAndUpdate(target, current.setValue(SnowLayerBlock.LAYERS, layers - 1));
		}
	}
}
