package dev.visceral.registry;

import dev.visceral.Visceral;
import net.minecraft.core.registries.Registries;
import net.minecraft.tags.TagKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;

/** Data-pack tags that let modpacks tune which entities get which treatment. */
public final class VisceralTags {
	/** Entities that never lose balance (bosses, golem-like constructs...). */
	public static final TagKey<EntityType<?>> UNSHAKEABLE = entity("unshakeable");
	/** Heavy entities: much harder to stagger, kicks bounce off. */
	public static final TagKey<EntityType<?>> HEAVY = entity("heavy");
	/** Entities that never get physical reactions at all. */
	public static final TagKey<EntityType<?>> NO_PHYSICS = entity("no_physics");
	/** Mobs allowed to crawl when crippled. */
	public static final TagKey<EntityType<?>> CAN_CRAWL = entity("can_crawl");

	public static final TagKey<EntityType<?>> BLOOD_NONE = entity("blood/none");
	public static final TagKey<EntityType<?>> BLOOD_BONE = entity("blood/bone");
	public static final TagKey<EntityType<?>> BLOOD_GREEN = entity("blood/green");
	public static final TagKey<EntityType<?>> BLOOD_PURPLE = entity("blood/purple");
	public static final TagKey<EntityType<?>> BLOOD_DARK = entity("blood/dark");

	/** Items treated as heavy two-handed weapons (axe animations). */
	public static final TagKey<Item> HEAVY_WEAPONS = item("heavy_weapons");
	/** Items treated as blunt one-handed weapons (mace animations). */
	public static final TagKey<Item> BLUNT_WEAPONS = item("blunt_weapons");
	/** Items treated as polearms (thrust animations). */
	public static final TagKey<Item> POLEARMS = item("polearms");

	private VisceralTags() {
	}

	private static TagKey<EntityType<?>> entity(String path) {
		return TagKey.create(Registries.ENTITY_TYPE, Visceral.id(path));
	}

	private static TagKey<Item> item(String path) {
		return TagKey.create(Registries.ITEM, Visceral.id(path));
	}
}
