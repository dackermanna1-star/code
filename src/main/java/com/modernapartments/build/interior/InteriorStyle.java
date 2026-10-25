package com.modernapartments.build.interior;

import com.modernapartments.registry.ModBlocks;
import com.modernapartments.registry.ModBlocks.ArmchairColor;
import com.modernapartments.registry.ModBlocks.ChairStyle;
import com.modernapartments.registry.ModBlocks.CurtainColor;
import com.modernapartments.registry.ModBlocks.KitchenStyle;
import com.modernapartments.registry.ModBlocks.SofaColor;
import com.modernapartments.registry.ModBlocks.TableStyle;
import com.modernapartments.registry.ModBlocks.Wood;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;

/**
 * Finishes and furniture choices for one apartment. Each unit rolls its own style from the building's
 * theme, so neighbouring apartments never look identical.
 */
public final class InteriorStyle {
	public enum Theme { LUXURY, MODERN, FAMILY, INDUSTRIAL, CLASSIC }

	public final Theme theme;
	public final Block floor;
	public final Block bathFloor;
	public final Block bathWall;
	public final Block wall;
	public final KitchenStyle kitchen;
	public final SofaColor sofa;
	public final ArmchairColor armchair;
	public final Block rug;
	public final Block rugBorder;
	public final Block bed;
	public final Block kidBed;
	public final CurtainColor curtain;
	public final boolean blinds;
	public final TableStyle table;
	public final ChairStyle chair;
	public final Wood wood;
	public final Block vanity;
	public final Block nightstand;
	public final Block dresser;
	public final Block wardrobe;
	public final Block desk;
	public final Block bookcase;
	public final Block tableLamp;
	public final Block floorLamp;
	public final Block pendant;
	public final Block coffeeTable;
	public final Block barStool;
	public final boolean ceilingFan;
	public final boolean fireplace;
	public final Block door;
	public final RandomSource random;

	private InteriorStyle(Theme theme, RandomSource r) {
		this.theme = theme;
		this.random = r;
		switch (theme) {
			case LUXURY -> {
				floor = pick(r, mod("herringbone_oak"), mod("hardwood_walnut"), mod("white_marble"), mod("hardwood_white_oak"));
				bathFloor = pick(r, mod("white_marble"), mod("black_marble"), mod("large_tile_light"));
				bathWall = pick(r, mod("white_marble"), mod("subway_tile"), mod("subway_tile_navy"));
				wall = pick(r, mod("drywall_white"), mod("drywall_greige"), mod("drywall_white"));
				kitchen = pick(r, KitchenStyle.WALNUT, KitchenStyle.NAVY, KitchenStyle.WHITE, KitchenStyle.CHARCOAL);
				sofa = pick(r, SofaColor.EMERALD, SofaColor.COGNAC, SofaColor.WHITE, SofaColor.CHARCOAL, SofaColor.NAVY);
				armchair = pick(r, ArmchairColor.CREAM, ArmchairColor.EMERALD, ArmchairColor.MUSTARD);
				table = pick(r, TableStyle.WHITE, TableStyle.WALNUT, TableStyle.BLACK);
				chair = pick(r, ChairStyle.BLACK, ChairStyle.WALNUT);
				wood = pick(r, Wood.WALNUT, Wood.CHARCOAL);
				vanity = pick(r, ModBlocks.VANITY_WALNUT, ModBlocks.VANITY_NAVY);
				ceilingFan = false;
				fireplace = r.nextInt(3) > 0;
			}
			case INDUSTRIAL -> {
				floor = pick(r, mod("polished_concrete"), mod("hardwood_walnut"), mod("hardwood_gray"));
				bathFloor = pick(r, mod("slate_tile"), mod("large_tile_dark"), mod("mosaic_tile"));
				bathWall = pick(r, mod("subway_tile"), mod("brick_white"), mod("subway_tile_navy"));
				wall = pick(r, mod("drywall_white"), mod("drywall_charcoal"), mod("brick_exposed"));
				kitchen = pick(r, KitchenStyle.CHARCOAL, KitchenStyle.WALNUT, KitchenStyle.WHITE);
				sofa = pick(r, SofaColor.COGNAC, SofaColor.CHARCOAL, SofaColor.GRAY, SofaColor.NAVY);
				armchair = pick(r, ArmchairColor.TERRACOTTA, ArmchairColor.GRAY, ArmchairColor.MUSTARD);
				table = pick(r, TableStyle.BLACK, TableStyle.WALNUT, TableStyle.OAK);
				chair = pick(r, ChairStyle.BLACK, ChairStyle.OAK);
				wood = pick(r, Wood.CHARCOAL, Wood.WALNUT);
				vanity = pick(r, ModBlocks.VANITY_WALNUT, ModBlocks.VANITY_WHITE);
				ceilingFan = r.nextBoolean();
				fireplace = r.nextInt(4) == 0;
			}
			case FAMILY -> {
				floor = pick(r, mod("hardwood_light"), mod("hardwood_white_oak"), mod("hardwood_gray"));
				bathFloor = pick(r, mod("mosaic_tile"), mod("large_tile_light"));
				bathWall = pick(r, mod("subway_tile"), mod("subway_tile_sage"));
				wall = pick(r, mod("drywall_white"), mod("drywall_sage"), mod("drywall_sky"), mod("drywall_greige"));
				kitchen = pick(r, KitchenStyle.WHITE, KitchenStyle.SAGE, KitchenStyle.NAVY);
				sofa = pick(r, SofaColor.GRAY, SofaColor.BEIGE, SofaColor.NAVY, SofaColor.WHITE);
				armchair = pick(r, ArmchairColor.GRAY, ArmchairColor.MUSTARD, ArmchairColor.TERRACOTTA, ArmchairColor.NAVY);
				table = pick(r, TableStyle.OAK, TableStyle.WALNUT, TableStyle.WHITE);
				chair = pick(r, ChairStyle.OAK, ChairStyle.WHITE);
				wood = pick(r, Wood.WHITE, Wood.WALNUT);
				vanity = pick(r, ModBlocks.VANITY_WHITE, ModBlocks.VANITY_NAVY);
				ceilingFan = r.nextBoolean();
				fireplace = false;
			}
			case CLASSIC -> {
				floor = pick(r, mod("herringbone_oak"), mod("hardwood_light"), mod("hardwood_walnut"));
				bathFloor = pick(r, mod("mosaic_tile"), mod("white_marble"));
				bathWall = pick(r, mod("subway_tile"), mod("subway_tile_navy"));
				wall = pick(r, mod("drywall_greige"), mod("drywall_white"), mod("drywall_blush"));
				kitchen = pick(r, KitchenStyle.WHITE, KitchenStyle.NAVY, KitchenStyle.SAGE);
				sofa = pick(r, SofaColor.NAVY, SofaColor.BEIGE, SofaColor.EMERALD);
				armchair = pick(r, ArmchairColor.CREAM, ArmchairColor.NAVY, ArmchairColor.TERRACOTTA);
				table = pick(r, TableStyle.WALNUT, TableStyle.WHITE);
				chair = pick(r, ChairStyle.WALNUT, ChairStyle.WHITE);
				wood = pick(r, Wood.WALNUT, Wood.WHITE);
				vanity = pick(r, ModBlocks.VANITY_WHITE, ModBlocks.VANITY_NAVY);
				ceilingFan = r.nextInt(3) == 0;
				fireplace = r.nextInt(3) == 0;
			}
			default -> { // MODERN
				floor = pick(r, mod("hardwood_white_oak"), mod("hardwood_gray"), mod("hardwood_light"), mod("large_tile_light"));
				bathFloor = pick(r, mod("large_tile_light"), mod("large_tile_dark"), mod("slate_tile"));
				bathWall = pick(r, mod("subway_tile"), mod("white_marble"), mod("subway_tile_sage"));
				wall = pick(r, mod("drywall_white"), mod("drywall_white"), mod("drywall_greige"), mod("drywall_sky"));
				kitchen = pick(r, KitchenStyle.WHITE, KitchenStyle.CHARCOAL, KitchenStyle.WALNUT, KitchenStyle.NAVY);
				sofa = pick(r, SofaColor.GRAY, SofaColor.CHARCOAL, SofaColor.NAVY, SofaColor.BEIGE, SofaColor.WHITE);
				armchair = pick(r, ArmchairColor.values());
				table = pick(r, TableStyle.OAK, TableStyle.BLACK, TableStyle.WHITE);
				chair = pick(r, ChairStyle.values());
				wood = pick(r, Wood.values());
				vanity = pick(r, ModBlocks.VANITY_WHITE, ModBlocks.VANITY_WALNUT, ModBlocks.VANITY_NAVY);
				ceilingFan = r.nextInt(3) == 0;
				fireplace = r.nextInt(4) == 0;
			}
		}
		Block[][] rugs = {
			{Blocks.LIGHT_GRAY_CARPET, Blocks.WHITE_CARPET}, {Blocks.GRAY_CARPET, Blocks.LIGHT_GRAY_CARPET},
			{Blocks.BLUE_CARPET, Blocks.WHITE_CARPET}, {Blocks.BROWN_CARPET, Blocks.ORANGE_CARPET},
			{Blocks.WHITE_CARPET, Blocks.LIGHT_GRAY_CARPET}, {Blocks.CYAN_CARPET, Blocks.LIGHT_GRAY_CARPET},
			{Blocks.GREEN_CARPET, Blocks.WHITE_CARPET}, {Blocks.PINK_CARPET, Blocks.WHITE_CARPET},
			{Blocks.BLACK_CARPET, Blocks.GRAY_CARPET}, {Blocks.ORANGE_CARPET, Blocks.BROWN_CARPET},
		};
		Block[] rug = rugs[r.nextInt(rugs.length)];
		this.rug = rug[0];
		this.rugBorder = rug[1];
		this.bed = pick(r, Blocks.WHITE_BED, Blocks.LIGHT_GRAY_BED, Blocks.GRAY_BED, Blocks.BLUE_BED, Blocks.CYAN_BED,
			Blocks.BROWN_BED, Blocks.GREEN_BED, Blocks.WHITE_BED, Blocks.BLACK_BED);
		this.kidBed = pick(r, Blocks.LIGHT_BLUE_BED, Blocks.PINK_BED, Blocks.LIME_BED, Blocks.YELLOW_BED, Blocks.PURPLE_BED, Blocks.RED_BED);
		this.curtain = pick(r, CurtainColor.values());
		this.blinds = r.nextInt(3) == 0;
		this.nightstand = wood == Wood.WHITE ? ModBlocks.NIGHTSTAND_WHITE : ModBlocks.NIGHTSTAND_WALNUT;
		this.dresser = wood == Wood.WHITE ? ModBlocks.DRESSER_WHITE : ModBlocks.DRESSER_OAK;
		this.wardrobe = wood == Wood.WHITE ? ModBlocks.WARDROBE_WHITE : ModBlocks.WARDROBE_WALNUT;
		this.desk = wood == Wood.WHITE ? ModBlocks.DESK_WHITE : ModBlocks.DESK_WALNUT;
		this.bookcase = switch (wood) {
			case WHITE -> ModBlocks.BOOKCASE_WHITE;
			case CHARCOAL -> ModBlocks.BOOKCASE_BLACK;
			default -> ModBlocks.BOOKCASE_WALNUT;
		};
		this.tableLamp = pick(r, ModBlocks.TABLE_LAMP_CERAMIC, ModBlocks.TABLE_LAMP_BRASS, ModBlocks.TABLE_LAMP_BLACK);
		this.floorLamp = pick(r, ModBlocks.FLOOR_LAMP, ModBlocks.FLOOR_LAMP_BLACK);
		this.pendant = pick(r, ModBlocks.PENDANT_LIGHT_BLACK, ModBlocks.PENDANT_LIGHT_BRASS, ModBlocks.PENDANT_LIGHT_WHITE);
		this.coffeeTable = pick(r, ModBlocks.COFFEE_TABLE_WALNUT, ModBlocks.COFFEE_TABLE_OAK, ModBlocks.COFFEE_TABLE_MARBLE,
			ModBlocks.GLASS_COFFEE_TABLE);
		this.barStool = pick(r, ModBlocks.BAR_STOOL_BLACK, ModBlocks.BAR_STOOL_BRASS);
		this.door = theme == Theme.INDUSTRIAL ? ModBlocks.DOORS.get(ModBlocks.DoorStyle.BARN) : ModBlocks.DOORS.get(ModBlocks.DoorStyle.WHITE);
	}

	public static InteriorStyle roll(Theme theme, RandomSource random) {
		return new InteriorStyle(theme, random);
	}

	public static Block mod(String id) {
		return ModBlocks.get(id);
	}

	@SafeVarargs
	public static <T> T pick(RandomSource r, T... options) {
		return options[r.nextInt(options.length)];
	}

	public Block sofaBlock() {
		return ModBlocks.SOFAS.get(sofa);
	}

	public Block armchairBlock() {
		return ModBlocks.ARMCHAIRS.get(armchair);
	}

	public Block tableBlock() {
		return ModBlocks.DINING_TABLES.get(table);
	}

	public Block chairBlock() {
		return ModBlocks.DINING_CHAIRS.get(chair);
	}

	public Block curtainBlock() {
		if (blinds) {
			return wood == Wood.WALNUT ? ModBlocks.BLINDS_WOOD : ModBlocks.BLINDS_WHITE;
		}
		return ModBlocks.CURTAINS.get(curtain);
	}

	public Block mediaConsole() {
		return ModBlocks.MEDIA_CONSOLES.get(wood);
	}

	public Block art() {
		return ModBlocks.ART.get(random.nextInt(ModBlocks.ART.size()));
	}

	public Block wideArt() {
		return ModBlocks.WIDE_ART.get(random.nextInt(ModBlocks.WIDE_ART.size()));
	}

	public Block smallPlant() {
		return ModBlocks.SMALL_PLANTS.get(random.nextInt(ModBlocks.SMALL_PLANTS.size()));
	}

	public Block tallPlant() {
		return ModBlocks.TALL_PLANTS.get(random.nextInt(ModBlocks.TALL_PLANTS.size()));
	}
}
