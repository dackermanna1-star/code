package net.earthscapes.worldgen.placement;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.earthscapes.registry.EsPlacements;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.placement.PlacementContext;
import net.minecraft.world.level.levelgen.placement.PlacementFilter;
import net.minecraft.world.level.levelgen.placement.PlacementModifierType;

/**
 * Passes only on hilltops: no ground within {@code radius} may be higher, and the summit must rise
 * at least {@code prominence} blocks above the ground at that distance. Ovoo cairns crown such
 * summits across Mongolia.
 */
public class LocalPeakFilter extends PlacementFilter {
	public static final MapCodec<LocalPeakFilter> CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		Codec.intRange(2, 15).optionalFieldOf("radius", 12).forGetter(f -> f.radius),
		Codec.intRange(0, 64).optionalFieldOf("prominence", 4).forGetter(f -> f.prominence)
	).apply(instance, LocalPeakFilter::new));

	private final int radius;
	private final int prominence;

	public LocalPeakFilter(int radius, int prominence) {
		this.radius = radius;
		this.prominence = prominence;
	}

	@Override
	protected boolean shouldPlace(PlacementContext context, RandomSource random, BlockPos pos) {
		int h = context.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, pos.getX(), pos.getZ());
		int lowest = Integer.MAX_VALUE;
		for (int dx = -this.radius; dx <= this.radius; dx += 2) {
			for (int dz = -this.radius; dz <= this.radius; dz += 2) {
				if (dx == 0 && dz == 0) {
					continue;
				}
				int other = context.getHeight(Heightmap.Types.OCEAN_FLOOR_WG, pos.getX() + dx, pos.getZ() + dz);
				if (other > h) {
					return false;
				}
				if (Math.abs(dx) >= this.radius - 1 || Math.abs(dz) >= this.radius - 1) {
					lowest = Math.min(lowest, other);
				}
			}
		}
		return h - lowest >= this.prominence;
	}

	@Override
	public PlacementModifierType<?> type() {
		return EsPlacements.LOCAL_PEAK;
	}
}
