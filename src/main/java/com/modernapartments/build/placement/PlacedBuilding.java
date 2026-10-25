package com.modernapartments.build.placement;

import com.modernapartments.build.ComplexType;
import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.UUID;
import net.minecraft.core.UUIDUtil;

/** Record of a building placed with a blueprint or command (persisted per dimension). */
public record PlacedBuilding(UUID id, String type, long seed, PlacementTransform transform, long placedAt) {
	public static final Codec<PlacedBuilding> CODEC = RecordCodecBuilder.create(i -> i.group(
		UUIDUtil.CODEC.fieldOf("id").forGetter(PlacedBuilding::id),
		Codec.STRING.fieldOf("type").forGetter(PlacedBuilding::type),
		Codec.LONG.fieldOf("seed").forGetter(PlacedBuilding::seed),
		PlacementTransform.CODEC.fieldOf("transform").forGetter(PlacedBuilding::transform),
		Codec.LONG.fieldOf("placed_at").forGetter(PlacedBuilding::placedAt)
	).apply(i, PlacedBuilding::new));

	public ComplexType complexType() {
		ComplexType t = ComplexType.byId(type);
		return t == null ? ComplexType.METROPOLITAN : t;
	}

	public boolean contains(int x, int y, int z) {
		return transform.inFootprint(x, z) && y >= transform.min().getY() - 2
			&& y < transform.min().getY() + transform.sizeY() + 2;
	}
}
