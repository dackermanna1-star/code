package dev.portalgun.registry;

import dev.portalgun.PortalGunMod;
import dev.portalgun.block.SpecBlocks;
import dev.portalgun.content.ContentSpec;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.registry.FlammableBlockRegistry;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.DoubleHighBlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.PlaceOnWaterBlockItem;
import net.minecraft.world.level.block.Block;
import org.jetbrains.annotations.Nullable;

/** Registers the dimension blocks described in the content spec. */
public final class ModBlocks {
	/** Every spec block, in spec order. */
	public static final List<Block> BLOCKS = new ArrayList<>();
	/** Block items shown in the creative "blocks" tab, in spec order. */
	public static final List<Item> ITEMS = new ArrayList<>();
	/** Blocks that hurt or otherwise make a spot unsafe to arrive on (data driven: data/portalgun/tags/block/hazards.json). */
	public static final TagKey<Block> HAZARDS = TagKey.create(Registries.BLOCK, PortalGunMod.id("hazards"));

	/** Spec blocks that form tree/mushroom canopies (log, leaves, mushroom_cap kinds): arrivals look below them for ground. */
	public static final java.util.Set<Block> CANOPY = new java.util.HashSet<>();

	private static final Map<String, Block> BY_ID = new LinkedHashMap<>();
	private static final Map<String, ContentSpec.BlockSpec> SPEC_BY_ID = new LinkedHashMap<>();

	private ModBlocks() {
	}

	public static void init() {
		for (ContentSpec.BlockSpec spec : ContentSpec.get().blocks) {
			if (spec.id == null || spec.id.isEmpty()) {
				PortalGunMod.LOGGER.error("Content spec block without id - skipped");
				continue;
			}
			if (BY_ID.containsKey(spec.id)) {
				PortalGunMod.LOGGER.error("Duplicate content spec block id {} - skipped", spec.id);
				continue;
			}
			ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, PortalGunMod.id(spec.id));
			Block block = SpecBlocks.create(spec, SpecBlocks.properties(spec).setId(key));
			Registry.register(BuiltInRegistries.BLOCK, key, block);
			BLOCKS.add(block);
			BY_ID.put(spec.id, block);
			SPEC_BY_ID.put(spec.id, spec);
			if ("log".equals(spec.kind) || "leaves".equals(spec.kind) || "mushroom_cap".equals(spec.kind)) {
				CANOPY.add(block);
			}

			ResourceKey<Item> itemKey = ResourceKey.create(Registries.ITEM, PortalGunMod.id(spec.id));
			Item.Properties props = new Item.Properties().setId(itemKey).useBlockDescriptionPrefix();
			Item item = switch (spec.kind == null ? "" : spec.kind) {
				case "tall_plant" -> new DoubleHighBlockItem(block, props);
				case "lily" -> new PlaceOnWaterBlockItem(block, props);
				default -> new BlockItem(block, props);
			};
			Registry.register(BuiltInRegistries.ITEM, itemKey, item);
			if (spec.creative) {
				ITEMS.add(item);
			}
			if (spec.flammable) {
				boolean plant = spec.kind != null && (SpecBlocks.isPlantKind(spec.kind) || "leaves".equals(spec.kind));
				FlammableBlockRegistry.getDefaultInstance().add(block, plant ? 60 : 5, plant ? 100 : 20);
			}
		}
	}

	public static @Nullable Block get(String id) {
		return BY_ID.get(id);
	}

	public static @Nullable ContentSpec.BlockSpec spec(String id) {
		return SPEC_BY_ID.get(id);
	}

	public static Map<String, Block> all() {
		return Collections.unmodifiableMap(BY_ID);
	}
}
