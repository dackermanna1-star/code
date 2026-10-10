package net.earthscapes.worldgen.placement;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.earthscapes.registry.EsPlacements;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.placement.PlacementContext;
import net.minecraft.world.level.levelgen.placement.PlacementFilter;
import net.minecraft.world.level.levelgen.placement.PlacementModifierType;

/**
 * Filters positions by the steepness of the ground around them and, optionally, by which way the
 * slope faces. Mongolian forest-steppe larches only grow on cool north-facing slopes; gers and
 * termite mounds want level ground.
 */
public class SlopeFilter extends PlacementFilter {
	public static final MapCodec<SlopeFilter> CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		Codec.floatRange(0.0F, 64.0F).optionalFieldOf("min_slope", 0.0F).forGetter(f -> f.minSlope),
		Codec.floatRange(0.0F, 64.0F).optionalFieldOf("max_slope", 64.0F).forGetter(f -> f.maxSlope),
		Direction.CODEC.optionalFieldOf("facing").forGetter(f -> f.facing),
		Codec.floatRange(-1.0F, 1.0F).optionalFieldOf("facing_threshold", 0.3F).forGetter(f -> f.facingThreshold),
		Codec.intRange(1, 16).optionalFieldOf("radius", 3).forGetter(f -> f.radius)
	).apply(instance, SlopeFilter::new));

	private final float minSlope;
	private final float maxSlope;
	private final Optional<Direction> facing;
	private final float facingThreshold;
	private final int radius;

	public SlopeFilter(float minSlope, float maxSlope, Optional<Direction> facing, float facingThreshold, int radius) {
		this.minSlope = minSlope;
		this.maxSlope = maxSlope;
		this.facing = facing;
		this.facingThreshold = facingThreshold;
		this.radius = radius;
	}

	@Override
	protected boolean shouldPlace(PlacementContext context, RandomSource random, BlockPos pos) {
		int r = this.radius;
		int east = context.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, pos.getX() + r, pos.getZ());
		int west = context.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, pos.getX() - r, pos.getZ());
		int south = context.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, pos.getX(), pos.getZ() + r);
		int north = context.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, pos.getX(), pos.getZ() - r);
		double gx = (east - west) / (2.0 * r);
		double gz = (south - north) / (2.0 * r);
		double slope = Math.sqrt(gx * gx + gz * gz);
		if (slope < this.minSlope || slope > this.maxSlope) {
			return false;
		}
		if (this.facing.isPresent()) {
			if (slope < 1.0E-3) {
				return false;
			}
			// the slope faces downhill
			double fx = -gx / slope;
			double fz = -gz / slope;
			Direction d = this.facing.get();
			double dot = fx * d.getStepX() + fz * d.getStepZ();
			return dot >= this.facingThreshold;
		}
		return true;
	}

	@Override
	public PlacementModifierType<?> type() {
		return EsPlacements.SLOPE;
	}
}
