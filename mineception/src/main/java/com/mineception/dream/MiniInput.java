package com.mineception.dream;

/** Movement keys held by the player controlling a dream avatar this tick. Look direction is set on the avatar directly. */
public record MiniInput(boolean forward, boolean back, boolean left, boolean right, boolean jump, boolean sprint, boolean sneak) {
	public static final MiniInput NONE = new MiniInput(false, false, false, false, false, false, false);
}
