package net.abyssaldescent.item.relic;

import java.util.function.Consumer;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.item.GearItem;
import net.abyssaldescent.item.GearSpec;
import net.abyssaldescent.item.GearTooltips;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;

/** A passive charm. Keep it in the hotbar or off-hand to benefit; no buttons to press. */
public class RelicItem extends Item implements GearItem {
	private final GearSpec spec;
	private final RelicKind kind;

	public RelicItem(GearSpec spec, RelicKind kind, Properties properties) {
		super(properties.stacksTo(1));
		this.spec = spec;
		this.kind = kind;
	}

	public RelicKind kind() {
		return kind;
	}

	@Override
	public GearSpec spec() {
		return spec;
	}

	@Override
	public Component getName(ItemStack stack) {
		return GearTooltips.styledName(super.getName(stack), spec);
	}

	@Override
	@SuppressWarnings("deprecation")
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> out, TooltipFlag flag) {
		out.accept(Component.translatable("tooltip.abyssal_descent.rarity_kind", spec.rarity().displayName(),
			Component.translatable("kind.abyssal_descent.relic")).withStyle(spec.rarity().style()));
		String key = "relic." + AbyssalDescent.MOD_ID + "." + kind.name().toLowerCase();
		out.accept(Component.literal("◆ ").withColor(spec.rarity().color()).append(Component.translatable(key + ".name").withColor(spec.rarity().color())));
		out.accept(Component.literal("  ").append(Component.translatable(key)).withStyle(ChatFormatting.GRAY));
		out.accept(Component.translatable("tooltip.abyssal_descent.relic_hint").withStyle(ChatFormatting.DARK_AQUA));
		out.accept(Component.translatable(stack.getItem().getDescriptionId() + ".flavor").withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.ITALIC));
		if (spec.exclusive()) {
			out.accept(Component.translatable("tooltip.abyssal_descent.exclusive").withStyle(ChatFormatting.GOLD));
		}
	}
}
