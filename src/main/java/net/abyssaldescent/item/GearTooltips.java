package net.abyssaldescent.item;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.dungeon.loot.Rarity;
import net.abyssaldescent.item.armor.ArmorSets;
import net.abyssaldescent.item.effect.WeaponEffect;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;

/** Builds the consistent tooltip layout shared by all dungeon gear. */
public final class GearTooltips {
	private GearTooltips() {
	}

	public static Component styledName(Component base, GearSpec spec) {
		return base.copy().withStyle(spec.rarity().style());
	}

	public static void append(ItemStack stack, GearSpec spec, Consumer<Component> out) {
		Rarity rarity = spec.rarity();
		out.accept(Component.translatable("tooltip.abyssal_descent.rarity_kind", rarity.displayName(),
			Component.translatable("kind." + AbyssalDescent.MOD_ID + "." + spec.kind())).withStyle(rarity.style()));
		List<Component> lines = new ArrayList<>();
		for (WeaponEffect effect : spec.effects()) {
			effect.describe(lines, rarity.color());
		}
		lines.forEach(out);
		if (spec.set() != null) {
			ArmorSets.appendSetTooltip(stack, spec.set(), out);
		}
		String flavorKey = stack.getItem().getDescriptionId() + ".flavor";
		out.accept(Component.translatable(flavorKey).withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.ITALIC));
		if (spec.exclusive()) {
			out.accept(Component.translatable("tooltip.abyssal_descent.exclusive").withStyle(ChatFormatting.GOLD));
		}
	}
}
