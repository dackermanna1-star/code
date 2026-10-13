package dev.calibercraft.client;

import dev.calibercraft.client.screen.GunsmithScreenAccess;
import dev.calibercraft.core.FireMode;
import dev.calibercraft.core.Stat;
import dev.calibercraft.core.WeaponStats;
import dev.calibercraft.data.AmmoDefinition;
import dev.calibercraft.data.AttachmentDefinition;
import dev.calibercraft.data.CaliberData;
import dev.calibercraft.data.WeaponDefinition;
import dev.calibercraft.item.AmmoItem;
import dev.calibercraft.item.AttachmentItem;
import dev.calibercraft.item.FirearmItem;
import dev.calibercraft.item.WeaponStacks;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.ChatFormatting;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;

/** Client-side tooltips built from the synced definitions. */
public final class Tooltips {
	private Tooltips() {
	}

	public static void append(ItemStack stack, Item.TooltipContext ctx, TooltipFlag flag, List<Component> lines) {
		CaliberData data = ClientGunData.data();
		Item item = stack.getItem();
		if (item instanceof FirearmItem f) {
			weapon(stack, f, data, lines);
		} else if (item instanceof AttachmentItem a) {
			attachment(a, data, lines);
		} else if (item instanceof AmmoItem) {
			ammo(stack, data, lines);
		}
	}

	private static Component name(Identifier id, String prefix) {
		return Component.translatable(prefix + id.getPath());
	}

	private static void weapon(ItemStack stack, FirearmItem f, CaliberData data, List<Component> lines) {
		Optional<WeaponDefinition> od = data.weapon(f.weaponId());
		if (od.isEmpty()) {
			lines.add(Component.translatable("calibercraft.tooltip.no_definition").withStyle(ChatFormatting.DARK_RED));
			return;
		}
		WeaponDefinition def = od.get();
		WeaponStats s = WeaponStacks.stats(stack, data).orElseThrow();
		var state = WeaponStacks.state(stack);
		lines.add(Component.translatable("calibercraft.category." + def.category().getSerializedName())
			.append(" · ").append(name(def.caliber(), "calibercraft.caliber.")).withStyle(ChatFormatting.GRAY));
		MutableComponent modes = Component.empty();
		for (int i = 0; i < def.fireModes().size(); i++) {
			FireMode m = def.fireModes().get(i);
			if (i > 0) {
				modes.append(" / ");
			}
			modes.append(Component.translatable("calibercraft.fire_mode." + m.getSerializedName()));
		}
		lines.add(Component.translatable("calibercraft.tooltip.modes", modes).withStyle(ChatFormatting.DARK_GRAY));
		int pellets = s.i(Stat.PELLETS);
		String dmg = pellets > 1 ? String.format("%.1f × %d", s.get(Stat.DAMAGE), pellets) : String.format("%.1f", s.get(Stat.DAMAGE));
		lines.add(Component.translatable("calibercraft.tooltip.damage", dmg).withStyle(ChatFormatting.BLUE));
		lines.add(Component.translatable("calibercraft.tooltip.rpm", (int) s.get(Stat.RPM)).withStyle(ChatFormatting.BLUE));
		lines.add(Component.translatable("calibercraft.tooltip.ammo", state.total(), s.i(Stat.MAGAZINE)).withStyle(ChatFormatting.BLUE));
		if (net.minecraft.client.Minecraft.getInstance().hasShiftDown()) {
			lines.add(Component.translatable("calibercraft.tooltip.range", (int) s.get(Stat.EFFECTIVE_RANGE), (int) s.get(Stat.MAX_RANGE))
				.withStyle(ChatFormatting.DARK_AQUA));
			lines.add(Component.translatable("calibercraft.tooltip.recoil", String.format("%.1f", s.get(Stat.RECOIL_VERTICAL)),
				String.format("%.1f", s.get(Stat.RECOIL_HORIZONTAL))).withStyle(ChatFormatting.DARK_AQUA));
			lines.add(Component.translatable("calibercraft.tooltip.spread", String.format("%.2f", s.get(Stat.SPREAD_HIP)),
				String.format("%.2f", s.get(Stat.SPREAD_ADS))).withStyle(ChatFormatting.DARK_AQUA));
			lines.add(Component.translatable("calibercraft.tooltip.velocity", (int) Math.round(s.get(Stat.VELOCITY) * 20)).withStyle(ChatFormatting.DARK_AQUA));
			lines.add(Component.translatable("calibercraft.tooltip.handling", String.format("%.2f", s.get(Stat.ADS_TIME) / 20.0),
				String.format("%.0f", s.get(Stat.MOVE_SPEED) * 100)).withStyle(ChatFormatting.DARK_AQUA));
			for (Map.Entry<dev.calibercraft.data.AttachmentSlot, Identifier> e : WeaponStacks.loadout(stack).slots().entrySet()) {
				lines.add(Component.translatable(e.getKey().translationKey()).append(": ")
					.append(Component.translatable("item." + e.getValue().getNamespace() + "." + e.getValue().getPath())).withStyle(ChatFormatting.GOLD));
			}
		} else {
			lines.add(Component.translatable("calibercraft.tooltip.shift").withStyle(ChatFormatting.DARK_GRAY));
		}
		Identifier skin = WeaponStacks.skin(stack);
		if (!skin.equals(WeaponStacks.STANDARD_SKIN)) {
			var sd = data.skins().get(skin);
			lines.add(Component.translatable("calibercraft.tooltip.skin", Component.translatable("calibercraft.skin." + skin.getPath()))
				.withColor(sd == null ? 0xAAAAAA : sd.rarity().color));
		}
	}

	private static void attachment(AttachmentItem item, CaliberData data, List<Component> lines) {
		Optional<AttachmentDefinition> ad = data.attachment(item.attachmentId());
		if (ad.isEmpty()) {
			return;
		}
		lines.add(Component.translatable(ad.get().slot().translationKey()).withStyle(ChatFormatting.GRAY));
		List<Component> effects = GunsmithScreenAccess.describe(ad.get().modifiers());
		lines.addAll(effects);
		if (ad.get().modifiers().isEmpty()) {
			lines.add(Component.translatable("calibercraft.gunsmith.cosmetic").withStyle(ChatFormatting.DARK_GRAY));
		}
		List<String> users = new ArrayList<>();
		data.weapons().forEach((id, w) -> {
			if (w.allows(ad.get().slot(), item.attachmentId())) {
				users.add(Component.translatable("item." + id.getNamespace() + "." + id.getPath()).getString());
			}
		});
		users.sort(String::compareTo);
		if (!users.isEmpty()) {
			lines.add(Component.translatable("calibercraft.tooltip.fits", String.join(", ", users)).withStyle(ChatFormatting.DARK_GRAY));
		}
	}

	private static void ammo(ItemStack stack, CaliberData data, List<Component> lines) {
		Optional<Identifier> id = data.ammoForItem(BuiltInRegistries.ITEM.getKey(stack.getItem()));
		if (id.isEmpty()) {
			return;
		}
		AmmoDefinition a = data.ammo().get(id.get());
		lines.add(name(a.caliber(), "calibercraft.caliber.").copy().withStyle(ChatFormatting.GRAY));
		lines.addAll(GunsmithScreenAccess.describe(a.modifiers()));
		if (a.fireSeconds() > 0) {
			lines.add(Component.translatable("calibercraft.tooltip.incendiary", a.fireSeconds()).withStyle(ChatFormatting.GOLD));
		}
		List<String> users = new ArrayList<>();
		data.weapons().forEach((wid, w) -> {
			if (w.caliber().equals(a.caliber())) {
				users.add(Component.translatable("item." + wid.getNamespace() + "." + wid.getPath()).getString());
			}
		});
		users.sort(String::compareTo);
		if (!users.isEmpty()) {
			lines.add(Component.translatable("calibercraft.tooltip.used_by", String.join(", ", users)).withStyle(ChatFormatting.DARK_GRAY));
		}
	}
}
