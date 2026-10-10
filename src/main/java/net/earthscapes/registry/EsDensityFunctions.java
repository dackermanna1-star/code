package net.earthscapes.registry;

import com.mojang.serialization.MapCodec;
import net.earthscapes.Earthscapes;
import net.earthscapes.worldgen.density.CellBumps;
import net.earthscapes.worldgen.density.DuneRidges;
import net.earthscapes.worldgen.density.ErodedNoise;
import net.earthscapes.worldgen.density.Terrace;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.levelgen.DensityFunction;

public final class EsDensityFunctions {
	private EsDensityFunctions() {
	}

	public static void init() {
		register("dune_ridges", DuneRidges.DATA_CODEC);
		register("eroded_noise", ErodedNoise.DATA_CODEC);
		register("terrace", Terrace.DATA_CODEC);
		register("cell_bumps", CellBumps.DATA_CODEC);
	}

	private static void register(String name, MapCodec<? extends DensityFunction> codec) {
		Registry.register(BuiltInRegistries.DENSITY_FUNCTION_TYPE, Earthscapes.id(name), codec);
	}
}
