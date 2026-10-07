package com.laptopcraft.item.food;

import com.laptopcraft.registry.Reg;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import net.minecraft.ChatFormatting;
import net.minecraft.core.HolderSet;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.item.component.Consumables;
import net.minecraft.world.item.component.ItemLore;
import net.minecraft.world.item.consume_effects.ApplyStatusEffectsConsumeEffect;
import net.minecraft.world.item.consume_effects.RemoveStatusEffectsConsumeEffect;
import net.minecraft.world.item.consume_effects.TeleportRandomlyConsumeEffect;

/**
 * Every LaptopCraft food and drink. Items get a gray flavor-text lore line
 * ({@code item.laptopcraft.<id>.desc}) so they are fun to hover even outside Ender Eats.
 */
public final class FoodItems {
	private static final int SECOND = 20;

	// ---- Pigstep Pizza ----------------------------------------------------------------------------
	public static final Item PIZZA_SLICE = food("pizza_slice", food(4, 0.5F), eat(1.2F), 64);
	public static final Item PEPPERONI_PIZZA = register("pepperoni_pizza", p -> new WholePizzaItem(p, () -> FoodItems.PIZZA_SLICE, 4),
			props(food(16, 0.6F), eat(3.2F), 16), true);
	public static final Item SPAGHETTI = register("spaghetti", Item::new, props(food(9, 0.7F), eat(2.0F), 16).usingConvertsTo(Items.BOWL), false);

	// ---- The Nether Grill -------------------------------------------------------------------------
	public static final Item CHEESEBURGER = food("cheeseburger", food(9, 0.75F), eat(1.8F), 64);
	public static final Item FRIES = food("fries", food(4, 0.4F), eat(1.0F), 64);
	public static final Item HOT_DOG = food("hot_dog", food(6, 0.6F), eat(1.6F), 64);
	public static final Item BLAZE_HOT_WINGS = food("blaze_hot_wings", food(6, 0.6F),
			eat(1.6F).onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(MobEffects.FIRE_RESISTANCE, 20 * SECOND, 0))), 64);
	public static final Item FRIED_CHICKEN_BUCKET = food("fried_chicken_bucket", food(14, 0.7F), eat(3.0F), 16);

	// ---- Taco Blaze -------------------------------------------------------------------------------
	public static final Item TACO = food("taco", food(6, 0.6F), eat(1.2F), 64);
	public static final Item BURRITO = food("burrito", food(8, 0.7F), eat(2.0F), 64);
	public static final Item NACHOS = food("nachos", food(5, 0.4F), eat(1.2F), 64);

	// ---- Sushi Sea --------------------------------------------------------------------------------
	public static final Item SUSHI_ROLL = food("sushi_roll", food(3, 0.6F), eat(0.8F), 64);
	public static final Item SALMON_NIGIRI = food("salmon_nigiri", food(4, 0.8F),
			eat(0.8F).onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(MobEffects.WATER_BREATHING, 15 * SECOND, 0))), 64);

	// ---- Ramen Ravine -----------------------------------------------------------------------------
	public static final Item RAMEN_BOWL = register("ramen_bowl", Item::new, props(food(10, 0.8F),
			eat(2.0F).onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(MobEffects.REGENERATION, 5 * SECOND, 0))), 16)
			.usingConvertsTo(Items.BOWL), false);
	public static final Item DUMPLINGS = food("dumplings", food(5, 0.6F), eat(1.2F), 64);

	// ---- Sweet Berry Bakery -----------------------------------------------------------------------
	public static final Item PANCAKES = food("pancakes", food(7, 0.6F), eat(1.8F), 64);
	public static final Item CROISSANT = food("croissant", food(5, 0.5F), eat(1.2F), 64);
	public static final Item DONUT = food("donut", food(4, 0.3F), eat(1.0F), 64);
	public static final Item CUPCAKE = food("cupcake", food(4, 0.3F), eat(1.2F), 64);
	public static final Item ICE_CREAM_CONE = food("ice_cream_cone", food(4, 0.3F),
			eat(1.2F).onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(MobEffects.SLOWNESS, 3 * SECOND, 0), 0.25F)), 64);
	public static final Item GOLDEN_APPLE_PIE = register("golden_apple_pie", Item::new, props(food(8, 0.9F),
			eat(2.0F).onConsume(new ApplyStatusEffectsConsumeEffect(List.of(
					new MobEffectInstance(MobEffects.ABSORPTION, 60 * SECOND, 0),
					new MobEffectInstance(MobEffects.REGENERATION, 4 * SECOND, 0)))), 64).rarity(Rarity.UNCOMMON), false);
	public static final Item CHORUS_COOKIE = food("chorus_cookie", alwaysEdible(2, 0.2F),
			eat(1.0F).onConsume(new TeleportRandomlyConsumeEffect(8.0F)), 64);

	// ---- Drinks -----------------------------------------------------------------------------------
	public static final Item MILKSHAKE = register("milkshake", Item::new, props(food(6, 0.4F),
			drink(1.6F).onConsume(new RemoveStatusEffectsConsumeEffect(HolderSet.direct(
					MobEffects.POISON, MobEffects.HUNGER, MobEffects.NAUSEA, MobEffects.SLOWNESS,
					MobEffects.WEAKNESS, MobEffects.MINING_FATIGUE, MobEffects.BLINDNESS, MobEffects.DARKNESS))), 16)
			.usingConvertsTo(Items.GLASS_BOTTLE), false);
	public static final Item COLA_CAN = food("cola_can", alwaysEdible(2, 0.2F),
			drink(1.2F).onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(MobEffects.JUMP_BOOST, 15 * SECOND, 0))), 16);
	public static final Item ICED_COFFEE = register("iced_coffee", Item::new, props(alwaysEdible(3, 0.3F),
			drink(1.6F).onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(MobEffects.SPEED, 30 * SECOND, 0))), 16)
			.usingConvertsTo(Items.GLASS_BOTTLE), false);
	public static final Item REDSTONE_RUSH_ENERGY_DRINK = register("redstone_rush_energy_drink", Item::new, props(alwaysEdible(2, 0.1F),
			drink(1.2F).onConsume(new ApplyStatusEffectsConsumeEffect(List.of(
					new MobEffectInstance(MobEffects.SPEED, 30 * SECOND, 0),
					new MobEffectInstance(MobEffects.HASTE, 30 * SECOND, 1)))), 16).rarity(Rarity.UNCOMMON), false);
	public static final Item SWEET_BERRY_SMOOTHIE = register("sweet_berry_smoothie", Item::new, props(food(5, 0.5F),
			drink(1.6F).onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(MobEffects.REGENERATION, 4 * SECOND, 0))), 16)
			.usingConvertsTo(Items.GLASS_BOTTLE), false);

	private FoodItems() {
	}

	/** Forces class initialization (and therefore registration) during mod init. */
	public static void init() {
	}

	// ---- helpers ----------------------------------------------------------------------------------

	private static FoodProperties food(int nutrition, float saturationModifier) {
		return new FoodProperties.Builder().nutrition(nutrition).saturationModifier(saturationModifier).build();
	}

	private static FoodProperties alwaysEdible(int nutrition, float saturationModifier) {
		return new FoodProperties.Builder().nutrition(nutrition).saturationModifier(saturationModifier).alwaysEdible().build();
	}

	private static Consumable.Builder eat(float seconds) {
		return Consumables.defaultFood().consumeSeconds(seconds);
	}

	private static Consumable.Builder drink(float seconds) {
		return Consumables.defaultDrink().consumeSeconds(seconds);
	}

	private static Item.Properties props(FoodProperties food, Consumable.Builder consumable, int stackSize) {
		return new Item.Properties().food(food, consumable.build()).stacksTo(stackSize);
	}

	private static Item food(String name, FoodProperties food, Consumable.Builder consumable, int stackSize) {
		return register(name, Item::new, props(food, consumable, stackSize), false);
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties, boolean extraHint) {
		List<Component> lore = new ArrayList<>();
		lore.add(Component.translatable("item.laptopcraft." + name + ".desc").withStyle(ChatFormatting.GRAY));
		if (extraHint) {
			lore.add(Component.translatable("item.laptopcraft." + name + ".hint").withStyle(ChatFormatting.DARK_AQUA));
		}
		return Reg.item(name, factory, properties.component(DataComponents.LORE, new ItemLore(List.copyOf(lore))));
	}
}
