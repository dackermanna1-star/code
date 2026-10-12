package com.mineception.dream;

/**
 * Shape of a laptop inside one block cell, shared by the dream raycaster, the screen-dive camera animation and the
 * real-world laptop's block model and screen renderer, so the live picture always lines up with the lid.
 *
 * <p>All coordinates are in block-local units (0..1). The reference orientation has the screen facing SOUTH (+z): the
 * keyboard deck is in front (larger z) and the lid stands at the back. Other facings rotate around the cell centre.
 */
public final class LaptopGeometry {
	/** Keyboard deck box for the SOUTH-facing reference: minX, minY, minZ, maxX, maxY, maxZ. */
	public static final double[] BASE = {0.0625, 0.0, 0.25, 0.9375, 0.0625, 0.9375};
	/** Lid box (standing upright at the back) for the SOUTH-facing reference. */
	public static final double[] LID = {0.0625, 0.0625, 0.1875, 0.9375, 0.625, 0.25};

	/** Screen rectangle on the lid's front face (z = LID max z) for the SOUTH-facing reference. */
	public static final double SCREEN_MIN_X = 0.125;
	public static final double SCREEN_MAX_X = 0.875;
	public static final double SCREEN_MIN_Y = 0.125;
	public static final double SCREEN_MAX_Y = 0.59375;
	public static final double SCREEN_Z = 0.25;

	/** Screen aspect ratio (width / height); dream pictures for laptop screens are rendered at this aspect. */
	public static final double SCREEN_ASPECT = (SCREEN_MAX_X - SCREEN_MIN_X) / (SCREEN_MAX_Y - SCREEN_MIN_Y);

	private LaptopGeometry() {
	}

	/**
	 * Rotates a reference-space point (SOUTH facing) to the given facing. Returns {x, y, z} in block-local units.
	 */
	public static double[] rotate(double x, double y, double z, Face facing) {
		double cx = x - 0.5;
		double cz = z - 0.5;
		return switch (facing) {
			case SOUTH -> new double[]{x, y, z};
			case NORTH -> new double[]{0.5 - cx, y, 0.5 - cz};
			// Facing EAST (+x): the reference +z axis maps to +x
			case EAST -> new double[]{0.5 + cz, y, 0.5 - cx};
			// Facing WEST (-x): the reference +z axis maps to -x
			case WEST -> new double[]{0.5 - cz, y, 0.5 + cx};
			default -> throw new IllegalArgumentException("Laptops only face horizontally: " + facing);
		};
	}

	/** Axis-aligned box rotated to a facing, as {minX, minY, minZ, maxX, maxY, maxZ}. */
	public static double[] rotateBox(double[] box, Face facing) {
		double[] a = rotate(box[0], box[1], box[2], facing);
		double[] b = rotate(box[3], box[4], box[5], facing);
		return new double[]{
			Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]),
			Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])
		};
	}

	/** The deck and lid boxes for a facing. */
	public static double[][] boxes(Face facing) {
		return new double[][]{rotateBox(BASE, facing), rotateBox(LID, facing)};
	}

	/**
	 * The screen as a parametric rectangle for a facing: {originX, originY, originZ, rightX, rightY, rightZ, upX, upY, upZ}.
	 * The origin is the screen's top-left corner as seen by someone looking at it; "right" spans the full width and "up"
	 * the full height. Use {@link #screenPoint} to map image coordinates (u right, v down) onto the screen.
	 */
	public static double[] screenFrame(Face facing) {
		// For the SOUTH-facing reference the viewer stands south of the screen looking north, so +x is on their right.
		double[] topLeft = rotate(SCREEN_MIN_X, SCREEN_MAX_Y, SCREEN_Z, facing);
		double[] topRight = rotate(SCREEN_MAX_X, SCREEN_MAX_Y, SCREEN_Z, facing);
		double[] bottomLeft = rotate(SCREEN_MIN_X, SCREEN_MIN_Y, SCREEN_Z, facing);
		return new double[]{
			topLeft[0], topLeft[1], topLeft[2],
			topRight[0] - topLeft[0], topRight[1] - topLeft[1], topRight[2] - topLeft[2],
			topLeft[0] - bottomLeft[0], topLeft[1] - bottomLeft[1], topLeft[2] - bottomLeft[2]
		};
	}

	/** Block-local point of screen coordinates (u right, v down, both 0..1) for a facing. */
	public static double[] screenPoint(Face facing, double u, double v) {
		double[] f = screenFrame(facing);
		return new double[]{
			f[0] + f[3] * u - f[6] * v,
			f[1] + f[4] * u - f[7] * v,
			f[2] + f[5] * u - f[8] * v
		};
	}

	/** Width and height of the screen in blocks. */
	public static double screenWidth() {
		return SCREEN_MAX_X - SCREEN_MIN_X;
	}

	public static double screenHeight() {
		return SCREEN_MAX_Y - SCREEN_MIN_Y;
	}
}
