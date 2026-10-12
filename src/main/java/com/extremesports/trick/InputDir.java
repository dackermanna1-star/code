package com.extremesports.trick;

/** Direction held while pressing a trick key; selects the trick variant. */
public enum InputDir {
	NEUTRAL,
	UP,
	DOWN,
	LEFT,
	RIGHT,
	UP_LEFT,
	UP_RIGHT,
	DOWN_LEFT,
	DOWN_RIGHT;

	public static InputDir of(boolean up, boolean down, boolean left, boolean right) {
		boolean u = up && !down;
		boolean d = down && !up;
		boolean l = left && !right;
		boolean r = right && !left;
		if (u && l) {
			return UP_LEFT;
		}
		if (u && r) {
			return UP_RIGHT;
		}
		if (d && l) {
			return DOWN_LEFT;
		}
		if (d && r) {
			return DOWN_RIGHT;
		}
		if (u) {
			return UP;
		}
		if (d) {
			return DOWN;
		}
		if (l) {
			return LEFT;
		}
		if (r) {
			return RIGHT;
		}
		return NEUTRAL;
	}

	/** Falls back from a diagonal to its vertical then horizontal component. */
	public InputDir[] fallbacks() {
		return switch (this) {
			case UP_LEFT -> new InputDir[]{UP_LEFT, UP, LEFT, NEUTRAL};
			case UP_RIGHT -> new InputDir[]{UP_RIGHT, UP, RIGHT, NEUTRAL};
			case DOWN_LEFT -> new InputDir[]{DOWN_LEFT, DOWN, LEFT, NEUTRAL};
			case DOWN_RIGHT -> new InputDir[]{DOWN_RIGHT, DOWN, RIGHT, NEUTRAL};
			case NEUTRAL -> new InputDir[]{NEUTRAL};
			default -> new InputDir[]{this, NEUTRAL};
		};
	}

	/** Short label for HUD and help screens. */
	public String label() {
		return switch (this) {
			case NEUTRAL -> "";
			case UP -> "↑";
			case DOWN -> "↓";
			case LEFT -> "←";
			case RIGHT -> "→";
			case UP_LEFT -> "↖";
			case UP_RIGHT -> "↗";
			case DOWN_LEFT -> "↙";
			case DOWN_RIGHT -> "↘";
		};
	}
}
