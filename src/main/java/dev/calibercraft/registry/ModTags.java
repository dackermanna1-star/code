package dev.calibercraft.registry;

import dev.calibercraft.CaliberCraft;
import net.minecraft.core.registries.Registries;
import net.minecraft.tags.TagKey;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.block.Block;
import net.minecraft.resources.ResourceKey;

public final class ModTags {
	/** Blocks that still react to right-click while holding a weapon (doors, chests, the gunsmith bench...). */
	public static final TagKey<Block> GUN_INTERACTABLE = TagKey.create(Registries.BLOCK, CaliberCraft.id("gun_interactable"));
	/** Blocks bullets shatter when glass breaking is enabled. */
	public static final TagKey<Block> SHATTERABLE = TagKey.create(Registries.BLOCK, CaliberCraft.id("shatterable"));
	/** Blocks that never stop a bullet (foliage, plants...). */
	public static final TagKey<Block> BULLET_PASSABLE = TagKey.create(Registries.BLOCK, CaliberCraft.id("bullet_passable"));
	/** Hard surfaces that can ricochet bullets. */
	public static final TagKey<Block> RICOCHET_SURFACES = TagKey.create(Registries.BLOCK, CaliberCraft.id("ricochet_surfaces"));
	/** Entities without a meaningful head hitbox. */
	public static final TagKey<EntityType<?>> NO_HEADSHOT = TagKey.create(Registries.ENTITY_TYPE, CaliberCraft.id("no_headshot"));

	public static final ResourceKey<DamageType> BULLET = ResourceKey.create(Registries.DAMAGE_TYPE, CaliberCraft.id("bullet"));

	private ModTags() {
	}
}
