package dev.portalgun.registry;

import dev.portalgun.PortalGunMod;
import dev.portalgun.content.ContentSpec;
import dev.portalgun.dimension.Destinations;
import dev.portalgun.item.PortalFluidItem;
import dev.portalgun.item.PortalGunItem;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.item.component.Consumables;
import net.minecraft.world.item.consume_effects.ApplyStatusEffectsConsumeEffect;

public final class ModItems {
	public static final Item PORTAL_GUN = register("portal_gun", PortalGunItem::new, new Item.Properties()
		.stacksTo(1)
		.rarity(Rarity.EPIC)
		.fireResistant()
		.component(ModComponents.DESTINATION, Destinations.HOME)
		.component(ModComponents.CHARGES, PortalGunItem.START_CHARGES));
	public static final Item PORTAL_FLUID = register("portal_fluid", PortalFluidItem::new, new Item.Properties()
		.stacksTo(16)
		.rarity(Rarity.UNCOMMON));

	/** Creature drops, foods and materials described by the content spec, in spec order. */
	public static final List<Item> SPEC_ITEMS = new ArrayList<>();

	private ModItems() {
	}

	public static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties props) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, PortalGunMod.id(name));
		return Registry.register(BuiltInRegistries.ITEM, key, factory.apply(props.setId(key)));
	}

	public static void init() {
		for (ContentSpec.ItemSpec spec : ContentSpec.get().items) {
			Item.Properties props = new Item.Properties().stacksTo(spec.stack);
			props.rarity(switch (spec.rarity) {
				case "uncommon" -> Rarity.UNCOMMON;
				case "rare" -> Rarity.RARE;
				case "epic" -> Rarity.EPIC;
				default -> Rarity.COMMON;
			});
			if (spec.glint) {
				props.component(DataComponents.ENCHANTMENT_GLINT_OVERRIDE, true);
			}
			if (spec.food != null) {
				FoodProperties.Builder food = new FoodProperties.Builder().nutrition(spec.food.nutrition).saturationModifier(spec.food.saturation);
				if (spec.food.always) {
					food.alwaysEdible();
				}
				Consumable.Builder consumable = Consumables.defaultFood();
				if (spec.food.fast) {
					consumable.consumeSeconds(0.8F);
				}
				for (ContentSpec.EffectSpec e : spec.food.effects) {
					MobEffectInstance instance = effect(e);
					if (instance != null) {
						consumable.onConsume(new ApplyStatusEffectsConsumeEffect(instance, e.chance));
					}
				}
				props.food(food.build(), consumable.build());
			}
			SPEC_ITEMS.add(register(spec.id, Item::new, props));
		}
	}

	public static MobEffectInstance effect(ContentSpec.EffectSpec e) {
		if (e == null || e.id == null) {
			return null;
		}
		Identifier id = Identifier.tryParse(e.id);
		if (id == null) {
			return null;
		}
		return BuiltInRegistries.MOB_EFFECT.get(id)
			.map(h -> new MobEffectInstance(h, e.duration, e.amplifier))
			.orElseGet(() -> {
				PortalGunMod.LOGGER.warn("Unknown effect {}", e.id);
				return null;
			});
	}

	@SuppressWarnings("unused")
	private static MobEffect unused() {
		return null;
	}
}
