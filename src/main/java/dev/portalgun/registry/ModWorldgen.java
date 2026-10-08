package dev.portalgun.registry;

import com.mojang.serialization.MapCodec;
import dev.portalgun.PortalGunMod;
import dev.portalgun.world.density.CellDensityFunctions;
import dev.portalgun.world.density.SimpleDensityFunctions;
import dev.portalgun.world.feature.BoulderFeature;
import dev.portalgun.world.feature.CrystalClusterFeature;
import dev.portalgun.world.feature.GiantPlantFeature;
import dev.portalgun.world.feature.SpecTreeFeature;
import dev.portalgun.world.feature.SpireFeature;
import dev.portalgun.world.feature.StructureFeature;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.feature.Feature;

/**
 * Custom worldgen feature types and density function types used by the generated data packs
 * (contract: tools/gen/content/DESIGN.md).
 */
public final class ModWorldgen {
	public static final Feature<GiantPlantFeature.Config> GIANT_PLANT = feature("giant_plant", new GiantPlantFeature(GiantPlantFeature.Config.CODEC));
	public static final Feature<BoulderFeature.Config> BOULDER = feature("boulder", new BoulderFeature(BoulderFeature.Config.CODEC));
	public static final Feature<SpireFeature.Config> SPIRE = feature("spire", new SpireFeature(SpireFeature.Config.CODEC));
	public static final Feature<CrystalClusterFeature.Config> CRYSTAL_CLUSTER = feature("crystal_cluster",
		new CrystalClusterFeature(CrystalClusterFeature.Config.CODEC));
	public static final Feature<StructureFeature.Config> STRUCTURE = feature("structure", new StructureFeature(StructureFeature.Config.CODEC));
	public static final Feature<SpecTreeFeature.Config> TREE = feature("tree", new SpecTreeFeature(SpecTreeFeature.Config.CODEC));

	private ModWorldgen() {
	}

	private static <C extends net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration, F extends Feature<C>> F feature(
		String name, F feature) {
		return Registry.register(BuiltInRegistries.FEATURE, PortalGunMod.id(name), feature);
	}

	private static void densityFunction(String name, MapCodec<? extends DensityFunction> codec) {
		Registry.register(BuiltInRegistries.DENSITY_FUNCTION_TYPE, PortalGunMod.id(name), codec);
	}

	public static void init() {
		densityFunction("coord", SimpleDensityFunctions.Coord.DATA_CODEC);
		densityFunction("sine", SimpleDensityFunctions.Sine.DATA_CODEC);
		densityFunction("terrace", SimpleDensityFunctions.Terrace.DATA_CODEC);
		densityFunction("cell_shapes", CellDensityFunctions.CellShapes.DATA_CODEC);
		densityFunction("cell_pillars", CellDensityFunctions.CellPillars.DATA_CODEC);
		densityFunction("craters", CellDensityFunctions.Craters.DATA_CODEC);
		densityFunction("cells", CellDensityFunctions.Cells.DATA_CODEC);
	}
}
