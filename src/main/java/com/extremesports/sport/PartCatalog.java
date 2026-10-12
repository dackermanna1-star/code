package com.extremesports.sport;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * All customization slots and options. Options may change handling (stat deltas) and may require an unlock.
 * Stats are indexed: 0 speed, 1 acceleration, 2 stability, 3 steering, 4 tricks.
 */
public final class PartCatalog {
	public static final int SPEED = 0;
	public static final int ACCEL = 1;
	public static final int STABILITY = 2;
	public static final int STEERING = 3;
	public static final int TRICKS = 4;
	public static final String[] STAT_KEYS = {"speed", "acceleration", "stability", "steering", "tricks"};

	/** One selectable option inside a slot. */
	public record Option(String id, int[] statDelta, @Nullable String unlock) {
		public String translationKey(String slot) {
			return "part.extremesports." + slot + "." + id;
		}
	}

	/** A customization slot such as "wheels" with its ordered options; the first option is the default. */
	public record Slot(String id, List<Option> options) {
		public Option option(String optionId) {
			for (Option option : options) {
				if (option.id.equals(optionId)) {
					return option;
				}
			}
			return options.getFirst();
		}

		public String translationKey() {
			return "slot.extremesports." + id;
		}
	}

	/** A colorable component of the equipment. */
	public record ColorSlot(String id, int defaultColor) {
		public String translationKey() {
			return "color_slot.extremesports." + id;
		}
	}

	/** Shared color palette offered in the workshop. */
	public static final int[] PALETTE = {
		0xF2F2F2, 0x9DA3A6, 0x4A4F52, 0x1C1C1F, 0xD6362F, 0xF07A1E, 0xF5C518, 0x8BC34A,
		0x2E9E4F, 0x1FB5B0, 0x2F7DE1, 0x283A9E, 0x7A3FC4, 0xD14FA3, 0x8A5A2B, 0xD8B07A
	};

	private static final Map<SportType, Map<String, Slot>> SLOTS = new EnumMap<>(SportType.class);
	private static final Map<EquipmentKind, List<ColorSlot>> COLOR_SLOTS = new EnumMap<>(EquipmentKind.class);

	public static final List<String> GRAPHICS = List.of(
		"none", "stripes", "checker", "stars", "logo", "flames", "lightning", "waves", "galaxy", "camo", "skull", "sunset", "circuit", "gold", "diamond");
	public static final List<String> STICKERS = List.of(
		"none", "star", "heart", "smiley", "bolt", "flame", "eso", "skull", "diamond", "creeper", "crown");
	public static final List<String> EFFECTS = List.of(
		"none", "dust", "sparks", "flames", "rainbow", "hearts", "notes", "snow", "ender");

	private static Option opt(String id, int speed, int accel, int stability, int steering, int tricks) {
		return new Option(id, new int[]{speed, accel, stability, steering, tricks}, null);
	}

	private static Option locked(String id, String unlock, int speed, int accel, int stability, int steering, int tricks) {
		return new Option(id, new int[]{speed, accel, stability, steering, tricks}, unlock);
	}

	private static Option cosmetic(String id, @Nullable String unlock) {
		return new Option(id, new int[5], unlock);
	}

	private static Slot slot(String id, Option... options) {
		return new Slot(id, List.of(options));
	}

	private static Slot cosmeticSlot(String id, List<String> ids, Map<String, String> unlocks) {
		List<Option> options = new ArrayList<>();
		for (String option : ids) {
			options.add(cosmetic(option, unlocks.get(option)));
		}
		return new Slot(id, List.copyOf(options));
	}

	private static void register(SportType sport, Slot... slots) {
		Map<String, Slot> map = new LinkedHashMap<>();
		for (Slot slot : slots) {
			map.put(slot.id(), slot);
		}
		SLOTS.put(sport, map);
	}

	static {
		Slot graphic = cosmeticSlot("graphic", GRAPHICS, Map.of(
			"flames", "graphic_flames", "lightning", "graphic_lightning", "waves", "graphic_waves", "galaxy", "graphic_galaxy",
			"camo", "graphic_camo", "skull", "graphic_skull", "sunset", "graphic_sunset", "circuit", "graphic_circuit",
			"gold", "graphic_gold", "diamond", "graphic_diamond"));
		Slot sticker = cosmeticSlot("sticker", STICKERS, Map.of("crown", "sticker_crown", "diamond", "sticker_diamond"));
		Slot effect = cosmeticSlot("effect", EFFECTS, Map.of(
			"sparks", "effect_sparks", "flames", "effect_flames", "rainbow", "effect_rainbow", "hearts", "effect_hearts",
			"notes", "effect_notes", "snow", "effect_snow", "ender", "effect_ender"));
		Slot bearings = slot("bearings",
			opt("basic", 0, 0, 0, 0, 0),
			opt("abec7", 1, 0, 0, 0, 0),
			locked("ceramic", "bearings_ceramic", 1, 1, 0, 0, 0),
			locked("swiss", "bearings_swiss", 2, 1, 0, 0, 0));

		register(SportType.SKATEBOARD,
			graphic,
			slot("wheels",
				opt("standard", 0, 0, 0, 0, 0),
				opt("small", -1, 1, 0, 0, 1),
				opt("large", 1, 0, 0, 0, -1),
				opt("soft", 0, 0, 1, 0, -1)),
			slot("trucks",
				opt("standard", 0, 0, 0, 0, 0),
				opt("light", 0, 0, -1, 0, 1),
				opt("wide", 0, 0, 1, -1, 0),
				opt("loose", 0, 0, -1, 1, 0)),
			bearings,
			sticker,
			effect);
		register(SportType.BMX,
			slot("frame",
				opt("street", 0, 0, 0, 0, 0),
				opt("park", 0, 1, -1, 0, 1),
				opt("dirt", 0, 0, 1, 0, 0),
				opt("race", 1, 1, 0, 0, -1)),
			slot("bars",
				opt("standard", 0, 0, 0, 0, 0),
				opt("highrise", 0, 0, 1, -1, 0),
				opt("low", 0, 0, -1, 0, 1)),
			slot("tires",
				opt("street", 0, 0, 0, 0, 0),
				opt("park", 0, 1, 0, 0, 0),
				opt("knobby", -1, 0, 1, 0, 0)),
			slot("seat",
				opt("pivotal", 0, 0, 0, 0, 0),
				opt("padded", 0, 0, 0, 0, 0),
				opt("slim", 0, 0, 0, 0, 0)),
			slot("pegs",
				opt("steel", 0, 0, 0, 0, 0),
				opt("plastic", 0, 0, 1, 0, 0),
				opt("none", 0, 0, 0, 0, 0)),
			sticker,
			effect);
		register(SportType.SCOOTER,
			slot("deck",
				opt("standard", 0, 0, 0, 0, 0),
				opt("wide", 0, 0, 1, 0, -1),
				opt("light", 0, 0, -1, 0, 1)),
			slot("bars",
				opt("standard", 0, 0, 0, 0, 0),
				opt("tall", 0, 0, 1, 0, 0),
				opt("wide", 0, 0, 0, 1, -1)),
			slot("wheels",
				opt("w110", 0, 0, 0, 0, 0),
				opt("w100", -1, 0, 0, 0, 1),
				opt("w120", 1, 0, 0, 0, -1)),
			sticker,
			effect);
		register(SportType.SKATES,
			slot("frame",
				opt("aggressive", -1, 0, 1, 0, 1),
				opt("freestyle", 0, 0, 0, 1, 0),
				opt("speed", 2, 0, 0, -1, -1)),
			slot("wheels",
				opt("w80", 0, 0, 0, 0, 0),
				opt("anti_rocker", -1, 0, 0, 0, 1),
				opt("w90", 1, 0, 0, -1, 0)),
			bearings,
			effect);

		COLOR_SLOTS.put(EquipmentKind.STREET_BOARD, List.of(
			new ColorSlot("deck", 0xD6362F), new ColorSlot("grip", 0x1C1C1F), new ColorSlot("wheels", 0xF2F2F2), new ColorSlot("trucks", 0x9DA3A6)));
		COLOR_SLOTS.put(EquipmentKind.CRUISER, List.of(
			new ColorSlot("deck", 0x1FB5B0), new ColorSlot("grip", 0x1C1C1F), new ColorSlot("wheels", 0xF5C518), new ColorSlot("trucks", 0x9DA3A6)));
		COLOR_SLOTS.put(EquipmentKind.LONGBOARD, List.of(
			new ColorSlot("deck", 0x8A5A2B), new ColorSlot("grip", 0x1C1C1F), new ColorSlot("wheels", 0xF07A1E), new ColorSlot("trucks", 0x4A4F52)));
		COLOR_SLOTS.put(EquipmentKind.BMX, List.of(
			new ColorSlot("frame", 0x2F7DE1), new ColorSlot("bars", 0x9DA3A6), new ColorSlot("rims", 0x1C1C1F), new ColorSlot("seat", 0x1C1C1F), new ColorSlot("tires", 0x2B2B2E)));
		COLOR_SLOTS.put(EquipmentKind.SCOOTER, List.of(
			new ColorSlot("deck", 0x7A3FC4), new ColorSlot("bars", 0x1C1C1F), new ColorSlot("grips", 0xD6362F), new ColorSlot("wheels", 0xF2F2F2)));
		COLOR_SLOTS.put(EquipmentKind.SKATES, List.of(
			new ColorSlot("boot", 0x1C1C1F), new ColorSlot("frame", 0x9DA3A6), new ColorSlot("wheels", 0x8BC34A)));
	}

	private PartCatalog() {
	}

	public static Map<String, Slot> slots(SportType sport) {
		return SLOTS.get(sport);
	}

	public static @Nullable Slot slot(SportType sport, String slot) {
		return SLOTS.get(sport).get(slot);
	}

	public static List<ColorSlot> colorSlots(EquipmentKind kind) {
		return COLOR_SLOTS.get(kind);
	}

	public static int defaultColor(EquipmentKind kind, String slot) {
		for (ColorSlot colorSlot : COLOR_SLOTS.get(kind)) {
			if (colorSlot.id().equals(slot)) {
				return colorSlot.defaultColor();
			}
		}
		return 0xFFFFFF;
	}
}
