package dev.juukulius.animation;

/**
 * Network-stable identifiers for the keyframed action animations. The client loads the matching clip from
 * {@code assets/julius_juukulius/julius_animations/<name>.json}; the server only needs the id to broadcast it.
 * Locomotion (idle stance, walk, sprint, jump, fall, land, flinch) is procedural on the client and has no id here.
 */
public enum JuliusAnim {
	TRANSFORM("transform"),
	REVERT("revert"),
	SPIRITS_SUMMON("spirits_summon"),
	SPIRITS_DISMISS("spirits_dismiss"),
	SLASH_1("slash_1"),
	SLASH_2("slash_2"),
	SLASH_3("slash_3"),
	HEAVY_STRIKE("heavy_strike"),
	CHARGE_RELEASE("charge_release"),
	CAST_FORWARD("cast_forward"),
	CAST_SELF("cast_self"),
	CAST_GROUND("cast_ground"),
	CAST_SWEEP("cast_sweep"),
	GALE_STEP("gale_step"),
	UL_GORA("ul_gora"),
	AL_CLAUZERIA("al_clauzeria"),
	CRANVEL_ACTIVATE("cranvel_activate"),
	CRANVEL_END("cranvel_end"),
	SPIRIT_SELECT("spirit_select");

	private static final JuliusAnim[] VALUES = values();

	public final String clipName;

	JuliusAnim(String clipName) {
		this.clipName = clipName;
	}

	public static JuliusAnim byId(int id) {
		return id >= 0 && id < VALUES.length ? VALUES[id] : SPIRIT_SELECT;
	}

	public boolean isSlash() {
		return this == SLASH_1 || this == SLASH_2 || this == SLASH_3;
	}
}
