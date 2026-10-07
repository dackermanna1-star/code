package dev.visceral.client.render;

/** Sutherland-Hodgman clipping of the unit decal square against convex quads. */
public final class PolygonClipper {
	private PolygonClipper() {
	}

	/**
	 * Clips the square [-1, 1]^2 against the convex quad given by its corners.
	 *
	 * @return interleaved x/y of the resulting convex polygon, or null if (almost) empty
	 */
	public static float[] clipSquare(float[] quadX, float[] quadY) {
		float area = 0.0F;
		for (int i = 0; i < 4; i++) {
			int j = (i + 1) % 4;
			area += quadX[i] * quadY[j] - quadX[j] * quadY[i];
		}
		if (Math.abs(area) < 1.0E-6F) {
			return null;
		}
		boolean ccw = area > 0.0F;
		// Early out when the quad is far outside the square.
		float minX = Float.MAX_VALUE;
		float maxX = -Float.MAX_VALUE;
		float minY = Float.MAX_VALUE;
		float maxY = -Float.MAX_VALUE;
		for (int i = 0; i < 4; i++) {
			minX = Math.min(minX, quadX[i]);
			maxX = Math.max(maxX, quadX[i]);
			minY = Math.min(minY, quadY[i]);
			maxY = Math.max(maxY, quadY[i]);
		}
		if (minX >= 1.0F || maxX <= -1.0F || minY >= 1.0F || maxY <= -1.0F) {
			return null;
		}

		float[] poly = {-1, -1, 1, -1, 1, 1, -1, 1};
		for (int edge = 0; edge < 4 && poly != null; edge++) {
			int next = (edge + 1) % 4;
			float ex = quadX[next] - quadX[edge];
			float ey = quadY[next] - quadY[edge];
			// Inside test: cross(edge, p - start) >= 0 for counter-clockwise polygons.
			float nx = ccw ? -ey : ey;
			float ny = ccw ? ex : -ex;
			float d = nx * quadX[edge] + ny * quadY[edge];
			poly = clipHalfPlane(poly, nx, ny, d);
		}
		if (poly == null || poly.length < 6) {
			return null;
		}
		// Discard slivers.
		float clippedArea = 0.0F;
		int n = poly.length / 2;
		for (int i = 0; i < n; i++) {
			int j = (i + 1) % n;
			clippedArea += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1];
		}
		return Math.abs(clippedArea) < 1.0E-3F ? null : poly;
	}

	/** Keeps the part of the polygon where nx * x + ny * y >= d. */
	private static float[] clipHalfPlane(float[] poly, float nx, float ny, float d) {
		int n = poly.length / 2;
		float[] out = new float[(n + 1) * 2 * 2];
		int count = 0;
		for (int i = 0; i < n; i++) {
			int j = (i + 1) % n;
			float ax = poly[i * 2];
			float ay = poly[i * 2 + 1];
			float bx = poly[j * 2];
			float by = poly[j * 2 + 1];
			float da = nx * ax + ny * ay - d;
			float db = nx * bx + ny * by - d;
			if (da >= 0.0F) {
				out[count++] = ax;
				out[count++] = ay;
			}
			if (da >= 0.0F != db >= 0.0F) {
				float t = da / (da - db);
				out[count++] = ax + (bx - ax) * t;
				out[count++] = ay + (by - ay) * t;
			}
		}
		if (count < 6) {
			return null;
		}
		float[] result = new float[count];
		System.arraycopy(out, 0, result, 0, count);
		return result;
	}
}
