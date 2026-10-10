package dev.overkill.client;

import dev.overkill.item.StormcallerGauntletItem;
import dev.overkill.registry.ModItems;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Flavour text and controls under each weapon's name. */
public final class WeaponTooltips {
	private WeaponTooltips() {
	}

	public static void register() {
		Map<Item, Integer> lineCounts = Map.of(
			ModItems.SUNLINE_RIFLE, 4,
			ModItems.WORLDBREAKER_CANNON, 4,
			ModItems.RIFTFANG_SCYTHE, 3,
			ModItems.STORMCALLER_GAUNTLET, 4,
			ModItems.GRAVEMAKER, 3);

		ItemTooltipCallback.EVENT.register((stack, context, flag, lines) -> {
			Integer count = lineCounts.get(stack.getItem());
			if (count == null) {
				return;
			}
			String key = stack.getItem().getDescriptionId();
			List<Component> extra = new ArrayList<>();
			if (stack.is(ModItems.STORMCALLER_GAUNTLET)) {
				extra.add(Component.translatable(key + ".charge", StormcallerGauntletItem.getCharge(stack), StormcallerGauntletItem.MAX_CHARGE)
					.withStyle(ChatFormatting.AQUA));
			}
			extra.add(Component.translatable(key + ".flavor").withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.ITALIC));
			for (int i = 1; i <= count; i++) {
				extra.add(Component.translatable(key + ".line" + i).withStyle(ChatFormatting.GRAY));
			}
			lines.addAll(Math.min(1, lines.size()), extra);
		});
	}
}
