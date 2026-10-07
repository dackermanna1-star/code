package dev.visceral.client.wound;

import dev.visceral.blood.BloodType;
import dev.visceral.client.model.ModelTree;
import dev.visceral.client.render.Atlas;
import dev.visceral.wound.Wound;
import java.util.List;
import net.minecraft.client.model.geom.ModelPart;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Casts a wound's ray against the cubes of a posed model and builds the decal where it lands. When
 * the ray misses (hit boxes are rarely the exact shape of the model) the cube closest to the ray is used.
 */
public final class WoundResolver {
	/** Decals float this many pixels above the surface (combined with the render type's view offset). */
	private static final float LIFT = 0.04F;

	private WoundResolver() {
	}

	/**
	 * @param modelMatrices model space transform per tree node (current pose)
	 * @param originModel   ray origin in model space (blocks)
	 * @param dirModel      ray direction in model space
	 */
	public static WoundPlacement resolve(ModelTree tree, Matrix4f[] modelMatrices, Vector3f originModel, Vector3f dirModel, Wound wound, BloodType blood) {
		int cell = WoundStyle.cell(wound, blood);
		if (cell < 0) {
			return null;
		}

		int bestNode = -1;
		int bestCube = -1;
		float bestT = Float.MAX_VALUE;
		int bestAxis = 0;
		int bestSign = 1;
		Vector3f bestPoint = null;
		boolean exact = false;
		float bestDistance = Float.MAX_VALUE;

		Matrix4f inverse = new Matrix4f();
		Vector3f o = new Vector3f();
		Vector3f d = new Vector3f();
		for (ModelTree.Node node : tree.nodes) {
			if (!node.hasCubes() || node.part().skipDraw || ModelTree.isOverlayLayer(node.name()) || !tree.isVisible(node)) {
				continue;
			}
			modelMatrices[node.index()].invert(inverse);
			inverse.transformPosition(originModel, o).mul(16.0F);
			inverse.transformDirection(dirModel, d).mul(16.0F);
			List<ModelPart.Cube> cubes = node.cubes();
			for (int c = 0; c < cubes.size(); c++) {
				float[] b = ModelTree.cubeBounds(cubes.get(c));
				// Slab test, keeping the axis we entered through.
				float tNear = -Float.MAX_VALUE;
				float tFar = Float.MAX_VALUE;
				int enterAxis = -1;
				int enterSign = 1;
				boolean miss = false;
				for (int axis = 0; axis < 3 && !miss; axis++) {
					float origin = component(o, axis);
					float dir = component(d, axis);
					float min = b[axis];
					float max = b[axis + 3];
					if (Math.abs(dir) < 1.0E-7F) {
						if (origin < min || origin > max) {
							miss = true;
						}
						continue;
					}
					float t1 = (min - origin) / dir;
					float t2 = (max - origin) / dir;
					int sign = -1;
					if (t1 > t2) {
						float swap = t1;
						t1 = t2;
						t2 = swap;
						sign = 1;
					}
					if (t1 > tNear) {
						tNear = t1;
						enterAxis = axis;
						enterSign = sign;
					}
					tFar = Math.min(tFar, t2);
					if (tNear > tFar) {
						miss = true;
					}
				}
				if (!miss && enterAxis >= 0 && tNear >= 0.0F && tNear < bestT) {
					bestT = tNear;
					bestNode = node.index();
					bestCube = c;
					bestAxis = enterAxis;
					bestSign = enterSign;
					bestPoint = new Vector3f(d).mul(tNear).add(o);
					exact = true;
				}
				if (!exact) {
					// Track the closest approach in model space for the fallback.
					Vector3f closest = closestPointOnBox(b, o, d);
					Vector3f onRay = closestPointOnRay(o, d, closest);
					Vector3f modelA = modelMatrices[node.index()].transformPosition(new Vector3f(closest).div(16.0F), new Vector3f());
					Vector3f modelB = modelMatrices[node.index()].transformPosition(new Vector3f(onRay).div(16.0F), new Vector3f());
					float distance = modelA.distanceSquared(modelB);
					if (distance < bestDistance) {
						bestDistance = distance;
						bestNode = node.index();
						bestCube = c;
						bestPoint = closest;
						int[] face = nearestFace(b, closest, d);
						bestAxis = face[0];
						bestSign = face[1];
					}
				}
			}
		}

		if (bestNode < 0 || bestPoint == null) {
			return null;
		}

		ModelTree.Node node = tree.nodes.get(bestNode);
		float[] bounds = ModelTree.cubeBounds(node.cubes().get(bestCube));
		// Snap exactly onto the face plane.
		setComponent(bestPoint, bestAxis, bestSign > 0 ? bounds[bestAxis + 3] : bounds[bestAxis]);
		Vector3f normal = WoundGeometry.axisVector(bestAxis, bestSign);

		// "Down" on the face: model space +Y is down, brought into part space and projected on the face.
		Matrix4f inv = modelMatrices[bestNode].invert(new Matrix4f());
		Vector3f down = inv.transformDirection(new Vector3f(0.0F, 1.0F, 0.0F), new Vector3f());
		down.fma(-down.dot(normal), normal);
		if (down.lengthSquared() < 1.0E-4F) {
			down.set(bestAxis == 2 ? 1 : 0, 0, bestAxis == 2 ? 0 : 1);
			down.fma(-down.dot(normal), normal);
		}
		down.normalize();
		Vector3f right = new Vector3f(down).cross(normal).normalize();

		float roll = wound.roll();
		float cos = (float) Math.cos(roll);
		float sin = (float) Math.sin(roll);
		Vector3f u = new Vector3f(right).mul(cos).fma(sin, down);
		Vector3f v = new Vector3f(right).mul(-sin).fma(cos, down);

		float half = WoundStyle.halfSize(wound);
		// Never let a single wound swallow a whole small face.
		float faceSize = Math.max(bounds[(bestAxis + 1) % 3 + 3] - bounds[(bestAxis + 1) % 3], bounds[(bestAxis + 2) % 3 + 3] - bounds[(bestAxis + 2) % 3]);
		half = Math.min(half, Math.max(0.8F, faceSize * 0.65F));

		List<float[]> polygons = WoundGeometry.build(bounds, bestAxis, bestSign, bestPoint, u, v, half, half, LIFT);
		List<float[]> trickle = List.of();
		if (WoundStyle.isFleshWound(wound.type()) && blood.bleeds()) {
			float trickleHalfU = half * 0.5F;
			float trickleHalfV = half * 1.35F;
			Vector3f trickleCenter = new Vector3f(bestPoint).fma(trickleHalfV * 0.82F, down);
			trickle = WoundGeometry.build(bounds, bestAxis, bestSign, trickleCenter, right, down, trickleHalfU, trickleHalfV, LIFT * 0.5F);
		}
		if (polygons.isEmpty()) {
			return null;
		}
		return new WoundPlacement(tree, bestNode, cell, polygons, trickle, new Vector3f(bestPoint), normal);
	}

	static int trickleCell() {
		return Atlas.W_TRICKLE;
	}

	private static float component(Vector3f v, int axis) {
		return axis == 0 ? v.x : axis == 1 ? v.y : v.z;
	}

	private static void setComponent(Vector3f v, int axis, float value) {
		if (axis == 0) {
			v.x = value;
		} else if (axis == 1) {
			v.y = value;
		} else {
			v.z = value;
		}
	}

	private static Vector3f closestPointOnBox(float[] b, Vector3f o, Vector3f d) {
		Vector3f center = new Vector3f((b[0] + b[3]) * 0.5F, (b[1] + b[4]) * 0.5F, (b[2] + b[5]) * 0.5F);
		Vector3f point = closestPointOnRay(o, d, center);
		for (int i = 0; i < 2; i++) {
			Vector3f clamped = new Vector3f(
				Math.max(b[0], Math.min(b[3], point.x)),
				Math.max(b[1], Math.min(b[4], point.y)),
				Math.max(b[2], Math.min(b[5], point.z))
			);
			point = closestPointOnRay(o, d, clamped);
			if (i == 1) {
				return clamped;
			}
		}
		return center;
	}

	private static Vector3f closestPointOnRay(Vector3f o, Vector3f d, Vector3f p) {
		float lengthSq = d.lengthSquared();
		if (lengthSq < 1.0E-12F) {
			return new Vector3f(o);
		}
		float t = Math.max(0.0F, new Vector3f(p).sub(o).dot(d) / lengthSq);
		return new Vector3f(d).mul(t).add(o);
	}

	/** Face of the box closest to {@code point}, preferring faces that look back along the ray. */
	private static int[] nearestFace(float[] b, Vector3f point, Vector3f dir) {
		int bestAxis = 0;
		int bestSign = 1;
		float bestScore = Float.MAX_VALUE;
		for (int axis = 0; axis < 3; axis++) {
			float value = component(point, axis);
			float dirComponent = component(dir, axis);
			float toMin = Math.abs(value - b[axis]);
			float toMax = Math.abs(b[axis + 3] - value);
			float scoreMin = toMin + (dirComponent > 0 ? 0.0F : 4.0F);
			float scoreMax = toMax + (dirComponent < 0 ? 0.0F : 4.0F);
			if (scoreMin < bestScore) {
				bestScore = scoreMin;
				bestAxis = axis;
				bestSign = -1;
			}
			if (scoreMax < bestScore) {
				bestScore = scoreMax;
				bestAxis = axis;
				bestSign = 1;
			}
		}
		return new int[] {bestAxis, bestSign};
	}
}
