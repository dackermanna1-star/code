package dev.calibercraft.registry;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.item.AmmoItem;
import dev.calibercraft.item.AttachmentItem;
import dev.calibercraft.item.FirearmItem;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Function;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;

public final class ModItems {
	public static final List<String> WEAPON_IDS = List.of("m9", "revolver", "vector9", "mp5", "ar15", "ak", "bullpup",
		"pump_shotgun", "auto_shotgun", "sniper", "dmr", "lmg");
	public static final List<String> ATTACHMENT_IDS = List.of(
		"red_dot", "holo_sight", "acog_scope", "sniper_scope",
		"suppressor", "compensator", "muzzle_brake", "flash_hider", "shotgun_choke",
		"short_barrel", "precision_barrel", "heavy_barrel",
		"vertical_grip", "angled_grip", "ergonomic_grip", "bipod",
		"lightweight_stock", "precision_stock",
		"extended_mag", "quick_mag",
		"laser_sight",
		"charm_creeper", "charm_diamond", "charm_dogtag");
	public static final List<String> AMMO_IDS = List.of("ammo_9mm", "ammo_9mm_hp", "ammo_44", "ammo_44_hp", "ammo_556", "ammo_556_ap",
		"ammo_762", "ammo_762_ap", "ammo_308", "ammo_308_ap", "ammo_338", "ammo_338_ap", "shell_buckshot", "shell_slug", "shell_incendiary");

	public static final List<FirearmItem> WEAPONS;
	public static final List<AttachmentItem> ATTACHMENTS;
	public static final List<AmmoItem> AMMO;

	public static final Item GUN_PARTS = register("gun_parts", Item::new, new Item.Properties());
	public static final Item PRECISION_PARTS = register("precision_parts", Item::new, new Item.Properties().rarity(Rarity.UNCOMMON));
	public static final Item PRISMATIC_FINISH_KIT = register("prismatic_finish_kit", Item::new,
		new Item.Properties().rarity(Rarity.RARE).stacksTo(16));
	public static final Item GUNSMITH_BENCH = register("gunsmith_bench", p -> new BlockItem(ModBlocks.GUNSMITH_BENCH, p),
		new Item.Properties().useBlockDescriptionPrefix());

	static {
		List<FirearmItem> w = new ArrayList<>();
		for (String id : WEAPON_IDS) {
			Identifier wid = CaliberCraft.id(id);
			w.add(register(id, p -> new FirearmItem(p, wid), new Item.Properties().stacksTo(1)
				.rarity(id.equals("sniper") || id.equals("lmg") ? Rarity.RARE : Rarity.UNCOMMON)));
		}
		WEAPONS = Collections.unmodifiableList(w);
		List<AttachmentItem> a = new ArrayList<>();
		for (String id : ATTACHMENT_IDS) {
			Identifier aid = CaliberCraft.id(id);
			a.add(register(id, p -> new AttachmentItem(p, aid), new Item.Properties().stacksTo(16)));
		}
		ATTACHMENTS = Collections.unmodifiableList(a);
		List<AmmoItem> am = new ArrayList<>();
		for (String id : AMMO_IDS) {
			Identifier aid = CaliberCraft.id(id.replace("ammo_", "").replace("shell_", "12g_"));
			am.add(register(id, p -> new AmmoItem(p, aid), new Item.Properties()));
		}
		AMMO = Collections.unmodifiableList(am);
	}

	private ModItems() {
	}

	private static <T extends Item> T register(String name, Function<Item.Properties, T> factory, Item.Properties props) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, CaliberCraft.id(name));
		return Registry.register(BuiltInRegistries.ITEM, key, factory.apply(props.setId(key)));
	}

	public static void init() {
	}
}
