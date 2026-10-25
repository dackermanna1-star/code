package com.godforge.weapon;

import com.godforge.weapon.WeaponSettings.Field;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** Static description of every god weapon: identity, colours, firing modes and adjustable settings. */
public enum WeaponType {
	WORLDCUTTER(
		"worldcutter", 0xB18CFF, 0xE9FBFF,
		List.of(WeaponMode.instant("rift_slash"), WeaponMode.ultimate("sever_reality", 40)),
		List.of(
			SettingSpec.blocks(Field.RANGE, "cut_length", 24, 256, 96),
			SettingSpec.blocks(Field.WIDTH, "cut_gap", 4, 24, 10),
			SettingSpec.blocks(Field.POWER, "cut_depth", 8, 96, 56),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	),
	LASER_BEAM(
		"laser_beam", 0xFF3A3A, 0xFFD6D6,
		List.of(WeaponMode.charged("annihilation_beam", 0), WeaponMode.ultimate("overload", 30)),
		List.of(
			SettingSpec.level(Field.POWER, "laser_power", 1, 10, 6),
			SettingSpec.blocks(Field.WIDTH, "beam_width", 1, 6, 2),
			SettingSpec.blocks(Field.RANGE, "beam_range", 16, 512, 160),
			SettingSpec.percent(Field.INTENSITY, "beam_intensity", 10, 100),
			SettingSpec.color(Field.COLOR, "beam_color", 0),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	),
	ORB_ERASER(
		"orb_eraser", 0xFF5CF0, 0xFFFFFF,
		List.of(WeaponMode.charged("eraser_orb", 50), WeaponMode.ultimate("prismatic_annihilation", 80)),
		List.of(
			SettingSpec.percent(Field.SIZE, "orb_size", 20, 100),
			SettingSpec.percent(Field.POWER, "orb_speed", 10, 100),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	),
	ASTEROID_GUN(
		"asteroid_gun", 0xFF8A1F, 0xFFE0A0,
		List.of(WeaponMode.charged("summon_asteroid", 60), WeaponMode.ultimate("planetfall", 90)),
		List.of(
			SettingSpec.percent(Field.SIZE, "asteroid_size", 20, 100),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	),
	BLACK_HOLE(
		"black_hole", 0x8A4DFF, 0xFFB45A,
		List.of(WeaponMode.charged("singularity", 50), WeaponMode.ultimate("event_horizon", 70)),
		List.of(
			SettingSpec.percent(Field.INTENSITY, "pull_strength", 20, 100),
			SettingSpec.percent(Field.SIZE, "singularity_lifetime", 30, 100),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	),
	REALITY_BREAKER(
		"reality_breaker", 0xD04DFF, 0x6CF6FF,
		List.of(WeaponMode.charged("fracture", 30), WeaponMode.ultimate("dimensional_collapse", 60)),
		List.of(
			SettingSpec.percent(Field.SIZE, "fracture_size", 30, 100),
			SettingSpec.count(Field.POWER, "rift_count", 0, 4, 2),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	),
	STARFALL_BOW(
		"starfall_bow", 0xFFE27A, 0x8FD0FF,
		List.of(WeaponMode.charged("star_shot", 20), WeaponMode.charged("meteor_shower", 45), WeaponMode.ultimate("celestial_judgment", 70)),
		List.of(
			SettingSpec.percent(Field.INTENSITY, "shower_density", 20, 100),
			SettingSpec.percent(Field.SIZE, "star_size", 30, 100),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	),
	GODFIST(
		"godfist", 0xFFC93C, 0x5FF4FF,
		List.of(WeaponMode.charged("kinetic_shockwave", 30), WeaponMode.ultimate("worldbreaker", 50)),
		List.of(
			SettingSpec.percent(Field.POWER, "launch_power", 10, 100),
			SettingSpec.percent(Field.SIZE, "shockwave_size", 20, 100),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	),
	SUNFORGE(
		"sunforge", 0xFFB01F, 0xFFF6C0,
		List.of(
			WeaponMode.instant("solar_bolt"),
			WeaponMode.instant("orbiting_suns"),
			WeaponMode.charged("stellar_core", 80),
			WeaponMode.ultimate("artificial_sun", 60)
		),
		List.of(
			SettingSpec.count(Field.POWER, "orbiter_count", 1, 6, 3),
			SettingSpec.percent(Field.SIZE, "sun_size", 25, 100),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	),
	PLANET_CRACKER(
		"planet_cracker", 0x3DFF7A, 0xD2FFE0,
		List.of(WeaponMode.charged("cracker_shell", 40), WeaponMode.ultimate("orbital_bombardment", 60)),
		List.of(
			SettingSpec.percent(Field.SIZE, "crater_size", 20, 100),
			SettingSpec.percent(Field.INTENSITY, "barrage_density", 20, 100),
			SettingSpec.toggle(Field.NO_TERRAIN, "no_terrain", false)
		)
	);

	private final String id;
	private final int color;
	private final int accent;
	private final List<WeaponMode> modes;
	private final List<SettingSpec> settings;

	WeaponType(String id, int color, int accent, List<WeaponMode> modes, List<SettingSpec> settings) {
		this.id = id;
		this.color = color;
		this.accent = accent;
		this.modes = modes;
		this.settings = settings;
	}

	public String id() {
		return this.id;
	}

	/** Primary RGB colour used for UI accents, particles and glows. */
	public int color() {
		return this.color;
	}

	public int accent() {
		return this.accent;
	}

	public List<WeaponMode> modes() {
		return this.modes;
	}

	public List<SettingSpec> settings() {
		return this.settings;
	}

	public WeaponMode mode(int index) {
		return this.modes.get(Math.floorMod(index, this.modes.size()));
	}

	public String translationKey() {
		return "item.godforge." + this.id;
	}

	public WeaponSettings defaultSettings() {
		WeaponSettings settings = new WeaponSettings(0, 0, 0, 0, 0, 100, 100, 0);
		for (SettingSpec spec : this.settings) {
			settings = settings.with(spec.field(), spec.defaultValue());
		}
		return settings;
	}

	/** Clamps every slot to its declared range (unknown slots fall back to defaults). */
	public WeaponSettings sanitize(WeaponSettings in) {
		WeaponSettings out = this.defaultSettings().with(Field.MODE, Math.floorMod(in.mode(), this.modes.size()));
		for (SettingSpec spec : this.settings) {
			out = out.with(spec.field(), spec.clamp(in.get(spec.field())));
		}
		return out;
	}

	public static @Nullable WeaponType byId(String id) {
		for (WeaponType type : values()) {
			if (type.id.equals(id)) {
				return type;
			}
		}
		return null;
	}
}
