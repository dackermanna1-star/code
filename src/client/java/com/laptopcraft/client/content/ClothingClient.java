package com.laptopcraft.client.content;

import com.laptopcraft.content.ClothingContent;
import java.util.HashSet;
import java.util.Set;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;

/**
 * Client-only setup for clothing: a short flavour line under every wearable's name.
 * (Item tints and the GUI-vs-3D model switch are data driven, see {@code assets/laptopcraft/items/}.)
 */
public final class ClothingClient {
	private ClothingClient() {
	}

	public static void init() {
		Set<Item> wearables = new HashSet<>(ClothingContent.items());
		ItemTooltipCallback.EVENT.register((stack, context, flag, lines) -> {
			if (!wearables.contains(stack.getItem())) {
				return;
			}
			String key = BuiltInRegistries.ITEM.getKey(stack.getItem()).toLanguageKey("item", "desc");
			lines.add(Math.min(1, lines.size()), Component.translatable(key).withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
		});
	}
}
