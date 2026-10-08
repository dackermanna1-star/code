package dev.portalgun.block;

import dev.portalgun.PortalGunMod;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageSources;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.material.MapColor;
import org.jetbrains.annotations.Nullable;

/**
 * String → vanilla object tables used by spec-driven blocks. These are explicit maps (not reflection) because
 * field names are obfuscated at runtime in production.
 */
public final class BlockLookups {
	public static final Map<String, SoundType> SOUNDS = new HashMap<>();
	public static final Map<String, MapColor> MAP_COLORS = new HashMap<>();

	static {
		s("empty", SoundType.EMPTY);
		s("wood", SoundType.WOOD);
		s("gravel", SoundType.GRAVEL);
		s("grass", SoundType.GRASS);
		s("lily_pad", SoundType.LILY_PAD);
		s("stone", SoundType.STONE);
		s("metal", SoundType.METAL);
		s("glass", SoundType.GLASS);
		s("wool", SoundType.WOOL);
		s("sand", SoundType.SAND);
		s("snow", SoundType.SNOW);
		s("powder_snow", SoundType.POWDER_SNOW);
		s("ladder", SoundType.LADDER);
		s("anvil", SoundType.ANVIL);
		s("slime", SoundType.SLIME_BLOCK);
		s("slime_block", SoundType.SLIME_BLOCK);
		s("honey", SoundType.HONEY_BLOCK);
		s("honey_block", SoundType.HONEY_BLOCK);
		s("wet_grass", SoundType.WET_GRASS);
		s("coral", SoundType.CORAL_BLOCK);
		s("coral_block", SoundType.CORAL_BLOCK);
		s("bamboo", SoundType.BAMBOO);
		s("bamboo_sapling", SoundType.BAMBOO_SAPLING);
		s("scaffolding", SoundType.SCAFFOLDING);
		s("sweet_berry_bush", SoundType.SWEET_BERRY_BUSH);
		s("crop", SoundType.CROP);
		s("hard_crop", SoundType.HARD_CROP);
		s("vine", SoundType.VINE);
		s("nether_wart", SoundType.NETHER_WART);
		s("lantern", SoundType.LANTERN);
		s("stem", SoundType.STEM);
		s("nylium", SoundType.NYLIUM);
		s("fungus", SoundType.FUNGUS);
		s("roots", SoundType.ROOTS);
		s("shroomlight", SoundType.SHROOMLIGHT);
		s("weeping_vines", SoundType.WEEPING_VINES);
		s("twisting_vines", SoundType.TWISTING_VINES);
		s("soul_sand", SoundType.SOUL_SAND);
		s("soul_soil", SoundType.SOUL_SOIL);
		s("basalt", SoundType.BASALT);
		s("wart_block", SoundType.WART_BLOCK);
		s("netherrack", SoundType.NETHERRACK);
		s("nether", SoundType.NETHERRACK);
		s("nether_bricks", SoundType.NETHER_BRICKS);
		s("nether_sprouts", SoundType.NETHER_SPROUTS);
		s("nether_ore", SoundType.NETHER_ORE);
		s("bone", SoundType.BONE_BLOCK);
		s("bone_block", SoundType.BONE_BLOCK);
		s("netherite", SoundType.NETHERITE_BLOCK);
		s("netherite_block", SoundType.NETHERITE_BLOCK);
		s("ancient_debris", SoundType.ANCIENT_DEBRIS);
		s("lodestone", SoundType.LODESTONE);
		s("chain", SoundType.CHAIN);
		s("nether_gold_ore", SoundType.NETHER_GOLD_ORE);
		s("gilded_blackstone", SoundType.GILDED_BLACKSTONE);
		s("candle", SoundType.CANDLE);
		s("amethyst", SoundType.AMETHYST);
		s("amethyst_cluster", SoundType.AMETHYST_CLUSTER);
		s("crystal", SoundType.AMETHYST_CLUSTER);
		s("small_amethyst_bud", SoundType.SMALL_AMETHYST_BUD);
		s("medium_amethyst_bud", SoundType.MEDIUM_AMETHYST_BUD);
		s("large_amethyst_bud", SoundType.LARGE_AMETHYST_BUD);
		s("tuff", SoundType.TUFF);
		s("tuff_bricks", SoundType.TUFF_BRICKS);
		s("polished_tuff", SoundType.POLISHED_TUFF);
		s("calcite", SoundType.CALCITE);
		s("dripstone", SoundType.DRIPSTONE_BLOCK);
		s("dripstone_block", SoundType.DRIPSTONE_BLOCK);
		s("pointed_dripstone", SoundType.POINTED_DRIPSTONE);
		s("copper", SoundType.COPPER);
		s("copper_bulb", SoundType.COPPER_BULB);
		s("copper_grate", SoundType.COPPER_GRATE);
		s("cave_vines", SoundType.CAVE_VINES);
		s("spore_blossom", SoundType.SPORE_BLOSSOM);
		s("cactus_flower", SoundType.CACTUS_FLOWER);
		s("azalea", SoundType.AZALEA);
		s("flowering_azalea", SoundType.FLOWERING_AZALEA);
		s("moss_carpet", SoundType.MOSS_CARPET);
		s("pink_petals", SoundType.PINK_PETALS);
		s("petals", SoundType.PINK_PETALS);
		s("leaf_litter", SoundType.LEAF_LITTER);
		s("moss", SoundType.MOSS);
		s("big_dripleaf", SoundType.BIG_DRIPLEAF);
		s("small_dripleaf", SoundType.SMALL_DRIPLEAF);
		s("rooted_dirt", SoundType.ROOTED_DIRT);
		s("hanging_roots", SoundType.HANGING_ROOTS);
		s("azalea_leaves", SoundType.AZALEA_LEAVES);
		s("leaves", SoundType.AZALEA_LEAVES);
		s("sculk_sensor", SoundType.SCULK_SENSOR);
		s("sculk_catalyst", SoundType.SCULK_CATALYST);
		s("sculk", SoundType.SCULK);
		s("sculk_vein", SoundType.SCULK_VEIN);
		s("sculk_shrieker", SoundType.SCULK_SHRIEKER);
		s("glow_lichen", SoundType.GLOW_LICHEN);
		s("deepslate", SoundType.DEEPSLATE);
		s("deepslate_bricks", SoundType.DEEPSLATE_BRICKS);
		s("deepslate_tiles", SoundType.DEEPSLATE_TILES);
		s("polished_deepslate", SoundType.POLISHED_DEEPSLATE);
		s("froglight", SoundType.FROGLIGHT);
		s("frogspawn", SoundType.FROGSPAWN);
		s("mangrove_roots", SoundType.MANGROVE_ROOTS);
		s("muddy_mangrove_roots", SoundType.MUDDY_MANGROVE_ROOTS);
		s("mud", SoundType.MUD);
		s("mud_bricks", SoundType.MUD_BRICKS);
		s("packed_mud", SoundType.PACKED_MUD);
		s("hanging_sign", SoundType.HANGING_SIGN);
		s("bamboo_wood", SoundType.BAMBOO_WOOD);
		s("nether_wood", SoundType.NETHER_WOOD);
		s("cherry", SoundType.CHERRY_WOOD);
		s("cherry_wood", SoundType.CHERRY_WOOD);
		s("cherry_sapling", SoundType.CHERRY_SAPLING);
		s("cherry_leaves", SoundType.CHERRY_LEAVES);
		s("chiseled_bookshelf", SoundType.CHISELED_BOOKSHELF);
		s("suspicious_sand", SoundType.SUSPICIOUS_SAND);
		s("suspicious_gravel", SoundType.SUSPICIOUS_GRAVEL);
		s("decorated_pot", SoundType.DECORATED_POT);
		s("trial_spawner", SoundType.TRIAL_SPAWNER);
		s("sponge", SoundType.SPONGE);
		s("wet_sponge", SoundType.WET_SPONGE);
		s("vault", SoundType.VAULT);
		s("creaking_heart", SoundType.CREAKING_HEART);
		s("heavy_core", SoundType.HEAVY_CORE);
		s("cobweb", SoundType.COBWEB);
		s("spawner", SoundType.SPAWNER);
		s("resin", SoundType.RESIN);
		s("resin_bricks", SoundType.RESIN_BRICKS);
		s("iron", SoundType.IRON);
		s("dried_ghast", SoundType.DRIED_GHAST);

		MAP_COLORS.putAll(Map.ofEntries(
			Map.entry("none", MapColor.NONE), Map.entry("grass", MapColor.GRASS), Map.entry("sand", MapColor.SAND),
			Map.entry("wool", MapColor.WOOL), Map.entry("fire", MapColor.FIRE), Map.entry("ice", MapColor.ICE),
			Map.entry("metal", MapColor.METAL), Map.entry("plant", MapColor.PLANT), Map.entry("snow", MapColor.SNOW),
			Map.entry("clay", MapColor.CLAY), Map.entry("dirt", MapColor.DIRT), Map.entry("stone", MapColor.STONE),
			Map.entry("water", MapColor.WATER), Map.entry("wood", MapColor.WOOD), Map.entry("quartz", MapColor.QUARTZ),
			Map.entry("color_orange", MapColor.COLOR_ORANGE), Map.entry("color_magenta", MapColor.COLOR_MAGENTA),
			Map.entry("color_light_blue", MapColor.COLOR_LIGHT_BLUE), Map.entry("color_yellow", MapColor.COLOR_YELLOW),
			Map.entry("color_light_green", MapColor.COLOR_LIGHT_GREEN), Map.entry("color_pink", MapColor.COLOR_PINK),
			Map.entry("color_gray", MapColor.COLOR_GRAY), Map.entry("color_light_gray", MapColor.COLOR_LIGHT_GRAY),
			Map.entry("color_cyan", MapColor.COLOR_CYAN), Map.entry("color_purple", MapColor.COLOR_PURPLE),
			Map.entry("color_blue", MapColor.COLOR_BLUE), Map.entry("color_brown", MapColor.COLOR_BROWN),
			Map.entry("color_green", MapColor.COLOR_GREEN), Map.entry("color_red", MapColor.COLOR_RED),
			Map.entry("color_black", MapColor.COLOR_BLACK), Map.entry("gold", MapColor.GOLD), Map.entry("diamond", MapColor.DIAMOND),
			Map.entry("lapis", MapColor.LAPIS), Map.entry("emerald", MapColor.EMERALD), Map.entry("podzol", MapColor.PODZOL),
			Map.entry("nether", MapColor.NETHER), Map.entry("terracotta_white", MapColor.TERRACOTTA_WHITE),
			Map.entry("terracotta_orange", MapColor.TERRACOTTA_ORANGE), Map.entry("terracotta_magenta", MapColor.TERRACOTTA_MAGENTA),
			Map.entry("terracotta_light_blue", MapColor.TERRACOTTA_LIGHT_BLUE), Map.entry("terracotta_yellow", MapColor.TERRACOTTA_YELLOW),
			Map.entry("terracotta_light_green", MapColor.TERRACOTTA_LIGHT_GREEN), Map.entry("terracotta_pink", MapColor.TERRACOTTA_PINK),
			Map.entry("terracotta_gray", MapColor.TERRACOTTA_GRAY), Map.entry("terracotta_light_gray", MapColor.TERRACOTTA_LIGHT_GRAY),
			Map.entry("terracotta_cyan", MapColor.TERRACOTTA_CYAN), Map.entry("terracotta_purple", MapColor.TERRACOTTA_PURPLE),
			Map.entry("terracotta_blue", MapColor.TERRACOTTA_BLUE), Map.entry("terracotta_brown", MapColor.TERRACOTTA_BROWN),
			Map.entry("terracotta_green", MapColor.TERRACOTTA_GREEN), Map.entry("terracotta_red", MapColor.TERRACOTTA_RED),
			Map.entry("terracotta_black", MapColor.TERRACOTTA_BLACK), Map.entry("crimson_nylium", MapColor.CRIMSON_NYLIUM),
			Map.entry("crimson_stem", MapColor.CRIMSON_STEM), Map.entry("crimson_hyphae", MapColor.CRIMSON_HYPHAE),
			Map.entry("warped_nylium", MapColor.WARPED_NYLIUM), Map.entry("warped_stem", MapColor.WARPED_STEM),
			Map.entry("warped_hyphae", MapColor.WARPED_HYPHAE), Map.entry("warped_wart_block", MapColor.WARPED_WART_BLOCK),
			Map.entry("deepslate", MapColor.DEEPSLATE), Map.entry("raw_iron", MapColor.RAW_IRON),
			Map.entry("glow_lichen", MapColor.GLOW_LICHEN)));
		// friendly aliases
		MAP_COLORS.put("orange", MapColor.COLOR_ORANGE);
		MAP_COLORS.put("magenta", MapColor.COLOR_MAGENTA);
		MAP_COLORS.put("light_blue", MapColor.COLOR_LIGHT_BLUE);
		MAP_COLORS.put("yellow", MapColor.COLOR_YELLOW);
		MAP_COLORS.put("lime", MapColor.COLOR_LIGHT_GREEN);
		MAP_COLORS.put("light_green", MapColor.COLOR_LIGHT_GREEN);
		MAP_COLORS.put("pink", MapColor.COLOR_PINK);
		MAP_COLORS.put("gray", MapColor.COLOR_GRAY);
		MAP_COLORS.put("light_gray", MapColor.COLOR_LIGHT_GRAY);
		MAP_COLORS.put("cyan", MapColor.COLOR_CYAN);
		MAP_COLORS.put("purple", MapColor.COLOR_PURPLE);
		MAP_COLORS.put("blue", MapColor.COLOR_BLUE);
		MAP_COLORS.put("brown", MapColor.COLOR_BROWN);
		MAP_COLORS.put("green", MapColor.COLOR_GREEN);
		MAP_COLORS.put("red", MapColor.COLOR_RED);
		MAP_COLORS.put("black", MapColor.COLOR_BLACK);
		MAP_COLORS.put("white", MapColor.SNOW);
	}

	private BlockLookups() {
	}

	private static void s(String name, SoundType type) {
		SOUNDS.put(name, type);
	}

	public static SoundType sound(@Nullable String name, SoundType fallback) {
		if (name == null) {
			return fallback;
		}
		SoundType t = SOUNDS.get(name.toLowerCase(Locale.ROOT));
		if (t == null) {
			PortalGunMod.LOGGER.warn("Unknown block sound '{}', using default", name);
			return fallback;
		}
		return t;
	}

	public static MapColor mapColor(@Nullable String name, MapColor fallback) {
		if (name == null) {
			return fallback;
		}
		String n = name.toLowerCase(Locale.ROOT);
		if (n.startsWith("minecraft:")) {
			n = n.substring(10);
		}
		MapColor c = MAP_COLORS.get(n);
		if (c == null) {
			PortalGunMod.LOGGER.warn("Unknown map color '{}', using default", name);
			return fallback;
		}
		return c;
	}

	/** "#rrggbb" (or "rrggbb", "#aarrggbb") → 0xRRGGBB, or -1 when absent/invalid. */
	public static int rgb(@Nullable String hex) {
		if (hex == null || hex.isEmpty()) {
			return -1;
		}
		String s = hex.startsWith("#") ? hex.substring(1) : hex;
		try {
			long v = Long.parseLong(s, 16);
			return (int) (v & 0xFFFFFF);
		} catch (NumberFormatException e) {
			return -1;
		}
	}

	/**
	 * Parses a particle reference: a simple particle type id ("minecraft:white_smoke") or "dust:#rrggbb[:scale]".
	 * Returns null (with a warning) for unknown or parameterised types.
	 */
	public static @Nullable ParticleOptions particle(@Nullable String spec) {
		if (spec == null || spec.isEmpty()) {
			return null;
		}
		if (spec.startsWith("dust:")) {
			String[] parts = spec.split(":");
			int color = parts.length > 1 ? rgb(parts[1]) : 0xFFFFFF;
			float scale = 1.0F;
			if (parts.length > 2) {
				try {
					scale = Float.parseFloat(parts[2]);
				} catch (NumberFormatException ignored) {
					// keep default
				}
			}
			return new DustParticleOptions(color < 0 ? 0xFFFFFF : color, Math.max(0.01F, Math.min(4.0F, scale)));
		}
		Identifier id = Identifier.tryParse(spec);
		if (id == null) {
			PortalGunMod.LOGGER.warn("Bad particle id '{}'", spec);
			return null;
		}
		ParticleType<?> type = BuiltInRegistries.PARTICLE_TYPE.getValue(id);
		if (type instanceof SimpleParticleType simple) {
			return simple;
		}
		PortalGunMod.LOGGER.warn("Particle '{}' is unknown or needs parameters; block particles must be simple particle types", spec);
		return null;
	}

	public static @Nullable Holder<MobEffect> effect(@Nullable String id) {
		if (id == null || id.isEmpty()) {
			return null;
		}
		Identifier rl = Identifier.tryParse(id);
		if (rl == null) {
			return null;
		}
		Holder<MobEffect> h = BuiltInRegistries.MOB_EFFECT.get(rl).map(r -> (Holder<MobEffect>) r).orElse(null);
		if (h == null) {
			PortalGunMod.LOGGER.warn("Unknown status effect '{}'", id);
		}
		return h;
	}

	public static DamageSource damage(DamageSources sources, @Nullable String type) {
		if (type == null) {
			return sources.hotFloor();
		}
		return switch (type) {
			case "cactus", "thorns", "spikes" -> sources.cactus();
			case "magic", "poison", "radiation" -> sources.magic();
			case "freeze", "cold" -> sources.freeze();
			case "wither" -> sources.wither();
			case "generic" -> sources.generic();
			case "sweet_berry_bush", "berry" -> sources.sweetBerryBush();
			case "lightning", "shock", "lightning_bolt" -> sources.lightningBolt();
			case "in_fire", "fire" -> sources.inFire();
			case "stalagmite" -> sources.stalagmite();
			default -> sources.hotFloor();
		};
	}
}
