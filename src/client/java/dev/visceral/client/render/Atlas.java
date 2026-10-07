package dev.visceral.client.render;

/** Both texture atlases are 4x4 grids; each cell keeps a transparent margin so linear filtering never bleeds. */
public final class Atlas {
	public static final int GRID = 4;
	private static final float CELL = 1.0F / GRID;
	private static final float INSET = 1.0F / 512.0F;

	// Blood decal atlas (textures/decal/blood.png)
	public static final int SPLAT_FIRST = 0;
	public static final int SPLAT_COUNT = 4;
	public static final int SPATTER_FIRST = 4;
	public static final int SPATTER_COUNT = 2;
	public static final int DROP = 6;
	public static final int DROP_CROWN = 7;
	public static final int POOL_FIRST = 8;
	public static final int POOL_COUNT = 2;
	public static final int FOOTPRINT = 10;
	public static final int TRAIL = 11;
	public static final int PARTICLE_DROP = 12;
	public static final int MIST = 13;
	public static final int CHIP = 14;
	public static final int SPARK = 15;

	// Wound atlas (textures/entity/wounds.png)
	public static final int W_CUT_A = 0;
	public static final int W_CUT_B = 1;
	public static final int W_GASH = 2;
	public static final int W_PUNCTURE = 3;
	public static final int W_BITE = 4;
	public static final int W_CLAW = 5;
	public static final int W_BRUISE_A = 6;
	public static final int W_BRUISE_B = 7;
	public static final int W_BURN_A = 8;
	public static final int W_BURN_B = 9;
	public static final int W_CRACK = 10;
	public static final int W_SCRATCH = 11;
	public static final int W_TRICKLE = 12;
	public static final int W_SMEAR = 13;
	public static final int W_PUNCTURE_B = 14;

	private Atlas() {
	}

	public static float u0(int cell) {
		return (cell % GRID) * CELL + INSET;
	}

	public static float v0(int cell) {
		return (cell / GRID) * CELL + INSET;
	}

	public static float u1(int cell) {
		return (cell % GRID + 1) * CELL - INSET;
	}

	public static float v1(int cell) {
		return (cell / GRID + 1) * CELL - INSET;
	}

	/** Maps local coordinates in [0, 1] inside the cell to atlas U. */
	public static float u(int cell, float local) {
		float u0 = u0(cell);
		return u0 + (u1(cell) - u0) * Math.max(0.0F, Math.min(1.0F, local));
	}

	public static float v(int cell, float local) {
		float v0 = v0(cell);
		return v0 + (v1(cell) - v0) * Math.max(0.0F, Math.min(1.0F, local));
	}
}
