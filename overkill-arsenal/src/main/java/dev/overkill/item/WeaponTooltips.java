package dev.overkill.item;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

import java.util.function.Consumer;

/** Shared tooltip formatting: a flavour line, then the controls. */
final class WeaponTooltips {
	private WeaponTooltips() {
	}

	static void add(Consumer<Component> tooltip, String key, int lines) {
		tooltip.accept(Component.translatable(key + ".flavor").withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.ITALIC));
		for (int i = 1; i <= lines; i++) {
			tooltip.accept(Component.translatable(key + ".line" + i).withStyle(ChatFormatting.GRAY));
		}
	}
}
