package net.earthscapes.registry;

import com.mojang.serialization.MapCodec;
import net.earthscapes.Earthscapes;
import net.earthscapes.worldgen.placement.LocalPeakFilter;
import net.earthscapes.worldgen.placement.SlopeFilter;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.levelgen.placement.PlacementModifier;
import net.minecraft.world.level.levelgen.placement.PlacementModifierType;

public final class EsPlacements {
	public static final PlacementModifierType<SlopeFilter> SLOPE = register("slope", SlopeFilter.CODEC);
	public static final PlacementModifierType<LocalPeakFilter> LOCAL_PEAK = register("local_peak", LocalPeakFilter.CODEC);

	private EsPlacements() {
	}

	public static void init() {
	}

	private static <P extends PlacementModifier> PlacementModifierType<P> register(String name, MapCodec<P> codec) {
		return Registry.register(BuiltInRegistries.PLACEMENT_MODIFIER_TYPE, Earthscapes.id(name), () -> codec);
	}
}
