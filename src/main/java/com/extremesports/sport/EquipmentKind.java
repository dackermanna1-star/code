package com.extremesports.sport;

import com.extremesports.sport.HandlingProfile.DriveType;

/**
 * Every distinct piece of rideable equipment. Each has its own handling so no two feel the same.
 */
public enum EquipmentKind {
	//                                       drive            impulse driveMax stroke top   rr       drag   turnS turnF grip  pop   spin  brake   rough wheelR backward
	STREET_BOARD("skateboard", SportType.SKATEBOARD,
		new HandlingProfile(DriveType.PUSH, 0.11F, 0.36F, 11, 1.10F, 0.0022F, 0.010F, 9.0F, 3.4F, 0.85F, 0.30F, 26.0F, 0.011F, 1.00F, 0.027F, false),
		new int[]{5, 6, 5, 6, 8}, 0.62F, 1.04F),
	CRUISER("cruiser", SportType.SKATEBOARD,
		new HandlingProfile(DriveType.PUSH, 0.112F, 0.40F, 12, 1.15F, 0.0018F, 0.010F, 10.0F, 3.8F, 0.90F, 0.26F, 22.0F, 0.011F, 0.70F, 0.031F, false),
		new int[]{6, 6, 6, 7, 5}, 0.66F, 0.95F),
	LONGBOARD("longboard", SportType.SKATEBOARD,
		new HandlingProfile(DriveType.PUSH, 0.10F, 0.42F, 13, 1.35F, 0.0016F, 0.0085F, 6.5F, 2.8F, 0.95F, 0.22F, 16.0F, 0.012F, 0.75F, 0.035F, false),
		new int[]{8, 5, 8, 4, 3}, 0.70F, 1.32F),
	BMX("bmx_bike", SportType.BMX,
		new HandlingProfile(DriveType.PEDAL, 0.020F, 0.48F, 16, 1.20F, 0.0020F, 0.011F, 12.0F, 4.5F, 0.95F, 0.34F, 22.0F, 0.020F, 0.50F, 0.254F, false),
		new int[]{7, 6, 6, 7, 7}, 0.80F, 1.55F),
	SCOOTER("kick_scooter", SportType.SCOOTER,
		new HandlingProfile(DriveType.KICK, 0.068F, 0.33F, 9, 1.00F, 0.0030F, 0.010F, 13.0F, 5.0F, 0.90F, 0.30F, 28.0F, 0.016F, 1.30F, 0.055F, false),
		new int[]{5, 7, 6, 8, 8}, 0.62F, 1.10F),
	SKATES("inline_skates", SportType.SKATES,
		new HandlingProfile(DriveType.STRIDE, 0.060F, 0.40F, 14, 1.10F, 0.0024F, 0.010F, 14.0F, 5.0F, 0.92F, 0.32F, 30.0F, 0.012F, 1.40F, 0.029F, true),
		new int[]{6, 7, 6, 9, 7}, 0.45F, 0.6F);

	private final String itemId;
	private final SportType sport;
	private final HandlingProfile handling;
	private final int[] baseStats;
	/** Collision box width while ridden. */
	public final float width;
	/** Visual length of the equipment, used for grind contact and model scale. */
	public final float length;

	EquipmentKind(String itemId, SportType sport, HandlingProfile handling, int[] baseStats, float width, float length) {
		this.itemId = itemId;
		this.sport = sport;
		this.handling = handling;
		this.baseStats = baseStats;
		this.width = width;
		this.length = length;
	}

	public String itemId() {
		return itemId;
	}

	public SportType sport() {
		return sport;
	}

	public HandlingProfile handling() {
		return handling;
	}

	/** Base stats in order: speed, acceleration, stability, steering, tricks (each 0-10). */
	public int baseStat(int index) {
		return baseStats[index];
	}

	public String translationKey() {
		return "item.extremesports." + itemId;
	}

	/** Height of the rider's feet above the entity position. */
	public float standHeight() {
		return switch (this) {
			case STREET_BOARD -> 0.17F;
			case CRUISER -> 0.19F;
			case LONGBOARD -> 0.16F;
			case BMX -> 0.29F;
			case SCOOTER -> 0.15F;
			case SKATES -> 0.225F;
		};
	}

	public static EquipmentKind byOrdinal(int ordinal) {
		EquipmentKind[] values = values();
		return ordinal >= 0 && ordinal < values.length ? values[ordinal] : STREET_BOARD;
	}

	public static EquipmentKind byItemId(String id) {
		for (EquipmentKind kind : values()) {
			if (kind.itemId.equals(id)) {
				return kind;
			}
		}
		return STREET_BOARD;
	}
}
