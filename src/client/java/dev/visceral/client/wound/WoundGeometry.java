package dev.visceral.client.wound;

import dev.visceral.client.render.PolygonClipper;
import java.util.ArrayList;
import java.util.List;
import org.joml.Vector3f;

/**
 * Builds decal polygons on the surface of a model cube, in part space pixels.
 *
 * <p>The decal is a rectangle centred on the hit point. It is clipped to the rectangle of the face
 * that was hit and, where it hangs over an edge, continued onto the neighbouring faces by unfolding
 * them into the hit plane - so a slash across the edge of an arm wraps around it like a real cut.
 *
 * <p>Each polygon is a float array of {@code n * STRIDE} values: x, y, z, u, v, nx, ny, nz where u/v
 * are cell-local texture coordinates in [0, 1].
 */
public final class WoundGeometry {
	public static final int STRIDE = 8;
	private static final float EPSILON = 1.0E-4F;

	private WoundGeometry() {
	}

	/**
	 * @param bounds   cube bounds {minX, minY, minZ, maxX, maxY, maxZ}
	 * @param axis     axis of the hit face normal (0 = x, 1 = y, 2 = z)
	 * @param sign     +1 or -1, direction of the hit face normal
	 * @param center   decal centre, on the hit face
	 * @param uAxis    unit vector in the face plane, decal "right"
	 * @param vAxis    unit vector in the face plane, decal "down"
	 * @param halfU    half width in pixels
	 * @param halfV    half height in pixels
	 * @param lift     offset along each face normal to avoid z-fighting, pixels
	 */
	public static List<float[]> build(float[] bounds, int axis, int sign, Vector3f center, Vector3f uAxis, Vector3f vAxis, float halfU, float halfV, float lift) {
		List<float[]> polygons = new ArrayList<>(5);
		Vector3f hitNormal = axisVector(axis, sign);
		float hitPlane = center.dot(hitNormal);

		for (int faceAxis = 0; faceAxis < 3; faceAxis++) {
			for (int faceSign = -1; faceSign <= 1; faceSign += 2) {
				if (faceAxis == axis && faceSign != sign) {
					continue;
				}
				boolean hitFace = faceAxis == axis;
				Vector3f faceNormal = axisVector(faceAxis, faceSign);
				float faceCoord = faceSign > 0 ? bounds[3 + faceAxis] : bounds[faceAxis];
				float facePlane = faceCoord * faceSign;
				int a1 = (faceAxis + 1) % 3;
				int a2 = (faceAxis + 2) % 3;
				float min1 = bounds[a1];
				float max1 = bounds[3 + a1];
				float min2 = bounds[a2];
				float max2 = bounds[3 + a2];
				if (max1 - min1 < EPSILON || max2 - min2 < EPSILON) {
					continue;
				}

				// Face rectangle corners in order around the face.
				Vector3f[] corners = new Vector3f[4];
				corners[0] = corner(faceAxis, faceCoord, a1, min1, a2, min2);
				corners[1] = corner(faceAxis, faceCoord, a1, max1, a2, min2);
				corners[2] = corner(faceAxis, faceCoord, a1, max1, a2, max2);
				corners[3] = corner(faceAxis, faceCoord, a1, min1, a2, max2);

				float[] clipX = new float[4];
				float[] clipY = new float[4];
				for (int i = 0; i < 4; i++) {
					Vector3f unfolded = hitFace ? new Vector3f(corners[i]) : unfold(corners[i], hitNormal, hitPlane, faceNormal);
					unfolded.sub(center);
					clipX[i] = unfolded.dot(uAxis) / halfU;
					clipY[i] = unfolded.dot(vAxis) / halfV;
				}

				float[] polygon = PolygonClipper.clipSquare(clipX, clipY);
				if (polygon == null) {
					continue;
				}
				int count = polygon.length / 2;
				float[] out = new float[count * STRIDE];
				for (int i = 0; i < count; i++) {
					float x = polygon[i * 2];
					float y = polygon[i * 2 + 1];
					Vector3f point = new Vector3f(center)
						.add(uAxis.x * halfU * x, uAxis.y * halfU * x, uAxis.z * halfU * x)
						.add(vAxis.x * halfV * y, vAxis.y * halfV * y, vAxis.z * halfV * y);
					if (!hitFace) {
						fold(point, hitNormal, faceNormal, facePlane);
					}
					point.add(faceNormal.x * lift, faceNormal.y * lift, faceNormal.z * lift);
					int o = i * STRIDE;
					out[o] = point.x;
					out[o + 1] = point.y;
					out[o + 2] = point.z;
					out[o + 3] = (x + 1.0F) * 0.5F;
					out[o + 4] = (y + 1.0F) * 0.5F;
					out[o + 5] = faceNormal.x;
					out[o + 6] = faceNormal.y;
					out[o + 7] = faceNormal.z;
				}
				polygons.add(out);
			}
		}
		return polygons;
	}

	private static Vector3f corner(int axis, float coord, int a1, float c1, int a2, float c2) {
		float[] values = new float[3];
		values[axis] = coord;
		values[a1] = c1;
		values[a2] = c2;
		return new Vector3f(values[0], values[1], values[2]);
	}

	static Vector3f axisVector(int axis, int sign) {
		return new Vector3f(axis == 0 ? sign : 0, axis == 1 ? sign : 0, axis == 2 ? sign : 0);
	}

	/** Rotates a point of an adjacent face around the shared edge into the hit face plane. */
	private static Vector3f unfold(Vector3f point, Vector3f hitNormal, float hitPlane, Vector3f faceNormal) {
		float depth = hitPlane - point.dot(hitNormal);
		return new Vector3f(point).add(
			(hitNormal.x + faceNormal.x) * depth, (hitNormal.y + faceNormal.y) * depth, (hitNormal.z + faceNormal.z) * depth
		);
	}

	/** Inverse of {@link #unfold}: moves a point beyond the edge in the hit plane back onto the adjacent face. */
	private static void fold(Vector3f point, Vector3f hitNormal, Vector3f faceNormal, float facePlane) {
		float beyond = point.dot(faceNormal) - facePlane;
		point.sub((hitNormal.x + faceNormal.x) * beyond, (hitNormal.y + faceNormal.y) * beyond, (hitNormal.z + faceNormal.z) * beyond);
	}
}
