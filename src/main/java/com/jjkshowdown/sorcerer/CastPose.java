package com.jjkshowdown.sorcerer;

/** Arm/body poses shown while casting. Synced to clients and applied to humanoid models. */
public enum CastPose {
	NONE,
	PALM_OUT,          // Lapse: Blue - palm thrust forward
	POINT,             // Reversal: Red - finger point
	PURPLE_CHARGE,     // arms spread, orbs in each hand converging
	PURPLE_FIRE,       // both hands thrust forward
	HAND_SIGN_VOID,    // Gojo's crossed-finger domain sign
	HAND_SIGN_SHRINE,  // Sukuna's Enma-ten mudra
	SLASH,             // Dismantle - horizontal swipe
	CLEAVE,            // crossed downward slash
	BOW_DRAW,          // Fuga - drawing the flame arrow
	WORLD_SLASH,       // hand raised for the world-cutting slash
	BLOCK,             // guard
	RCT,               // hands over chest, healing
	AMPLIFY,           // fists clenched, aura flaring
	STAGGER;           // reeling

	public static CastPose byOrdinal(int i) {
		CastPose[] v = values();
		return i >= 0 && i < v.length ? v[i] : NONE;
	}
}
