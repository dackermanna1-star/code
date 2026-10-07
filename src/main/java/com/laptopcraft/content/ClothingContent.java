package com.laptopcraft.content;

import com.laptopcraft.item.clothing.DyeWashing;
import com.laptopcraft.item.clothing.Wearables;
import com.laptopcraft.registry.Reg;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Categories;
import com.laptopcraft.shop.Product;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.minecraft.core.Holder;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;

/**
 * Wearable clothing and hats/accessories sold on Emerazon.
 *
 * <p>Hats are head-slot items with hand-built 3D models (see {@code tools/art/fashion}); garments are painted onto
 * the wearer through equipment assets. Everything is purely cosmetic: no armor, no durability.
 */
public final class ClothingContent {
	private static final List<Piece> PIECES = new ArrayList<>();

	// Hats & accessories
	public static Item TOP_HAT;
	public static Item COWBOY_HAT;
	public static Item BASEBALL_CAP;
	public static Item SNAPBACK_CAP;
	public static Item BEANIE;
	public static Item PARTY_HAT;
	public static Item CHEF_HAT;
	public static Item WIZARD_HAT;
	public static Item GOLDEN_CROWN;
	public static Item FLOWER_CROWN;
	public static Item PIRATE_HAT;
	public static Item VIKING_HELMET;
	public static Item PROPELLER_CAP;
	public static Item SUNGLASSES;
	public static Item NERD_GLASSES;
	public static Item HEADPHONES;
	// Clothes
	public static Item HOODIE;
	public static Item CREEPER_TEE;
	public static Item EMERALD_TEE;
	public static Item DENIM_JACKET;
	public static Item TUXEDO_JACKET;
	public static Item HAWAIIAN_SHIRT;
	public static Item JEANS;
	public static Item CARGO_SHORTS;
	public static Item SWEATPANTS;
	public static Item SNEAKERS;
	public static Item COWBOY_BOOTS;
	public static Item BUNNY_SLIPPERS;

	private ClothingContent() {
	}

	/** Registers blocks/items. Called during mod init, before the catalog is built. */
	public static void init() {
		Holder<SoundEvent> leather = SoundEvents.ARMOR_EQUIP_LEATHER;
		Holder<SoundEvent> generic = SoundEvents.ARMOR_EQUIP_GENERIC;

		TOP_HAT = hat("top_hat", leather, Rarity.COMMON, "Dapper Top Hat", 12, 47, 1284, "Best Seller",
				"Instantly adds +10 Sophistication. Villagers will finally take your trade offers seriously.");
		COWBOY_HAT = hat("cowboy_hat", leather, Rarity.COMMON, "Ten-Block Cowboy Hat", 11, 46, 932, "",
				"Yeehaw-certified leather, pre-dusted with genuine Badlands terracotta. Horse not included.");
		BASEBALL_CAP = hat("baseball_cap", leather, Rarity.COMMON, "Classic Red Cap", 6, 44, 2210, "Deal",
				"Keeps the sun out of your eyes and the creepers out of your mind. Mostly the sun.");
		SNAPBACK_CAP = hat("snapback_cap", leather, Rarity.COMMON, "Backwards Snapback", 7, 41, 1543, "",
				"Flat brim, sticker stays on. Wearing it backwards boosts your parkour skills by exactly 0%.");
		BEANIE = hat("beanie", leather, Rarity.COMMON, "Cozy Pompom Beanie", 5, 48, 3105, "",
				"Hand-knitted by a sheep who wanted to give back. Voted warmest hat in the Frozen Peaks.");
		PARTY_HAT = hat("party_hat", generic, Rarity.COMMON, "Party Hat", 3, 43, 876, "Deal",
				"Every day is somebody's spawn day! Confetti not included (it's on back order).");
		CHEF_HAT = hat("chef_hat", leather, Rarity.COMMON, "Chef's Toque", 8, 46, 654, "",
				"Puffy, pleated and professional. Your cake will still be eaten by the first player who sees it.");
		WIZARD_HAT = hat("wizard_hat", leather, Rarity.RARE, "Arcane Wizard Hat", 18, 49, 777, "Limited",
				"Embroidered with twinkling stars. Grants no actual magic, but enormous wizard energy.");
		GOLDEN_CROWN = hat("golden_crown", SoundEvents.ARMOR_EQUIP_GOLD, Rarity.EPIC, "Royal Golden Crown", 28, 50, 64, "Limited",
				"Forged from ethically mined gold and a little bit of ego. Heavy is the head, light is the wallet.");
		FLOWER_CROWN = hat("flower_crown", generic, Rarity.COMMON, "Meadow Flower Crown", 6, 48, 1902, "New",
				"Woven from poppies, dandelions and cornflowers. Bees may follow you around. This is a feature.");
		PIRATE_HAT = hat("pirate_hat", leather, Rarity.COMMON, "Captain's Pirate Hat", 13, 45, 512, "",
				"Arr! Perfect for raiding shipwrecks in style. Parrot and treasure map sold separately.");
		VIKING_HELMET = hat("viking_helmet", SoundEvents.ARMOR_EQUIP_IRON, Rarity.UNCOMMON, "Viking Helmet (Costume)", 14, 40, 389, "",
				"Horns are 100% decorative and 0% goat. Raiding villages is strongly discouraged.");
		PROPELLER_CAP = hat("propeller_cap", leather, Rarity.UNCOMMON, "Propeller Beanie", 9, 47, 1131, "New",
				"The propeller really spins! Lift-off sold separately - please keep using your elytra.");
		SUNGLASSES = register("sunglasses", Wearables.hat(generic, Rarity.COMMON, Reg.id("misc/clothing/sunglasses_overlay")),
				Categories.HATS, "Aviator Sunglasses", 10, 46, 2048, "Best Seller",
				"Golden frames, mirrored lenses, maximum cool. Do NOT test them on Endermen.");
		NERD_GLASSES = hat("nerd_glasses", generic, Rarity.COMMON, "Thick-Rimmed Glasses", 4, 44, 701, "",
				"Taped in the middle for authenticity. +5 to redstone engineering (results not verified).");
		HEADPHONES = hat("headphones", generic, Rarity.COMMON, "Beetz Studio Headphones", 16, 47, 1650, "",
				"Noise-cancelling: blocks out zombie groans and that cave sound you definitely did not hear.");

		HOODIE = garment("hoodie", EquipmentSlot.CHEST, leather, Rarity.COMMON, "Cozy Hoodie", 12, 48, 4120, "Best Seller",
				"Soft, black and dyeable - craft it with any dye to make it yours. Washes clean in a cauldron.");
		DyeWashing.register(HOODIE);
		CREEPER_TEE = garment("creeper_tee", EquipmentSlot.CHEST, leather, Rarity.COMMON, "Creeper Tee", 7, 47, 3333, "",
				"That's a very nice shirt you have there. It would be a shame if something... sssssss.");
		EMERALD_TEE = garment("emerald_tee", EquipmentSlot.CHEST, leather, Rarity.COMMON, "I ♥ Emeralds Tee", 6, 45, 999, "Deal",
				"Show the world where your heart (and your wallet) truly lies. 100% cotton, 0% refunds.");
		DENIM_JACKET = garment("denim_jacket", EquipmentSlot.CHEST, leather, Rarity.COMMON, "Denim Jacket", 15, 46, 820, "",
				"Rugged blue denim with brass buttons. Pairs well with jeans, if you dare to go double denim.");
		TUXEDO_JACKET = garment("tuxedo_jacket", EquipmentSlot.CHEST, leather, Rarity.UNCOMMON, "Tuxedo & Bow Tie", 22, 49, 410, "Limited",
				"For red-carpet premieres, Woodland Mansion dinners and very formal mining trips.");
		HAWAIIAN_SHIRT = garment("hawaiian_shirt", EquipmentSlot.CHEST, leather, Rarity.COMMON, "Hawaiian Shirt", 9, 44, 1288, "Deal",
				"A loud hibiscus print for warm ocean biomes. The Wandering Trader's official day-off uniform.");
		JEANS = garment("jeans", EquipmentSlot.LEGS, leather, Rarity.COMMON, "Classic Jeans", 10, 46, 2711, "",
				"Five pockets, still no room for your whole inventory. Fits every block-shaped leg.");
		CARGO_SHORTS = garment("cargo_shorts", EquipmentSlot.LEGS, leather, Rarity.COMMON, "Cargo Shorts", 8, 38, 1902, "",
				"So many pockets you will forget which one holds the diamonds. Summer-ready, fashion-questionable.");
		SWEATPANTS = garment("sweatpants", EquipmentSlot.LEGS, leather, Rarity.COMMON, "Comfy Sweatpants", 7, 48, 3520, "",
				"Gray, stretchy and perfect for AFK fishing. Officially approved for working from home.");
		SNEAKERS = garment("sneakers", EquipmentSlot.FEET, leather, Rarity.COMMON, "Swift Sneakers", 13, 47, 2600, "New",
				"Fresh white kicks with a red stripe. Never wear them in the Nether - they will never be white again.");
		COWBOY_BOOTS = garment("cowboy_boots", EquipmentSlot.FEET, leather, Rarity.COMMON, "Cowboy Boots", 14, 45, 612, "",
				"Hand-stitched leather with shiny spurs. Makes a deeply satisfying clink on oak planks.");
		BUNNY_SLIPPERS = garment("bunny_slippers", EquipmentSlot.FEET, leather, Rarity.COMMON, "Bunny Slippers", 5, 49, 4404, "Deal",
				"Fluffy pink slippers with tiny bunny faces. The Killer Bunny edition was discontinued for safety reasons.");
	}

	/** Adds this group's products to the {@link Catalog}. */
	public static void addProducts() {
		for (Piece piece : PIECES) {
			Catalog.register(Product.emerazon(piece.id(), piece.category(), piece.name(), piece.description(), piece.price(),
					piece.item(), 1, piece.rating(), piece.reviews(), piece.badge()));
		}
	}

	/** Every wearable registered by this group, in registration order. */
	public static List<Item> items() {
		return Collections.unmodifiableList(PIECES.stream().map(Piece::item).toList());
	}

	private static Item hat(String id, Holder<SoundEvent> sound, Rarity rarity, String name, int price, int rating, int reviews,
			String badge, String description) {
		return register(id, Wearables.hat(sound, rarity, null), Categories.HATS, name, price, rating, reviews, badge, description);
	}

	private static Item garment(String id, EquipmentSlot slot, Holder<SoundEvent> sound, Rarity rarity, String name, int price,
			int rating, int reviews, String badge, String description) {
		return register(id, Wearables.garment(id, slot, sound, rarity), Categories.CLOTHING, name, price, rating, reviews, badge, description);
	}

	private static Item register(String id, Item.Properties properties, String category, String name, int price, int rating,
			int reviews, String badge, String description) {
		Item item = Reg.item(id, properties);
		PIECES.add(new Piece(id, item, category, name, description, price, rating, reviews, badge));
		return item;
	}

	/** Catalog data for one wearable; the product id equals the item id. */
	private record Piece(String id, Item item, String category, String name, String description, int price, int rating,
			int reviews, String badge) {
	}
}
