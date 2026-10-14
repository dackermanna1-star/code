package net.abyssaldescent.dungeon.loot;

import java.util.ArrayList;
import java.util.List;
import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.dungeon.run.DungeonRun;
import net.abyssaldescent.dungeon.run.RunManager;
import net.abyssaldescent.dungeon.run.Unsecured;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.registry.ModItems;
import net.abyssaldescent.registry.ModPotions;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.alchemy.PotionContents;

/**
 * Rolls dungeon loot. Rarity weights come from the config per source and shift towards higher tiers with depth; the
 * item is then drawn from the zone's pool for that rarity (falling back to lower tiers if a pool is empty).
 */
public final class LootRoller {
	private LootRoller() {
	}

	public static double[] weights(LootTier tier) {
		AdConfig.Loot loot = AdConfig.get().loot;
		return switch (tier) {
			case CHEST -> loot.chestRarityWeights;
			case TREASURE, SECRET -> loot.treasureRarityWeights;
			case ELITE -> loot.eliteRarityWeights;
			case BOSS -> loot.bossRarityWeights;
		};
	}

	public static Rarity rollRarity(RandomSource random, LootTier tier, int floor) {
		double[] base = weights(tier);
		double shift = 1.0 + AdConfig.get().loot.rarityShiftPerFloor * Math.max(0, floor - 1);
		double[] w = new double[Rarity.values().length];
		double total = 0;
		for (int i = 0; i < w.length; i++) {
			w[i] = (i < base.length ? Math.max(0, base[i]) : 0) * Math.pow(shift, i);
			total += w[i];
		}
		if (total <= 0) {
			return Rarity.COMMON;
		}
		double roll = random.nextDouble() * total;
		for (int i = 0; i < w.length; i++) {
			roll -= w[i];
			if (roll < 0) {
				return Rarity.byIndex(i);
			}
		}
		return Rarity.LEGENDARY;
	}

	public static ItemStack rollGear(RandomSource random, Zone zone, Rarity rarity) {
		for (int r = rarity.ordinal(); r >= 0; r--) {
			List<Item> pool = ModItems.pool(zone, Rarity.byIndex(r));
			if (!pool.isEmpty()) {
				return new ItemStack(pool.get(random.nextInt(pool.size())));
			}
		}
		// The zone has no gear yet: fall back to the first implemented zone's pool.
		for (int r = rarity.ordinal(); r >= 0; r--) {
			List<Item> pool = ModItems.pool(Zone.FORGOTTEN_HALLS, Rarity.byIndex(r));
			if (!pool.isEmpty()) {
				return new ItemStack(pool.get(random.nextInt(pool.size())));
			}
		}
		return ItemStack.EMPTY;
	}

	/** A reliquary roll for one player: gear plus consumables, all tagged unsecured. */
	public static List<ItemStack> rollReliquary(ServerPlayer player, LootTier tier, int floor) {
		RandomSource random = player.getRandom();
		Zone zone = Zone.forFloor(floor);
		List<ItemStack> loot = new ArrayList<>();
		int gearCount = tier.minGear() + random.nextInt(tier.maxGear() - tier.minGear() + 1);
		if (tier == LootTier.BOSS) {
			List<Item> exclusives = ModItems.exclusives(zone);
			if (!exclusives.isEmpty()) {
				loot.add(new ItemStack(exclusives.get(random.nextInt(exclusives.size()))));
				gearCount--;
			}
		}
		for (int i = 0; i < gearCount; i++) {
			ItemStack gear = rollGear(random, zone, rollRarity(random, tier, floor));
			if (!gear.isEmpty()) {
				loot.add(gear);
			}
		}
		int coins = switch (tier) {
			case CHEST -> 2 + random.nextInt(4);
			case TREASURE, SECRET -> 5 + random.nextInt(6);
			case ELITE -> 4 + random.nextInt(5);
			case BOSS -> 14 + random.nextInt(10);
		} + floor / 2;
		loot.add(new ItemStack(ModItems.ANCIENT_COIN, coins));
		if (random.nextFloat() < (tier == LootTier.CHEST ? 0.35F : 0.6F)) {
			loot.add(randomPotion(random));
		}
		if (random.nextFloat() < 0.3F) {
			loot.add(new ItemStack(Items.ARROW, 6 + random.nextInt(10)));
		}
		if (tier == LootTier.BOSS || tier == LootTier.SECRET && random.nextFloat() < 0.25F) {
			loot.add(new ItemStack(ModItems.WAYSTONE_SHARD));
		}
		tagAll(player, loot);
		return loot;
	}

	/** Bonus drop from an elite enemy. */
	public static List<ItemStack> rollEliteDrop(ServerPlayer player, int floor) {
		List<ItemStack> loot = new ArrayList<>();
		RandomSource random = player.getRandom();
		if (random.nextFloat() < 0.65F) {
			ItemStack gear = rollGear(random, Zone.forFloor(floor), rollRarity(random, LootTier.ELITE, floor));
			if (!gear.isEmpty()) {
				loot.add(gear);
			}
		}
		loot.add(new ItemStack(ModItems.ANCIENT_COIN, 2 + random.nextInt(3)));
		tagAll(player, loot);
		return loot;
	}

	/** Cursed idol gift: one Epic-or-better relic or weapon. */
	public static List<ItemStack> rollCursedGift(ServerPlayer player, int floor) {
		RandomSource random = player.getRandom();
		Rarity rarity = random.nextFloat() < 0.15F ? Rarity.LEGENDARY : Rarity.EPIC;
		ItemStack gear = rollGear(random, Zone.forFloor(floor), rarity);
		List<ItemStack> loot = new ArrayList<>();
		if (!gear.isEmpty()) {
			loot.add(gear);
		}
		tagAll(player, loot);
		return loot;
	}

	/** Gear offered by merchants (tagged by the merchant itself). */
	public static List<ItemStack> rollMerchantStock(RandomSource random, int floor, int count) {
		List<ItemStack> stock = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			Rarity rarity = rollRarity(random, LootTier.TREASURE, floor);
			if (rarity == Rarity.LEGENDARY) {
				rarity = Rarity.EPIC;
			}
			ItemStack gear = rollGear(random, Zone.forFloor(floor), rarity);
			if (!gear.isEmpty()) {
				stock.add(gear);
			}
		}
		return stock;
	}

	public static ItemStack randomPotion(RandomSource random) {
		List<Holder<Potion>> options = List.of(ModPotions.MENDING, ModPotions.MENDING, ModPotions.WARDING, ModPotions.SOULWARD, ModPotions.BLOODRAGE);
		ItemStack stack = new ItemStack(Items.POTION);
		stack.set(DataComponents.POTION_CONTENTS, new PotionContents(options.get(random.nextInt(options.size()))));
		return stack;
	}

	private static void tagAll(ServerPlayer player, List<ItemStack> loot) {
		RunManager manager = RunManager.get(player.level().getServer());
		DungeonRun run = manager.runOf(player);
		if (run == null) {
			return;
		}
		for (ItemStack stack : loot) {
			Unsecured.tag(stack, run.id());
		}
	}
}
