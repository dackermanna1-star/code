package com.jjkshowdown.cinematic;

/** Cinematic sequences. The client holds the camera choreography for each; the server only times and locks. */
public enum CinematicType {
	CHARACTER_INTRO(90),
	BOSS_INTRO(110),
	UNLIMITED_VOID(56),
	MALEVOLENT_SHRINE(56),
	HOLLOW_PURPLE(52),
	HOLLOW_PURPLE_200(84),
	WORLD_SLASH(46),
	DOMAIN_CLASH(44),
	FINISHER(40),
	PHASE_TWO(64),
	BOSS_DEFEAT(70);

	public final int baseDuration;

	CinematicType(int baseDuration) {
		this.baseDuration = baseDuration;
	}

	public static CinematicType byOrdinal(int i) {
		CinematicType[] v = values();
		return i >= 0 && i < v.length ? v[i] : CHARACTER_INTRO;
	}
}
