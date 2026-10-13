package dev.calibercraft.registry;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.config.ServerConfig;
import java.util.Map;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.storage.loot.BuiltInLootTables;
import net.minecraft.world.level.storage.loot.LootPool;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.entries.NestedLootTable;
import net.minecraft.world.level.storage.loot.providers.number.ConstantValue;

/**
 * Optional loot integration: vanilla chests get one extra pool that references a CaliberCraft loot table
 * ({@code data/calibercraft/loot_table/inject/*.json}), so the actual contents stay data-driven.
 */
public final class ModLoot {
	public static final ResourceKey<LootTable> COMMON = key("inject/common");
	public static final ResourceKey<LootTable> MILITARY = key("inject/military");
	public static final ResourceKey<LootTable> RARE = key("inject/rare");

	private static final Map<ResourceKey<LootTable>, ResourceKey<LootTable>> TARGETS = Map.ofEntries(
		Map.entry(BuiltInLootTables.SIMPLE_DUNGEON, COMMON),
		Map.entry(BuiltInLootTables.ABANDONED_MINESHAFT, COMMON),
		Map.entry(BuiltInLootTables.SHIPWRECK_SUPPLY, COMMON),
		Map.entry(BuiltInLootTables.BURIED_TREASURE, COMMON),
		Map.entry(BuiltInLootTables.VILLAGE_WEAPONSMITH, MILITARY),
		Map.entry(BuiltInLootTables.PILLAGER_OUTPOST, MILITARY),
		Map.entry(BuiltInLootTables.STRONGHOLD_CORRIDOR, MILITARY),
		Map.entry(BuiltInLootTables.DESERT_PYRAMID, MILITARY),
		Map.entry(BuiltInLootTables.JUNGLE_TEMPLE, MILITARY),
		Map.entry(BuiltInLootTables.ANCIENT_CITY, RARE),
		Map.entry(BuiltInLootTables.WOODLAND_MANSION, RARE),
		Map.entry(BuiltInLootTables.BASTION_OTHER, RARE),
		Map.entry(BuiltInLootTables.TRIAL_CHAMBERS_REWARD, RARE));

	private ModLoot() {
	}

	private static ResourceKey<LootTable> key(String path) {
		return ResourceKey.create(Registries.LOOT_TABLE, CaliberCraft.id(path));
	}

	public static void init() {
		LootTableEvents.MODIFY.register((key, builder, source, registries) -> {
			if (!source.isBuiltin() || !ServerConfig.get().lootInjection) {
				return;
			}
			ResourceKey<LootTable> inject = TARGETS.get(key);
			if (inject != null) {
				builder.withPool(LootPool.lootPool().setRolls(ConstantValue.exactly(1)).add(NestedLootTable.lootTableReference(inject)));
			}
		});
	}
}
