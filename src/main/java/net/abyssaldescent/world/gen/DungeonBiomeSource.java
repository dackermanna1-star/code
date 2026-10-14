package net.abyssaldescent.world.gen;

import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.stream.Stream;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.world.DungeonCoords;
import net.minecraft.core.Holder;
import net.minecraft.core.QuartPos;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.biome.Climate;

/** One biome per zone, chosen by the floor band; each biome carries the zone's fog, particles, ambience and music. */
public final class DungeonBiomeSource extends BiomeSource {
	public static final MapCodec<DungeonBiomeSource> CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		Biome.CODEC.fieldOf("void").forGetter(s -> s.voidBiome),
		Biome.CODEC.listOf().fieldOf("zones").forGetter(s -> s.zones)
	).apply(instance, instance.stable(DungeonBiomeSource::new)));

	private final Holder<Biome> voidBiome;
	private final List<Holder<Biome>> zones;

	public DungeonBiomeSource(Holder<Biome> voidBiome, List<Holder<Biome>> zones) {
		this.voidBiome = voidBiome;
		this.zones = List.copyOf(zones);
	}

	@Override
	protected MapCodec<? extends BiomeSource> codec() {
		return CODEC;
	}

	@Override
	protected Stream<Holder<Biome>> collectPossibleBiomes() {
		return Stream.concat(Stream.of(voidBiome), zones.stream());
	}

	@Override
	public Holder<Biome> getNoiseBiome(int quartX, int quartY, int quartZ, Climate.Sampler sampler) {
		int floor = DungeonCoords.floorOf(QuartPos.toBlock(quartZ));
		if (floor < 1 || floor > Zone.MAX_FLOOR || zones.isEmpty()) {
			return voidBiome;
		}
		int index = Zone.forFloor(floor).ordinal();
		return zones.get(Math.min(index, zones.size() - 1));
	}
}
