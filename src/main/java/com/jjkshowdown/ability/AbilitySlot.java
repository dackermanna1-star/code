package com.jjkshowdown.ability;

/**
 * Input slots. Each character maps one ability to each slot. Slot ordinals are used on the wire.
 */
public enum AbilitySlot {
	PRIMARY("primary"),
	SECONDARY("secondary"),
	TERTIARY("tertiary"),
	ULTIMATE("ultimate"),
	TOGGLE("toggle"),
	DOMAIN("domain"),
	HEAL("heal");

	public static final int COUNT = values().length;
	public final String id;

	AbilitySlot(String id) {
		this.id = id;
	}

	public static AbilitySlot byOrdinal(int i) {
		AbilitySlot[] v = values();
		return i >= 0 && i < v.length ? v[i] : null;
	}
}
