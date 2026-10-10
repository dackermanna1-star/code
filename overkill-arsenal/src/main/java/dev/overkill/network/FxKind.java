package dev.overkill.network;

/** Effect ids carried by {@link FxPayload}. */
public final class FxKind {
	/** a = muzzle, b = beam end, scale = 1 if the beam hit something. One tick of the held laser. */
	public static final int SUNLINE_BEAM = 1;
	/** a = blast centre, scale = blast size. Fire burst, embers, magma, smoke. */
	public static final int SUNLINE_BLAST = 2;
	/** a = muzzle, b = direction, scale = charge stage. */
	public static final int ORB_LAUNCH = 3;
	/** a = detonation point, b = entry point, scale = charge stage. The big one. */
	public static final int ORB_IMPACT = 4;
	/** a = muzzle, scale = stage reached while charging. */
	public static final int CHARGE_STAGE = 5;
	/** a = position of the overcharged cannon. */
	public static final int BACKFIRE = 6;
	/** a = from, b = to, scale = thickness, seed = shape. Jagged lightning arc. */
	public static final int ARC = 7;
	/** a = centre, scale = ring radius. One step of an expanding electric shockwave. */
	public static final int STORM_RING = 8;
	/** a = landing point, scale = radius. Initial impact of the Thunderfall Slam. */
	public static final int STORM_SLAM = 9;
	/** a = strike point. Lightning column impact. */
	public static final int THUNDER_STRIKE = 10;
	/** a = where the victim vanished, b = where it re-appears. */
	public static final int RIFT_SWALLOW = 11;
	/** a = centre, b = facing direction, scale = size. Tear opening flash. */
	public static final int RIFT_OPEN = 12;
	/** a = centre. Black hole forms. */
	public static final int SINGULARITY_BIRTH = 13;
	/** a = centre, scale = blast radius. Implosion then detonation. */
	public static final int SINGULARITY_COLLAPSE = 14;
	/** a = centre. White hole repulsion burst. */
	public static final int WHITE_HOLE_BURST = 15;
	/** a = muzzle, b = direction, seed = which weapon. */
	public static final int MUZZLE_FLASH = 16;

	public static final int WEAPON_SUNLINE = 0;
	public static final int WEAPON_WORLDBREAKER = 1;
	public static final int WEAPON_GRAVEMAKER = 2;
	public static final int WEAPON_GRAVEMAKER_WHITE = 3;

	private FxKind() {
	}
}
