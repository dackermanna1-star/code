package com.jjkshowdown.client.cinematic;

import com.jjkshowdown.cinematic.CinematicType;
import net.minecraft.network.chat.Component;

import java.util.List;

/**
 * Camera choreography for every cinematic. Positions are in the anchor's local frame
 * (x = right, y = up, z = forward along the anchor's body facing), relative to the anchor's feet,
 * unless the {@link Frame} says otherwise. Keyframes are interpolated with Catmull-Rom splines.
 */
public final class Shots {
	private Shots() {
	}

	public enum Frame {
		/** Offsets relative to the anchor (caster). */
		ANCHOR,
		/** Offsets relative to the midpoint between anchor and target, x axis perpendicular to the line between them. */
		PAIR,
		/** Offsets relative to the target. */
		TARGET
	}

	public enum Look {ANCHOR_EYE, ANCHOR_CHEST, ANCHOR_HANDS, TARGET_EYE, MID, AHEAD}

	/** One camera keyframe. */
	public record Key(float t, Frame frame, double x, double y, double z, Look look, float fov) {
	}

	public enum TitleStyle {DOMAIN, NAME_CARD, TECHNIQUE, INCANTATION, CLASH}

	/** A timed title. Lines may be translation keys resolved at runtime ("$name" / "$title" use the anchor's character). */
	public record Title(float start, float end, TitleStyle style, String top, String main, String sub) {
	}

	public record Sequence(List<Key> keys, List<Title> titles, int flashColor, float flashAt) {
	}

	private static Key k(float t, Frame f, double x, double y, double z, Look l, float fov) {
		return new Key(t, f, x, y, z, l, fov);
	}

	public static Sequence get(CinematicType type) {
		return switch (type) {
			case CHARACTER_INTRO -> new Sequence(List.of(
					k(0.00f, Frame.ANCHOR, 0.0, 0.5, 4.5, Look.ANCHOR_CHEST, 60),
					k(0.35f, Frame.ANCHOR, 2.6, 1.3, 2.2, Look.ANCHOR_EYE, 55),
					k(0.70f, Frame.ANCHOR, 1.2, 1.7, 1.9, Look.ANCHOR_EYE, 48),
					k(1.00f, Frame.ANCHOR, 0.35, 1.65, 1.35, Look.ANCHOR_EYE, 42)),
					List.of(new Title(0.30f, 1.0f, TitleStyle.NAME_CARD, "", "$name", "$title")), 0, -1);
			case BOSS_INTRO -> new Sequence(List.of(
					k(0.00f, Frame.TARGET, -1.5, 2.4, -3.4, Look.ANCHOR_EYE, 60),
					k(0.30f, Frame.TARGET, -1.3, 2.2, -2.8, Look.ANCHOR_EYE, 55),
					k(0.45f, Frame.ANCHOR, 0.5, 0.3, 2.6, Look.ANCHOR_EYE, 50),
					k(0.80f, Frame.ANCHOR, 1.6, 1.0, 3.2, Look.ANCHOR_EYE, 48),
					k(1.00f, Frame.ANCHOR, 2.2, 1.6, 4.6, Look.ANCHOR_CHEST, 55)),
					List.of(new Title(0.45f, 1.0f, TitleStyle.NAME_CARD, "cinematic.jjkshowdown.rival", "$name", "$title")), 0, -1);
			case UNLIMITED_VOID -> new Sequence(List.of(
					k(0.00f, Frame.ANCHOR, 0.45, 1.45, 1.9, Look.ANCHOR_HANDS, 50),
					k(0.25f, Frame.ANCHOR, 0.25, 1.55, 1.6, Look.ANCHOR_HANDS, 44),
					k(0.45f, Frame.ANCHOR, 0.0, 1.65, 1.5, Look.ANCHOR_EYE, 40),
					k(0.75f, Frame.ANCHOR, 3.5, 3.0, 6.5, Look.ANCHOR_CHEST, 70),
					k(1.00f, Frame.ANCHOR, 5.0, 4.5, 9.0, Look.ANCHOR_CHEST, 80)),
					List.of(new Title(0.12f, 1.0f, TitleStyle.DOMAIN, "cinematic.jjkshowdown.domain_expansion",
							"domain.jjkshowdown.unlimited_void", "domain.jjkshowdown.unlimited_void.jp")), 0xFFFFFF, 0.45f);
			case MALEVOLENT_SHRINE -> new Sequence(List.of(
					k(0.00f, Frame.ANCHOR, -0.3, 0.6, 1.6, Look.ANCHOR_HANDS, 50),
					k(0.30f, Frame.ANCHOR, 0.0, 1.4, 1.2, Look.ANCHOR_EYE, 42),
					k(0.55f, Frame.ANCHOR, 0.0, 0.4, 3.0, Look.ANCHOR_EYE, 55),
					k(0.80f, Frame.ANCHOR, -2.5, 3.0, 8.0, Look.ANCHOR_CHEST, 72),
					k(1.00f, Frame.ANCHOR, -4.0, 6.0, 12.0, Look.ANCHOR_CHEST, 80)),
					List.of(new Title(0.12f, 1.0f, TitleStyle.DOMAIN, "cinematic.jjkshowdown.domain_expansion",
							"domain.jjkshowdown.malevolent_shrine", "domain.jjkshowdown.malevolent_shrine.jp")), 0xFF2030, 0.5f);
			case HOLLOW_PURPLE -> new Sequence(List.of(
					k(0.00f, Frame.ANCHOR, 3.2, 1.3, 1.2, Look.ANCHOR_HANDS, 55),
					k(0.45f, Frame.ANCHOR, 2.2, 1.5, 1.6, Look.ANCHOR_HANDS, 45),
					k(0.70f, Frame.ANCHOR, 0.9, 1.6, 1.4, Look.ANCHOR_HANDS, 40),
					k(0.85f, Frame.ANCHOR, -0.9, 1.9, -1.6, Look.AHEAD, 60),
					k(1.00f, Frame.ANCHOR, -0.7, 1.9, -2.2, Look.AHEAD, 70)),
					List.of(new Title(0.30f, 1.0f, TitleStyle.TECHNIQUE, "cinematic.jjkshowdown.hollow_technique",
							"ability.jjkshowdown.hollow_purple.short", "ability.jjkshowdown.hollow_purple.jp")), 0xB060FF, 0.82f);
			case HOLLOW_PURPLE_200 -> new Sequence(List.of(
					k(0.00f, Frame.ANCHOR, 0.0, 1.7, 3.5, Look.ANCHOR_EYE, 55),
					k(0.25f, Frame.ANCHOR, 2.5, 1.4, 2.5, Look.ANCHOR_EYE, 48),
					k(0.45f, Frame.ANCHOR, 0.25, 1.72, 1.05, Look.ANCHOR_EYE, 32),
					k(0.65f, Frame.ANCHOR, 2.6, 1.4, 1.4, Look.ANCHOR_HANDS, 45),
					k(0.85f, Frame.ANCHOR, -1.0, 2.0, -1.8, Look.AHEAD, 60),
					k(1.00f, Frame.ANCHOR, -0.8, 2.1, -2.6, Look.AHEAD, 75)),
					List.of(new Title(0.02f, 0.20f, TitleStyle.INCANTATION, "", "incantation.jjkshowdown.purple.1", ""),
							new Title(0.18f, 0.36f, TitleStyle.INCANTATION, "", "incantation.jjkshowdown.purple.2", ""),
							new Title(0.34f, 0.52f, TitleStyle.INCANTATION, "", "incantation.jjkshowdown.purple.3", ""),
							new Title(0.50f, 0.66f, TitleStyle.INCANTATION, "", "incantation.jjkshowdown.purple.4", ""),
							new Title(0.64f, 1.0f, TitleStyle.TECHNIQUE, "cinematic.jjkshowdown.hollow_technique",
									"ability.jjkshowdown.hollow_purple.200", "ability.jjkshowdown.hollow_purple.jp")), 0xB060FF, 0.84f);
			case WORLD_SLASH -> new Sequence(List.of(
					k(0.00f, Frame.ANCHOR, 0.6, 1.0, 1.4, Look.ANCHOR_HANDS, 45),
					k(0.40f, Frame.ANCHOR, 0.3, 1.9, 1.0, Look.ANCHOR_HANDS, 40),
					k(0.65f, Frame.ANCHOR, 4.0, 1.8, 0.5, Look.ANCHOR_CHEST, 60),
					k(1.00f, Frame.ANCHOR, 6.0, 2.5, 6.0, Look.AHEAD, 75)),
					List.of(new Title(0.20f, 1.0f, TitleStyle.TECHNIQUE, "", "ability.jjkshowdown.world_slash", "ability.jjkshowdown.world_slash.jp")),
					0, -1);
			case DOMAIN_CLASH -> new Sequence(List.of(
					k(0.00f, Frame.PAIR, 9.0, 2.5, 0.0, Look.MID, 70),
					k(0.50f, Frame.PAIR, 7.0, 1.8, 0.0, Look.MID, 62),
					k(1.00f, Frame.PAIR, 5.5, 1.6, 0.0, Look.MID, 58)),
					List.of(new Title(0.15f, 1.0f, TitleStyle.CLASH, "", "cinematic.jjkshowdown.domain_clash", "cinematic.jjkshowdown.domain_clash.jp")),
					0xFFFFFF, 0.1f);
			case FINISHER -> new Sequence(List.of(
					k(0.00f, Frame.PAIR, 4.0, 0.6, -1.0, Look.MID, 60),
					k(0.60f, Frame.PAIR, 3.0, 0.9, 0.5, Look.MID, 52),
					k(0.85f, Frame.TARGET, 1.4, 1.4, 1.6, Look.TARGET_EYE, 45),
					k(1.00f, Frame.TARGET, 1.8, 1.6, 2.4, Look.TARGET_EYE, 55)),
					List.of(new Title(0.80f, 1.0f, TitleStyle.CLASH, "", "cinematic.jjkshowdown.finish", "")), 0xFFFFFF, 0.92f);
			case PHASE_TWO -> new Sequence(List.of(
					k(0.00f, Frame.ANCHOR, 0.0, 1.0, 5.0, Look.ANCHOR_CHEST, 60),
					k(0.40f, Frame.ANCHOR, 2.5, 1.4, 3.0, Look.ANCHOR_EYE, 50),
					k(0.75f, Frame.ANCHOR, 0.4, 1.7, 1.4, Look.ANCHOR_EYE, 40),
					k(1.00f, Frame.ANCHOR, 0.0, 1.2, 3.5, Look.ANCHOR_EYE, 55)),
					List.of(new Title(0.35f, 1.0f, TitleStyle.NAME_CARD, "cinematic.jjkshowdown.phase_two", "$phase_name", "$phase_title")),
					0xFFFFFF, 0.38f);
			case BOSS_DEFEAT -> new Sequence(List.of(
					k(0.00f, Frame.ANCHOR, 0.0, 1.2, 4.0, Look.ANCHOR_CHEST, 55),
					k(1.00f, Frame.ANCHOR, 3.0, 3.0, 6.0, Look.ANCHOR_CHEST, 65)),
					List.of(), 0, -1);
		};
	}

	public static Component resolve(String key, com.jjkshowdown.sorcerer.CharacterType c) {
		if (key == null || key.isEmpty()) return Component.empty();
		return switch (key) {
			case "$name" -> c.displayName();
			case "$title" -> c.title();
			case "$phase_name" -> Component.translatable("phase.jjkshowdown." + c.id() + ".name");
			case "$phase_title" -> Component.translatable("phase.jjkshowdown." + c.id() + ".title");
			default -> Component.translatable(key);
		};
	}
}
