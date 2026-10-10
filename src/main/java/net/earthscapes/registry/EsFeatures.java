package net.earthscapes.registry;

import net.earthscapes.Earthscapes;
import net.earthscapes.worldgen.feature.BaobabFeature;
import net.earthscapes.worldgen.feature.BoulderClusterFeature;
import net.earthscapes.worldgen.feature.CandelabraFeature;
import net.earthscapes.worldgen.feature.CecropiaFeature;
import net.earthscapes.worldgen.feature.GerFeature;
import net.earthscapes.worldgen.feature.GroundCoverFeature;
import net.earthscapes.worldgen.feature.HoodooFeature;
import net.earthscapes.worldgen.feature.KapokFeature;
import net.earthscapes.worldgen.feature.LarchFeature;
import net.earthscapes.worldgen.feature.OvooFeature;
import net.earthscapes.worldgen.feature.PalmFeature;
import net.earthscapes.worldgen.feature.RainforestTreeFeature;
import net.earthscapes.worldgen.feature.ShrubFeature;
import net.earthscapes.worldgen.feature.SurfaceSmoothingFeature;
import net.earthscapes.worldgen.feature.TermiteMoundFeature;
import net.earthscapes.worldgen.feature.UmbrellaTreeFeature;
import net.earthscapes.worldgen.feature.VictoriaLilyFeature;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.levelgen.feature.Feature;
import net.minecraft.world.level.levelgen.feature.configurations.FeatureConfiguration;
import net.minecraft.world.level.levelgen.feature.configurations.NoneFeatureConfiguration;

public final class EsFeatures {
	public static final Feature<UmbrellaTreeFeature.Config> UMBRELLA_TREE = register("umbrella_tree", new UmbrellaTreeFeature(UmbrellaTreeFeature.Config.CODEC));
	public static final Feature<BaobabFeature.Config> BAOBAB = register("baobab", new BaobabFeature(BaobabFeature.Config.CODEC));
	public static final Feature<CandelabraFeature.Config> CANDELABRA = register("candelabra", new CandelabraFeature(CandelabraFeature.Config.CODEC));
	public static final Feature<KapokFeature.Config> EMERGENT_TREE = register("emergent_tree", new KapokFeature(KapokFeature.Config.CODEC));
	public static final Feature<RainforestTreeFeature.Config> BROADLEAF_TREE = register("broadleaf_tree", new RainforestTreeFeature(RainforestTreeFeature.Config.CODEC));
	public static final Feature<PalmFeature.Config> PALM = register("palm", new PalmFeature(PalmFeature.Config.CODEC));
	public static final Feature<CecropiaFeature.Config> CECROPIA = register("cecropia", new CecropiaFeature(CecropiaFeature.Config.CODEC));
	public static final Feature<LarchFeature.Config> LARCH = register("larch", new LarchFeature(LarchFeature.Config.CODEC));
	public static final Feature<ShrubFeature.Config> SHRUB = register("shrub", new ShrubFeature(ShrubFeature.Config.CODEC));
	public static final Feature<TermiteMoundFeature.Config> TERMITE_MOUND = register("termite_mound", new TermiteMoundFeature(TermiteMoundFeature.Config.CODEC));
	public static final Feature<BoulderClusterFeature.Config> BOULDERS = register("boulders", new BoulderClusterFeature(BoulderClusterFeature.Config.CODEC));
	public static final Feature<HoodooFeature.Config> HOODOO = register("hoodoo", new HoodooFeature(HoodooFeature.Config.CODEC));
	public static final Feature<VictoriaLilyFeature.Config> VICTORIA_LILIES = register("victoria_lilies", new VictoriaLilyFeature(VictoriaLilyFeature.Config.CODEC));
	public static final Feature<SurfaceSmoothingFeature.Config> SURFACE_SMOOTHING = register("surface_smoothing", new SurfaceSmoothingFeature(SurfaceSmoothingFeature.Config.CODEC));
	public static final Feature<GroundCoverFeature.Config> GROUND_COVER = register("ground_cover", new GroundCoverFeature(GroundCoverFeature.Config.CODEC));
	public static final Feature<NoneFeatureConfiguration> OVOO = register("ovoo", new OvooFeature(NoneFeatureConfiguration.CODEC));
	public static final Feature<NoneFeatureConfiguration> GER = register("ger", new GerFeature(NoneFeatureConfiguration.CODEC));

	private EsFeatures() {
	}

	public static void init() {
	}

	private static <C extends FeatureConfiguration, F extends Feature<C>> F register(String name, F feature) {
		return Registry.register(BuiltInRegistries.FEATURE, Earthscapes.id(name), feature);
	}
}
