package net.abyssaldescent.registry;

import net.abyssaldescent.dungeon.loot.LootRoller;
import net.abyssaldescent.dungeon.run.Unsecured;
import net.abyssaldescent.world.DungeonCoords;
import net.abyssaldescent.world.DungeonDimension;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.loot.parameters.LootContextParams;
import net.minecraft.world.phys.Vec3;

/**
 * Every loot-table drop generated inside the dungeon (mobs, urns) is tagged as unsecured loot of its run; enemy coin drops
 * follow the configured coins-per-enemy range.
 */
public final class ModLoot {
	private ModLoot() {
	}

	public static void init() {
		LootTableEvents.MODIFY_DROPS.register((table, context, drops) -> {
			LootRoller.applyCoinsPerEnemy(table, context, drops);
			if (!DungeonDimension.isDungeon(context.getLevel())) {
				return;
			}
			Vec3 origin = context.getOptionalParameter(LootContextParams.ORIGIN);
			if (origin == null) {
				return;
			}
			long runId = DungeonCoords.slotOf((int) Math.floor(origin.x));
			for (ItemStack stack : drops) {
				Unsecured.tag(stack, runId);
			}
		});
	}
}
