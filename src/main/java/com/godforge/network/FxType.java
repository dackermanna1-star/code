package com.godforge.network;

/** Visual/audio effect presets the server can trigger on clients with a single small packet. */
public enum FxType {
	/** Expanding ground ring. a = max radius, b = duration (ticks). */
	SHOCKWAVE,
	/** Generic god-tier explosion burst. a = radius. */
	EXPLOSION,
	/** Full-screen flash. a = intensity, b = duration, vec.x = range. */
	FLASH,
	/** Camera shake. a = intensity, b = duration, vec.x = range. */
	SHAKE,
	/** View distortion (warp / FOV pulse). a = intensity, b = duration, vec.x = range. */
	DISTORT,
	/** Lightning-style world brightening. b = ticks, vec.x = range. */
	SKY_FLASH,
	/** Rolling dust and rubble along pos -> pos + vec. a = width. */
	DUST_LINE,
	/** Worldcutter crescent slash. vec = direction * reach. */
	SLASH,
	/** Worldcutter sever: blinding vertical cut. vec = direction * length, a = height. */
	SEVER,
	/** Energy gathering at pos. a = charge fraction. */
	CHARGE,
	/** Black hole collapse. a = radius. */
	IMPLOSION,
	/** Rainbow nova of the Orb Eraser. a = radius. */
	NOVA,
	/** Stellar detonation. a = radius. */
	STAR_BURST,
	/** Godfist kinetic burst. vec = direction, a = radius. */
	KINETIC,
	/** Solar eruption pulse. a = radius. */
	SOLAR,
	/** Orbital lance impact. a = radius. */
	ORBITAL,
	/** Reality shatter burst. a = radius. */
	SHATTER,
	/** Muzzle flash. vec = direction, a = size. */
	MUZZLE,
	/** Target designation pulse. a = radius. */
	LOCK_ON,
	/** Rising heat shimmer. a = radius, b = duration. */
	HEAT_HAZE,
	/** Ring of debris particles thrown outward. a = radius. */
	DEBRIS_RING;

	private static final FxType[] VALUES = values();

	public static FxType byId(int id) {
		return id >= 0 && id < VALUES.length ? VALUES[id] : EXPLOSION;
	}
}
