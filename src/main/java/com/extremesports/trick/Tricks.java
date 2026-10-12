package com.extremesports.trick;

import com.extremesports.sport.SportType;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * Registry of every trick, organised by sport, category and input direction.
 */
public final class Tricks {
	private static final Map<String, TrickDef> BY_ID = new HashMap<>();
	private static final List<TrickDef> ALL = new ArrayList<>();
	private static final Map<SportType, Map<TrickCategory, Map<InputDir, TrickDef>>> TABLE = new EnumMap<>(SportType.class);

	private static SportType sport;

	private static void register(TrickCategory category, InputDir dir, String name, int points, float perUnit, int duration,
								 float eqRoll, float eqYaw, float eqPitch, float partSpin, float riderPitch, float riderRoll, String pose) {
		TrickDef def = new TrickDef(sport.id() + "." + name, sport, category, dir, points, perUnit, duration,
			eqRoll, eqYaw, eqPitch, partSpin, riderPitch, riderRoll, pose);
		BY_ID.put(def.id(), def);
		ALL.add(def);
		TABLE.computeIfAbsent(sport, s -> new EnumMap<>(TrickCategory.class))
			.computeIfAbsent(category, c -> new EnumMap<>(InputDir.class))
			.put(dir, def);
	}

	private static void ollie(String name, int points) {
		register(TrickCategory.OLLIE, InputDir.NEUTRAL, name, points, 0, 0, 0, 0, 0, 0, 0, 0, "ollie");
	}

	private static void flip(InputDir dir, String name, int points, int duration, float roll, float yaw, float pitch) {
		register(TrickCategory.FLIP, dir, name, points, 0, duration, roll, yaw, pitch, 0, 0, 0, "flick");
	}

	private static void bodyFlip(InputDir dir, String name, int points, int duration, float riderPitch, float riderRoll, float eqYaw) {
		register(TrickCategory.FLIP, dir, name, points, 0, duration, 0, eqYaw, 0, 0, riderPitch, riderRoll, "tuck");
	}

	private static void whip(InputDir dir, String name, int points, int duration, float eqYaw, float eqPitch, float partSpin, String pose) {
		register(TrickCategory.WHIP, dir, name, points, 0, duration, 0, eqYaw, eqPitch, partSpin, 0, 0, pose);
	}

	private static void grab(InputDir dir, String name, int points, float perTick, String pose) {
		register(TrickCategory.GRAB, dir, name, points, perTick, 4, 0, 0, 0, 0, 0, 0, pose);
	}

	private static void grind(InputDir dir, String name, int points, float perBlock, float yawOffset, float pitchOffset, float rollOffset, String pose) {
		register(TrickCategory.GRIND, dir, name, points, perBlock, 0, rollOffset, yawOffset, pitchOffset, 0, 0, 0, pose);
	}

	private static void manual(InputDir dir, String name, int points, float perTick, float pitch, String pose) {
		register(TrickCategory.MANUAL, dir, name, points, perTick, 0, 0, 0, pitch, 0, 0, 0, pose);
	}

	static {
		sport = SportType.SKATEBOARD;
		ollie("ollie", 25);
		ollie("nollie", 40);
		flip(InputDir.NEUTRAL, "kickflip", 100, 9, 360, 0, 0);
		flip(InputDir.DOWN, "heelflip", 100, 9, -360, 0, 0);
		flip(InputDir.UP, "hardflip", 260, 10, 360, 180, 30);
		flip(InputDir.LEFT, "varial_kickflip", 200, 10, 360, -180, 0);
		flip(InputDir.RIGHT, "tre_flip", 400, 11, 360, 360, 0);
		flip(InputDir.DOWN_LEFT, "varial_heelflip", 220, 10, -360, 180, 0);
		flip(InputDir.UP_LEFT, "inward_heelflip", 280, 10, -360, -180, 0);
		whip(InputDir.NEUTRAL, "pop_shove_it", 75, 7, -180, 0, 0, "shuv");
		whip(InputDir.DOWN, "fs_shove_it", 80, 7, 180, 0, 0, "shuv");
		whip(InputDir.LEFT, "360_shove_it", 180, 9, -360, 0, 0, "shuv");
		whip(InputDir.RIGHT, "360_fs_shove_it", 200, 9, 360, 0, 0, "shuv");
		whip(InputDir.UP, "impossible", 300, 10, 0, 360, 0, "shuv");
		grab(InputDir.NEUTRAL, "indy", 100, 8, "indy");
		grab(InputDir.UP, "nosegrab", 110, 9, "nosegrab");
		grab(InputDir.DOWN, "tailgrab", 110, 9, "tailgrab");
		grab(InputDir.LEFT, "melon", 120, 10, "melon");
		grab(InputDir.RIGHT, "mute", 120, 10, "mute");
		grab(InputDir.UP_LEFT, "crail", 180, 12, "crail");
		grab(InputDir.UP_RIGHT, "method", 200, 14, "method");
		grab(InputDir.DOWN_LEFT, "stalefish", 180, 12, "stalefish");
		grab(InputDir.DOWN_RIGHT, "benihana", 220, 13, "benihana");
		grind(InputDir.NEUTRAL, "fifty_fifty", 100, 30, 0, 0, 0, "5050");
		grind(InputDir.UP, "nosegrind", 150, 36, 0, -12, 0, "nosegrind");
		grind(InputDir.DOWN, "five_o", 150, 36, 0, 12, 0, "5_0");
		grind(InputDir.LEFT, "boardslide", 125, 32, 90, 0, 0, "boardslide");
		grind(InputDir.RIGHT, "lipslide", 175, 38, -90, 0, 0, "boardslide");
		grind(InputDir.UP_LEFT, "crooked", 225, 42, 18, -10, 8, "nosegrind");
		grind(InputDir.UP_RIGHT, "overcrook", 250, 44, -18, -10, -8, "nosegrind");
		grind(InputDir.DOWN_LEFT, "smith", 225, 42, 10, 10, 10, "5_0");
		grind(InputDir.DOWN_RIGHT, "feeble", 225, 42, -10, 10, -10, "5_0");
		manual(InputDir.NEUTRAL, "manual", 50, 4, 12, "manual");
		manual(InputDir.UP, "nose_manual", 75, 5, -12, "nose_manual");

		sport = SportType.BMX;
		ollie("bunny_hop", 25);
		bodyFlip(InputDir.NEUTRAL, "backflip", 500, 19, -360, 0, 0);
		bodyFlip(InputDir.UP, "frontflip", 750, 21, 360, 0, 0);
		bodyFlip(InputDir.LEFT, "flair", 800, 21, -360, 0, -180);
		bodyFlip(InputDir.RIGHT, "cork_540", 850, 22, -180, 180, 0);
		whip(InputDir.NEUTRAL, "tailwhip", 300, 11, 360, 0, 0, "tailwhip");
		whip(InputDir.DOWN, "barspin", 250, 9, 0, 0, 360, "barspin");
		whip(InputDir.UP, "bar_whip", 550, 13, 360, 0, 360, "tailwhip");
		whip(InputDir.LEFT, "opposite_whip", 320, 11, -360, 0, 0, "tailwhip");
		grab(InputDir.NEUTRAL, "no_hander", 120, 10, "no_hander");
		grab(InputDir.UP, "superman", 180, 13, "superman");
		grab(InputDir.DOWN, "can_can", 130, 10, "can_can");
		grab(InputDir.LEFT, "no_footer", 130, 10, "no_footer");
		grab(InputDir.RIGHT, "table_top", 160, 12, "table_top");
		grab(InputDir.UP_LEFT, "x_up", 150, 11, "x_up");
		grab(InputDir.UP_RIGHT, "turndown", 170, 12, "turndown");
		grab(InputDir.DOWN_LEFT, "seat_grab", 120, 9, "seat_grab");
		grab(InputDir.DOWN_RIGHT, "tuck_no_hander", 200, 14, "tuck_no_hander");
		grind(InputDir.NEUTRAL, "double_peg", 100, 30, 0, 0, 0, "pegs");
		grind(InputDir.UP, "icepick", 175, 40, 0, -28, 0, "icepick");
		grind(InputDir.DOWN, "feeble", 150, 36, 12, 4, -10, "pegs");
		grind(InputDir.LEFT, "smith", 150, 36, -12, 4, 10, "pegs");
		grind(InputDir.RIGHT, "crooked", 175, 38, 20, 0, 0, "pegs");
		manual(InputDir.NEUTRAL, "manual", 50, 4, 24, "manual");
		manual(InputDir.UP, "nose_manual", 80, 5, -18, "nose_manual");
		manual(InputDir.DOWN, "wheelie", 40, 3, 30, "wheelie");

		sport = SportType.SCOOTER;
		ollie("hop", 25);
		bodyFlip(InputDir.NEUTRAL, "backflip", 500, 18, -360, 0, 0);
		bodyFlip(InputDir.UP, "frontflip", 700, 20, 360, 0, 0);
		bodyFlip(InputDir.LEFT, "flair", 780, 20, -360, 0, 180);
		whip(InputDir.NEUTRAL, "tailwhip", 250, 9, 360, 0, 0, "tailwhip");
		whip(InputDir.DOWN, "barspin", 200, 8, 0, 0, 360, "barspin");
		whip(InputDir.UP, "heelwhip", 300, 10, -360, 0, 0, "tailwhip");
		whip(InputDir.LEFT, "bri_flip", 450, 12, 360, 0, 0, "briflip");
		grab(InputDir.NEUTRAL, "no_hander", 120, 10, "no_hander");
		grab(InputDir.UP, "superman", 180, 13, "superman");
		grab(InputDir.DOWN, "can_can", 130, 10, "can_can");
		grab(InputDir.LEFT, "no_footer", 130, 10, "no_footer");
		grab(InputDir.RIGHT, "tuck_no_hander", 200, 14, "tuck_no_hander");
		grind(InputDir.NEUTRAL, "fifty_fifty", 100, 30, 0, 0, 0, "deck");
		grind(InputDir.UP, "nosegrind", 150, 36, 0, -14, 0, "deck");
		grind(InputDir.DOWN, "feeble", 160, 36, 14, 6, -8, "deck");
		grind(InputDir.LEFT, "smith", 160, 36, -14, 6, 8, "deck");
		grind(InputDir.RIGHT, "crooked", 180, 38, 22, -6, 0, "deck");
		manual(InputDir.NEUTRAL, "manual", 50, 4, 16, "manual");
		manual(InputDir.UP, "nose_manual", 75, 5, -14, "nose_manual");

		sport = SportType.SKATES;
		ollie("jump", 25);
		bodyFlip(InputDir.NEUTRAL, "backflip", 450, 17, -360, 0, 0);
		bodyFlip(InputDir.UP, "frontflip", 650, 19, 360, 0, 0);
		bodyFlip(InputDir.LEFT, "misty_flip", 700, 19, 270, 90, 0);
		bodyFlip(InputDir.RIGHT, "rodeo_flip", 720, 19, -270, 90, 0);
		whip(InputDir.NEUTRAL, "flatspin", 300, 12, 0, 0, 0, "flatspin");
		whip(InputDir.DOWN, "bio", 380, 14, 0, 0, 0, "bio");
		whip(InputDir.UP, "cork", 420, 14, 0, 0, 0, "cork");
		grab(InputDir.NEUTRAL, "mute", 100, 8, "skate_mute");
		grab(InputDir.UP, "japan", 160, 12, "japan");
		grab(InputDir.DOWN, "stale", 120, 9, "stale");
		grab(InputDir.LEFT, "safety", 110, 9, "safety");
		grab(InputDir.RIGHT, "liu_kang", 150, 11, "liu_kang");
		grab(InputDir.UP_LEFT, "rocket", 180, 13, "rocket");
		grab(InputDir.UP_RIGHT, "christ_air", 220, 15, "christ_air");
		grind(InputDir.NEUTRAL, "frontside", 100, 30, 90, 0, 0, "h_block");
		grind(InputDir.UP, "soul", 150, 36, 0, 0, 0, "soul");
		grind(InputDir.DOWN, "backside", 120, 32, -90, 0, 0, "h_block");
		grind(InputDir.LEFT, "makio", 170, 38, 0, 0, 0, "makio");
		grind(InputDir.RIGHT, "royale", 160, 36, 0, 0, 0, "royale");
		grind(InputDir.UP_LEFT, "topsoul", 200, 42, 0, 0, 0, "soul");
		grind(InputDir.UP_RIGHT, "mizou", 210, 42, 0, 0, 0, "royale");
		grind(InputDir.DOWN_LEFT, "unity", 220, 44, 0, 0, 0, "h_block");
		grind(InputDir.DOWN_RIGHT, "acid", 200, 40, 0, 0, 0, "makio");
		manual(InputDir.NEUTRAL, "heel_roll", 50, 4, 10, "heel_roll");
		manual(InputDir.UP, "toe_roll", 70, 5, -10, "toe_roll");
	}

	private Tricks() {
	}

	public static @Nullable TrickDef byId(String id) {
		return BY_ID.get(id);
	}

	public static List<TrickDef> all() {
		return Collections.unmodifiableList(ALL);
	}

	/** Index used in compact network/entity sync; -1 for none. */
	public static int indexOf(@Nullable TrickDef def) {
		return def == null ? -1 : ALL.indexOf(def);
	}

	public static @Nullable TrickDef byIndex(int index) {
		return index >= 0 && index < ALL.size() ? ALL.get(index) : null;
	}

	public static Map<InputDir, TrickDef> table(SportType sport, TrickCategory category) {
		Map<TrickCategory, Map<InputDir, TrickDef>> bySport = TABLE.get(sport);
		if (bySport == null) {
			return Map.of();
		}
		return bySport.getOrDefault(category, Map.of());
	}

	/** Resolves the trick for the held direction, falling back to simpler variants when a diagonal isn't mapped. */
	public static @Nullable TrickDef select(SportType sport, TrickCategory category, InputDir dir) {
		Map<InputDir, TrickDef> table = table(sport, category);
		for (InputDir candidate : dir.fallbacks()) {
			TrickDef def = table.get(candidate);
			if (def != null) {
				return def;
			}
		}
		return null;
	}

	public static TrickDef ollieFor(SportType sport, boolean nollie) {
		if (sport == SportType.SKATEBOARD) {
			return BY_ID.get(nollie ? "skateboard.nollie" : "skateboard.ollie");
		}
		return table(sport, TrickCategory.OLLIE).get(InputDir.NEUTRAL);
	}

	/** Points awarded for a spin of the given size (rounded down to a multiple of 180). */
	public static int spinPoints(int degrees) {
		return switch (Math.min(degrees / 180, 7)) {
			case 0 -> 0;
			case 1 -> 100;
			case 2 -> 250;
			case 3 -> 450;
			case 4 -> 700;
			case 5 -> 1000;
			case 6 -> 1400;
			default -> 1800;
		};
	}
}
