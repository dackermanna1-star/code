package com.godforge.weapon;

/**
 * Describes one user-adjustable weapon parameter so that both the server (validation) and the
 * client (configuration screen) agree on its meaning and limits.
 */
public record SettingSpec(WeaponSettings.Field field, String key, int min, int max, int defaultValue, Format format) {
	public enum Format {
		PERCENT,
		BLOCKS,
		LEVEL,
		COUNT,
		COLOR,
		TOGGLE
	}

	public static SettingSpec percent(WeaponSettings.Field field, String key, int min, int def) {
		return new SettingSpec(field, key, min, 100, def, Format.PERCENT);
	}

	public static SettingSpec blocks(WeaponSettings.Field field, String key, int min, int max, int def) {
		return new SettingSpec(field, key, min, max, def, Format.BLOCKS);
	}

	public static SettingSpec level(WeaponSettings.Field field, String key, int min, int max, int def) {
		return new SettingSpec(field, key, min, max, def, Format.LEVEL);
	}

	public static SettingSpec count(WeaponSettings.Field field, String key, int min, int max, int def) {
		return new SettingSpec(field, key, min, max, def, Format.COUNT);
	}

	public static SettingSpec color(WeaponSettings.Field field, String key, int def) {
		return new SettingSpec(field, key, 0, BeamColors.COUNT - 1, def, Format.COLOR);
	}

	public static SettingSpec toggle(WeaponSettings.Field field, String key, boolean def) {
		return new SettingSpec(field, key, 0, 1, def ? 1 : 0, Format.TOGGLE);
	}

	public String translationKey() {
		return "setting.godforge." + this.key;
	}

	public int clamp(int value) {
		return Math.max(this.min, Math.min(this.max, value));
	}
}
