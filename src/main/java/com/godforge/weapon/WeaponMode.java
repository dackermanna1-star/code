package com.godforge.weapon;

/**
 * A selectable firing mode of a weapon.
 *
 * @param key          translation suffix ({@code mode.godforge.<key>})
 * @param ultimate     ultimates use the long per-weapon ultimate cooldown and the ultimate permission level
 * @param chargeTicks  ticks of holding use needed for a full charge (0 = fires instantly on click)
 */
public record WeaponMode(String key, boolean ultimate, int chargeTicks) {
	public static WeaponMode instant(String key) {
		return new WeaponMode(key, false, 0);
	}

	public static WeaponMode charged(String key, int ticks) {
		return new WeaponMode(key, false, ticks);
	}

	public static WeaponMode ultimate(String key, int ticks) {
		return new WeaponMode(key, true, ticks);
	}

	public String translationKey() {
		return "mode.godforge." + this.key;
	}
}
