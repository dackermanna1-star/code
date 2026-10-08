package dev.portalgun.dimension;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;

/** One entry on the portal gun's dial. */
public record Destination(
	Identifier id,
	String code,
	String name,
	String tagline,
	String description,
	int color,
	int danger,
	boolean vanilla
) {
	public ResourceKey<Level> key() {
		return ResourceKey.create(Registries.DIMENSION, this.id);
	}

	public String translationKey() {
		return "dimension." + this.id.getNamespace() + "." + this.id.getPath();
	}
}
