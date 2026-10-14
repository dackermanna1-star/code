package net.abyssaldescent.registry;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.dungeon.loot.Rarity;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.item.DungeonArmorItem;
import net.abyssaldescent.item.DungeonBowItem;
import net.abyssaldescent.item.DungeonCrossbowItem;
import net.abyssaldescent.item.DungeonWeaponItem;
import net.abyssaldescent.item.GearItem;
import net.abyssaldescent.item.GearSpec;
import net.abyssaldescent.item.WaystoneShardItem;
import net.abyssaldescent.item.armor.ArmorSets;
import net.abyssaldescent.item.effect.Effects;
import net.abyssaldescent.item.relic.RelicItem;
import net.abyssaldescent.item.relic.RelicKind;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.item.ToolMaterial;
import net.minecraft.world.item.component.ChargedProjectiles;
import net.minecraft.world.item.component.ItemAttributeModifiers;
import net.minecraft.world.item.equipment.ArmorMaterial;
import net.minecraft.world.item.equipment.ArmorType;
import net.minecraft.world.item.equipment.EquipmentAsset;
import net.minecraft.world.item.equipment.EquipmentAssets;
import net.minecraft.world.level.block.Block;

public final class ModItems {
	/** Every item the mod adds, in creative-tab order. */
	public static final List<Item> ALL = new ArrayList<>();
	private static final Map<Zone, Map<Rarity, List<Item>>> POOLS = new EnumMap<>(Zone.class);
	private static final Map<Zone, List<Item>> EXCLUSIVES = new EnumMap<>(Zone.class);

	// ------------------------------------------------------------------ materials

	public static final ToolMaterial CRYPT_IRON = new ToolMaterial(BlockTags.INCORRECT_FOR_IRON_TOOL, 420, 6.0F, 2.0F, 14, ItemTags.IRON_TOOL_MATERIALS);
	public static final ToolMaterial GRAVE_STEEL = new ToolMaterial(BlockTags.INCORRECT_FOR_DIAMOND_TOOL, 900, 7.0F, 3.0F, 12,
		ItemTags.DIAMOND_TOOL_MATERIALS);
	public static final ToolMaterial SOULFORGED = new ToolMaterial(BlockTags.INCORRECT_FOR_NETHERITE_TOOL, 1800, 8.0F, 3.5F, 18,
		ItemTags.DIAMOND_TOOL_MATERIALS);

	public static final ArmorMaterial GRAVEWARDEN_ARMOR = new ArmorMaterial(25, defense(2, 6, 7, 3), 12, SoundEvents.ARMOR_EQUIP_IRON, 1.0F, 0.0F,
		ItemTags.REPAIRS_IRON_ARMOR, asset("gravewarden"));
	public static final ArmorMaterial WRAITHBOUND_ARMOR = new ArmorMaterial(22, defense(2, 5, 6, 2), 10, SoundEvents.ARMOR_EQUIP_CHAIN, 1.0F, 0.0F,
		ItemTags.REPAIRS_IRON_ARMOR, asset("wraithbound"));
	public static final ArmorMaterial MOURNER_ARMOR = new ArmorMaterial(14, defense(1, 4, 5, 2), 18, SoundEvents.ARMOR_EQUIP_LEATHER, 0.0F, 0.0F,
		ItemTags.REPAIRS_LEATHER_ARMOR, asset("mourner"));

	// ------------------------------------------------------------------ currency & crafting

	public static final Item ANCIENT_COIN = register("ancient_coin", Item::new, new Item.Properties().stacksTo(64));
	public static final Item SOUL_DUST = register("soul_dust", Item::new, new Item.Properties());
	public static final Item ANCIENT_BONE = register("ancient_bone", Item::new, new Item.Properties());
	public static final Item GHOUL_FANG = register("ghoul_fang", Item::new, new Item.Properties());
	public static final Item WAYSTONE_SHARD = register("waystone_shard", WaystoneShardItem::new, new Item.Properties().stacksTo(4)
		.rarity(net.minecraft.world.item.Rarity.UNCOMMON));

	// ------------------------------------------------------------------ Forgotten Halls weapons

	public static final Item CRYPT_SHORTSWORD = melee("crypt_shortsword", GearSpec.of(Zone.FORGOTTEN_HALLS, Rarity.COMMON, "sword"),
		CRYPT_IRON, 3.0F, -2.4F, 0.0, false);
	public static final Item GRAVEDIGGERS_HATCHET = melee("gravediggers_hatchet", GearSpec.of(Zone.FORGOTTEN_HALLS, Rarity.COMMON, "axe"),
		CRYPT_IRON, 6.0F, -3.1F, 0.0, true);
	public static final Item BONE_SHIV = melee("bone_shiv", GearSpec.of(Zone.FORGOTTEN_HALLS, Rarity.COMMON, "dagger"),
		CRYPT_IRON, 1.0F, -1.6F, -0.5, false);
	public static final Item OSSUARY_BLADE = melee("ossuary_blade", GearSpec.of(Zone.FORGOTTEN_HALLS, Rarity.UNCOMMON, "sword",
		new Effects.UndeadBane(0.3F)), CRYPT_IRON, 3.5F, -2.4F, 0.0, false);
	public static final Item MOURNERS_KRIS = melee("mourners_kris", GearSpec.of(Zone.FORGOTTEN_HALLS, Rarity.UNCOMMON, "dagger",
		new Effects.Bleed(60)), CRYPT_IRON, 1.5F, -1.6F, -0.5, false);
	public static final Item WIGHTBANE = melee("wightbane", GearSpec.of(Zone.FORGOTTEN_HALLS, Rarity.RARE, "sword",
		new Effects.SoulFlare(0.22F, 4.0F, 3.0), new Effects.UndeadBane(0.15F)), GRAVE_STEEL, 3.0F, -2.4F, 0.0, false);
	public static final Item CRYPTWARDEN_LONGBOW = register("cryptwarden_longbow", p -> new DungeonBowItem(GearSpec.of(Zone.FORGOTTEN_HALLS,
		Rarity.RARE, "bow", new Effects.SoulPierce(2, 1.0)), p), new Item.Properties().durability(500).enchantable(1));
	public static final Item BONECASTER = register("bonecaster", p -> new DungeonCrossbowItem(GearSpec.of(Zone.FORGOTTEN_HALLS, Rarity.RARE,
		"crossbow", new Effects.BoneShrapnel(3.0F, 2.5)), p), new Item.Properties().stacksTo(1).durability(550)
		.component(DataComponents.CHARGED_PROJECTILES, ChargedProjectiles.EMPTY).enchantable(1));
	public static final Item TOMBSPLITTER = melee("tombsplitter", GearSpec.of(Zone.FORGOTTEN_HALLS, Rarity.EPIC, "axe",
		new Effects.Sunder(0.5F, 6.0F), new Effects.GraveSlam(5.0F, 3.0)), GRAVE_STEEL, 6.0F, -3.1F, 0.0, true);
	public static final Item STORMVIGIL = melee("stormvigil", GearSpec.of(Zone.FORGOTTEN_HALLS, Rarity.EPIC, "sword",
		new Effects.ChainLightning(0.2F, 3, 4.0F, 6.0)), GRAVE_STEEL, 3.5F, -2.4F, 0.0, false);
	public static final Item GRAVEBRAND = melee("gravebrand", GearSpec.exclusive(Zone.FORGOTTEN_HALLS, Rarity.LEGENDARY, "greatsword",
		new Effects.Soulreaver(6.0F, 5.0), new Effects.ReapSouls(4.0F)), SOULFORGED, 6.5F, -3.2F, 0.5, false);

	// ------------------------------------------------------------------ Forgotten Halls armour

	public static final Item GRAVEWARDEN_HELM = armor("gravewarden_helm", Rarity.RARE, ArmorSets.GRAVEWARDEN, GRAVEWARDEN_ARMOR, ArmorType.HELMET);
	public static final Item GRAVEWARDEN_CUIRASS = armor("gravewarden_cuirass", Rarity.RARE, ArmorSets.GRAVEWARDEN, GRAVEWARDEN_ARMOR,
		ArmorType.CHESTPLATE);
	public static final Item GRAVEWARDEN_GREAVES = armor("gravewarden_greaves", Rarity.RARE, ArmorSets.GRAVEWARDEN, GRAVEWARDEN_ARMOR,
		ArmorType.LEGGINGS);
	public static final Item GRAVEWARDEN_SABATONS = armor("gravewarden_sabatons", Rarity.RARE, ArmorSets.GRAVEWARDEN, GRAVEWARDEN_ARMOR,
		ArmorType.BOOTS);
	public static final Item MOURNER_HOOD = armor("mourner_hood", Rarity.UNCOMMON, ArmorSets.MOURNER, MOURNER_ARMOR, ArmorType.HELMET);
	public static final Item MOURNER_SHROUD = armor("mourner_shroud", Rarity.UNCOMMON, ArmorSets.MOURNER, MOURNER_ARMOR, ArmorType.CHESTPLATE);
	public static final Item MOURNER_WRAPS = armor("mourner_wraps", Rarity.UNCOMMON, ArmorSets.MOURNER, MOURNER_ARMOR, ArmorType.LEGGINGS);
	public static final Item MOURNER_TREADS = armor("mourner_treads", Rarity.UNCOMMON, ArmorSets.MOURNER, MOURNER_ARMOR, ArmorType.BOOTS);

	public static final Item WRAITHBOUND_VISAGE = armor("wraithbound_visage", Rarity.EPIC, ArmorSets.WRAITHBOUND, WRAITHBOUND_ARMOR, ArmorType.HELMET);
	public static final Item WRAITHBOUND_MANTLE = armor("wraithbound_mantle", Rarity.EPIC, ArmorSets.WRAITHBOUND, WRAITHBOUND_ARMOR,
		ArmorType.CHESTPLATE);
	public static final Item WRAITHBOUND_LEGGUARDS = armor("wraithbound_legguards", Rarity.EPIC, ArmorSets.WRAITHBOUND, WRAITHBOUND_ARMOR,
		ArmorType.LEGGINGS);
	public static final Item WRAITHBOUND_STRIDE = armor("wraithbound_stride", Rarity.EPIC, ArmorSets.WRAITHBOUND, WRAITHBOUND_ARMOR, ArmorType.BOOTS);

	// ------------------------------------------------------------------ relics

	public static final Item GRAVEDUST_LOCKET = relic("gravedust_locket", Rarity.UNCOMMON, RelicKind.GRAVEDUST_LOCKET, false);
	public static final Item VIGIL_CANDLE = relic("vigil_candle", Rarity.RARE, RelicKind.VIGIL_CANDLE, false);
	public static final Item BLOOD_SIGIL = relic("blood_sigil", Rarity.RARE, RelicKind.BLOOD_SIGIL, false);
	public static final Item CRACKED_PHYLACTERY = relic("cracked_phylactery", Rarity.EPIC, RelicKind.CRACKED_PHYLACTERY, false);
	public static final Item HOLLOW_CROWN = relic("hollow_crown", Rarity.LEGENDARY, RelicKind.HOLLOW_CROWN, true);

	// ------------------------------------------------------------------ spawn eggs (creative/testing)

	public static final Item RISEN_SPAWN_EGG = egg("risen_spawn_egg", ModEntities.RISEN);
	public static final Item BONE_ARCHER_SPAWN_EGG = egg("bone_archer_spawn_egg", ModEntities.BONE_ARCHER);
	public static final Item BONE_SHIELDBEARER_SPAWN_EGG = egg("bone_shieldbearer_spawn_egg", ModEntities.BONE_SHIELDBEARER);
	public static final Item CRYPT_GHOUL_SPAWN_EGG = egg("crypt_ghoul_spawn_egg", ModEntities.CRYPT_GHOUL);
	public static final Item WAILING_SKULL_SPAWN_EGG = egg("wailing_skull_spawn_egg", ModEntities.WAILING_SKULL);
	public static final Item BARROW_KNIGHT_SPAWN_EGG = egg("barrow_knight_spawn_egg", ModEntities.BARROW_KNIGHT);
	public static final Item DELVER_MERCHANT_SPAWN_EGG = egg("delver_merchant_spawn_egg", ModEntities.DELVER_MERCHANT);

	private ModItems() {
	}

	// ------------------------------------------------------------------ helpers

	private static java.util.Map<ArmorType, Integer> defense(int boots, int legs, int chest, int helmet) {
		return new EnumMap<>(Map.of(ArmorType.BOOTS, boots, ArmorType.LEGGINGS, legs, ArmorType.CHESTPLATE, chest, ArmorType.HELMET, helmet,
			ArmorType.BODY, chest));
	}

	private static ResourceKey<EquipmentAsset> asset(String name) {
		return ResourceKey.create(EquipmentAssets.ROOT_ID, AbyssalDescent.id(name));
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, AbyssalDescent.id(name));
		Item item = factory.apply(properties.setId(key));
		if (item instanceof BlockItem blockItem) {
			blockItem.registerBlocks(Item.BY_BLOCK, item);
		}
		Registry.register(BuiltInRegistries.ITEM, key, item);
		ALL.add(item);
		if (item instanceof GearItem gear) {
			GearSpec spec = gear.spec();
			if (spec.exclusive()) {
				EXCLUSIVES.computeIfAbsent(spec.zone(), z -> new ArrayList<>()).add(item);
			} else {
				POOLS.computeIfAbsent(spec.zone(), z -> new EnumMap<>(Rarity.class)).computeIfAbsent(spec.rarity(), r -> new ArrayList<>()).add(item);
			}
		}
		return item;
	}

	private static Item melee(String name, GearSpec spec, ToolMaterial material, float damage, float speed, double reach, boolean axe) {
		Item.Properties properties = axe ? new Item.Properties().axe(material, damage, speed) : new Item.Properties().sword(material, damage, speed);
		ItemAttributeModifiers.Builder attributes = ItemAttributeModifiers.builder()
			.add(Attributes.ATTACK_DAMAGE, new AttributeModifier(Item.BASE_ATTACK_DAMAGE_ID, damage + material.attackDamageBonus(),
				AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND)
			.add(Attributes.ATTACK_SPEED, new AttributeModifier(Item.BASE_ATTACK_SPEED_ID, speed, AttributeModifier.Operation.ADD_VALUE),
				EquipmentSlotGroup.MAINHAND);
		if (reach != 0.0) {
			attributes.add(Attributes.ENTITY_INTERACTION_RANGE, new AttributeModifier(AbyssalDescent.id("weapon_reach"), reach,
				AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND);
		}
		properties.attributes(attributes.build());
		if (spec.rarity().ordinal() >= Rarity.EPIC.ordinal()) {
			properties.fireResistant();
		}
		return register(name, p -> new DungeonWeaponItem(spec, p), properties);
	}

	private static Item armor(String name, Rarity rarity, String set, ArmorMaterial material, ArmorType type) {
		GearSpec spec = new GearSpec(Zone.FORGOTTEN_HALLS, rarity, false, "armor_" + type.getName(), List.of(), set);
		return register(name, p -> new DungeonArmorItem(spec, p), new Item.Properties().humanoidArmor(material, type));
	}

	private static Item relic(String name, Rarity rarity, RelicKind kind, boolean exclusive) {
		GearSpec spec = new GearSpec(Zone.FORGOTTEN_HALLS, rarity, exclusive, "relic", List.of(), null);
		return register(name, p -> new RelicItem(spec, kind, p), new Item.Properties());
	}

	private static Item egg(String name, net.minecraft.world.entity.EntityType<?> type) {
		return register(name, SpawnEggItem::new, new Item.Properties().spawnEgg(type));
	}

	public static List<Item> pool(Zone zone, Rarity rarity) {
		Map<Rarity, List<Item>> byRarity = POOLS.get(zone);
		if (byRarity == null) {
			return List.of();
		}
		return byRarity.getOrDefault(rarity, List.of());
	}

	public static List<Item> exclusives(Zone zone) {
		return EXCLUSIVES.getOrDefault(zone, List.of());
	}

	public static void init() {
		for (Block block : ModBlocks.WITH_ITEMS) {
			ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, BuiltInRegistries.BLOCK.getKey(block));
			BlockItem item = new BlockItem(block, new Item.Properties().setId(key).useBlockDescriptionPrefix());
			item.registerBlocks(Item.BY_BLOCK, item);
			Registry.register(BuiltInRegistries.ITEM, key, item);
			ALL.add(item);
		}
	}
}
