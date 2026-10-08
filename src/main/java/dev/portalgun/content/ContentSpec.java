package dev.portalgun.content;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.portalgun.PortalGunMod;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The generated content description (tools/generate.py writes /portalgun/content.json).
 * It lists every dimension, block, item and creature so registration and client rendering
 * can be driven from one place.
 */
public final class ContentSpec {
	private static ContentSpec instance;

	public List<DimensionInfo> dimensions = new ArrayList<>();
	public List<BlockSpec> blocks = new ArrayList<>();
	public List<ItemSpec> items = new ArrayList<>();
	public List<CreatureSpec> creatures = new ArrayList<>();

	public static ContentSpec get() {
		if (instance == null) {
			load();
		}
		return instance;
	}

	public static void load() {
		if (instance != null) {
			return;
		}
		Gson gson = new GsonBuilder().create();
		try (InputStream in = ContentSpec.class.getResourceAsStream("/portalgun/content.json")) {
			if (in == null) {
				throw new IllegalStateException("Missing /portalgun/content.json - run tools/generate.py");
			}
			instance = gson.fromJson(new InputStreamReader(in, StandardCharsets.UTF_8), ContentSpec.class);
		} catch (Exception e) {
			throw new RuntimeException("Failed to load Portal Gun content spec", e);
		}
		PortalGunMod.LOGGER.debug("Loaded content spec");
	}

	public static final class DimensionInfo {
		public String id;
		public String code;
		public String name;
		public String tagline;
		public String description;
		public int danger;
		public String color;
		public String platform = "minecraft:stone";
		/** surface, cave or void - controls how arrival spots are searched. */
		public String arrival = "surface";
		public int arrivalY = 80;
		public List<String> effects = new ArrayList<>();
		public List<Celestial> sky = new ArrayList<>();
		public List<String> creatures = new ArrayList<>();
		public List<String> biomes = new ArrayList<>();
	}

	public static final class Celestial {
		public String texture;
		public float size = 30;
		/** Rotation around the vertical axis, degrees. */
		public float yaw;
		/** Elevation above the horizon at noon, degrees (90 = straight up). */
		public float pitch = 90;
		/** Spin of the sprite itself, degrees. */
		public float roll;
		/** Degrees per game day this body moves across the sky (0 = fixed in the sky). */
		public float speed;
		public float alpha = 1.0F;
		public boolean additive;
	}

	public static final class BlockSpec {
		public String id;
		public String name;
		public String kind;
		public float hardness = 1.0F;
		public float resistance = -1;
		public String sound = "stone";
		public int light;
		public String tool;
		public String map = "stone";
		public float friction = 0.6F;
		public float jump = 1.0F;
		public float speed = 1.0F;
		public float bounce;
		public float damage;
		public boolean flammable;
		public String layer = "solid";
		public String particle;
		public boolean emissive;
		public String effect;
		public String fruit;
	}

	public static final class ItemSpec {
		public String id;
		public String name;
		public String kind = "material";
		public int stack = 64;
		public String rarity = "common";
		public boolean glint;
		public Food food;
		public String lore;
	}

	public static final class Food {
		public int nutrition = 4;
		public float saturation = 0.3F;
		public boolean always;
		public boolean fast;
		public List<EffectSpec> effects = new ArrayList<>();
	}

	public static final class EffectSpec {
		public String id;
		public int duration = 100;
		public int amplifier;
		public float chance = 1.0F;
	}

	public static final class CreatureSpec {
		public String id;
		public String name;
		public String dimension;
		public String movement = "ground";
		public String category = "creature";
		public float width = 0.8F;
		public float height = 0.9F;
		public float scale = 1.0F;
		public float shadow = 0.5F;
		public double health = 10;
		public double damage = 2;
		public double speed = 0.25;
		public double flySpeed = 0.4;
		public double armor;
		public double follow = 24;
		public double knockbackResist;
		public String behavior = "passive";
		public String attack = "none";
		public Ranged ranged;
		public EffectSpec onHit;
		public List<String> abilities = new ArrayList<>();
		public boolean fireImmune;
		public boolean glowEyes;
		public boolean emissive;
		public String placement = "ground";
		public String spawnLight = "any";
		public Sounds sounds = new Sounds();
		public String tempt;
		public int xp = 3;
		public Map<String, Float> extra = new HashMap<>();
	}

	public static final class Ranged {
		public String color = "#7cff4a";
		public float damage = 3;
		public float speed = 1.2F;
		public int cooldown = 40;
		public EffectSpec effect;
		public float explode;
		public int count = 1;
		public float spread;
		public String particle;
	}

	public static final class Sounds {
		public String ambient;
		public String hurt;
		public String death;
		public String step;
		public float pitch = 1.0F;
		public float volume = 1.0F;
	}
}
