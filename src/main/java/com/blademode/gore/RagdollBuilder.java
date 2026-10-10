package com.blademode.gore;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.joml.Matrix4d;
import org.joml.Quaterniond;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/**
 * Turns the model parts a creature was drawn with into a jointed ragdoll, in the exact pose it was
 * in (adapted from Visceral's ragdoll builder).
 *
 * <ul>
 *   <li>Every part of the creature's own model with geometry becomes a bone, except overlays and
 *       parts glued to their parent (hats, jackets), which ride along with the parent.</li>
 *   <li>Tiny decorations merge into their parent bone, and the bone count is capped.</li>
 *   <li>Bones nested in the model hierarchy are jointed to their parent bone at their pivot. Bones
 *       that sit side by side at the root (classic biped/quadruped layout) are connected into a tree
 *       grown from the torso, each attached where it touches the tree.</li>
 *   <li>Armor, wool, saddles and other layers ride on the bone with the same part name.</li>
 * </ul>
 */
public final class RagdollBuilder {
	private static final int MAX_BONES = 24;
	private static final double TINY_FRACTION = 0.02;
	private static final double MIN_MASS_RATIO = 0.3;

	private RagdollBuilder() {
	}

	/**
	 * @param anchor absolute world position all piece transforms are relative to
	 * @param parts  captured parts in drawing order (layer 0, the creature's own model, first; parents before children)
	 * @return null if there is nothing to simulate
	 */
	public static @Nullable Ragdoll build(Vector3d anchor, List<Piece> parts, long seed) {
		List<Piece> main = new ArrayList<>();
		for (Piece piece : parts) {
			if (piece.isMain()) {
				main.add(piece);
			}
		}
		if (main.isEmpty()) {
			return null;
		}
		int n = main.size();
		Map<String, Integer> byPath = new HashMap<>();
		for (int i = 0; i < n; i++) {
			byPath.putIfAbsent(main.get(i).path, i);
		}
		int[] parent = new int[n];
		for (int i = 0; i < n; i++) {
			parent[i] = ancestor(main.get(i).path, byPath, i);
		}

		// 1. Bones and owners.
		boolean[] bone = new boolean[n];
		int[] owner = new int[n];
		for (int i = 0; i < n; i++) {
			int p = parent[i];
			if (p >= 0 && (isOverlay(name(main.get(i).path)) || glued(main.get(p).world0, main.get(i).world0))) {
				owner[i] = owner[p];
				continue;
			}
			bone[i] = true;
			owner[i] = i;
		}

		// 2. Volume per bone.
		double[] volume = new double[n];
		double total = 0;
		for (int i = 0; i < n; i++) {
			double v = main.get(i).volume();
			volume[owner[i]] += v;
			total += v;
		}

		// 3. Tiny leaf bones merge into their parent bone.
		boolean changed = true;
		while (changed) {
			changed = false;
			for (int i = 0; i < n; i++) {
				int up = parent[i] >= 0 ? owner[parent[i]] : -1;
				if (!bone[i] || up < 0 || volume[i] >= total * TINY_FRACTION || hasBoneChildren(i, bone, owner, parent)) {
					continue;
				}
				merge(i, up, bone, owner, volume);
				changed = true;
			}
		}

		// 4. Bodies, so their boxes can decide where root-level bones attach.
		List<Integer> bones = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			if (bone[i]) {
				bones.add(i);
			}
		}
		Map<Integer, List<Piece>> piecesOf = assignPieces(parts, main, byPath, owner);
		Body[] bodies = new Body[n];
		for (int i : bones) {
			bodies[i] = createBody(main.get(i), piecesOf.get(i), anchor);
		}
		bones.removeIf(i -> bodies[i] == null);
		if (bones.isEmpty()) {
			return null;
		}

		// 5. Joint tree: the hierarchy where it exists, otherwise grown from the torso.
		int torso = bones.getFirst();
		boolean namedTorso = false;
		for (int i : bones) {
			int up = parent[i] >= 0 ? owner[parent[i]] : -1;
			if (up >= 0 && bodies[up] != null) {
				continue;
			}
			boolean named = isTorso(name(main.get(i).path));
			if (named && (!namedTorso || volume[i] > volume[torso]) || !namedTorso && !named && volume[i] > volume[torso]) {
				torso = i;
				namedTorso |= named;
			}
		}
		int[] jointParent = new int[n];
		java.util.Arrays.fill(jointParent, -1);
		List<Integer> pending = new ArrayList<>();
		for (int i : bones) {
			if (i == torso) {
				continue;
			}
			int up = parent[i] >= 0 ? owner[parent[i]] : -1;
			if (up >= 0 && bodies[up] != null) {
				jointParent[i] = up;
			} else {
				pending.add(i);
			}
		}
		List<Integer> connected = new ArrayList<>();
		connected.add(torso);
		addDescendants(bones, jointParent, connected);
		while (!pending.isEmpty()) {
			int bestChild = -1;
			int bestParent = -1;
			double bestDistance = Double.MAX_VALUE;
			for (int candidate : pending) {
				Vector3d pivot = pivot(main.get(candidate), anchor);
				for (int member : connected) {
					double distance = bodies[member].distanceTo(pivot);
					if (distance < bestDistance) {
						bestDistance = distance;
						bestChild = candidate;
						bestParent = member;
					}
				}
			}
			if (bestChild < 0) {
				break;
			}
			jointParent[bestChild] = bestParent;
			pending.remove(Integer.valueOf(bestChild));
			connected.add(bestChild);
			addDescendants(bones, jointParent, connected);
		}

		// 6. Too many bones: fold the smallest leaves into their joint parent.
		while (bones.size() > MAX_BONES) {
			int smallest = -1;
			for (int i : bones) {
				if (jointParent[i] >= 0 && !isJointParent(bones, jointParent, i) && (smallest < 0 || volume[i] < volume[smallest])) {
					smallest = i;
				}
			}
			if (smallest < 0) {
				break;
			}
			int target = jointParent[smallest];
			List<Piece> combined = new ArrayList<>(bodies[target].pieces);
			combined.addAll(bodies[smallest].pieces);
			bodies[target] = createBody(main.get(target), combined, anchor);
			volume[target] += volume[smallest];
			bones.remove(Integer.valueOf(smallest));
		}

		// 7. Bodies and joints.
		List<Body> bodyList = new ArrayList<>();
		double heaviest = 0;
		for (int i : bones) {
			bodyList.add(bodies[i]);
			heaviest = Math.max(heaviest, bodies[i].mass);
		}
		// Position based solvers dislike extreme mass ratios (a heavy torso on thin legs jitters forever).
		for (Body body : bodyList) {
			if (body.mass < heaviest * MIN_MASS_RATIO) {
				body.setMass(heaviest * MIN_MASS_RATIO);
			}
		}
		List<Joint> joints = new ArrayList<>();
		for (int i : bones) {
			int p = jointParent[i];
			if (p < 0 || !bones.contains(p)) {
				continue;
			}
			Body child = bodies[i];
			Body parentBody = bodies[p];
			Vector3d pivot = pivot(main.get(i), anchor);
			Vector3d at;
			if (parentBody.distanceTo(pivot) < 0.07 + child.boundingRadius * 0.15) {
				at = pivot;
			} else {
				Vector3d onParent = parentBody.closestPoint(child.pos);
				Vector3d onChild = child.closestPoint(onParent);
				at = onParent.add(onChild).mul(0.5);
			}
			String name = name(main.get(i).path);
			joints.add(new Joint(parentBody, child, at, limitFor(name, child), dampingFor(name)));
		}
		return new Ragdoll(anchor, bodyList, joints, seed);
	}

	/** Every captured part goes to a bone: the bone owning the same path in the creature's model, or the nearest one. */
	private static Map<Integer, List<Piece>> assignPieces(List<Piece> parts, List<Piece> main, Map<String, Integer> byPath, int[] owner) {
		Map<Integer, List<Piece>> result = new HashMap<>();
		List<Piece> loose = new ArrayList<>();
		for (Piece piece : parts) {
			Integer index = byPath.get(piece.path);
			if (piece.isMain()) {
				index = main.indexOf(piece);
			}
			if (index == null || index < 0) {
				loose.add(piece);
				continue;
			}
			result.computeIfAbsent(owner[index], k -> new ArrayList<>()).add(piece);
		}
		for (Piece piece : loose) {
			Vector3d centre = centroid(piece);
			int best = -1;
			double bestDistance = Double.MAX_VALUE;
			for (int i = 0; i < main.size(); i++) {
				if (owner[i] != i) {
					continue;
				}
				double distance = centroid(main.get(i)).distanceSquared(centre);
				if (distance < bestDistance) {
					bestDistance = distance;
					best = i;
				}
			}
			if (best >= 0) {
				result.computeIfAbsent(best, k -> new ArrayList<>()).add(piece);
			}
		}
		return result;
	}

	private static @Nullable Body createBody(Piece bonePart, @Nullable List<Piece> pieces, Vector3d anchor) {
		if (pieces == null || pieces.isEmpty()) {
			return null;
		}
		String name = name(bonePart.path);
		Quaterniond rotation = new Quaterniond().setFromUnnormalized(bonePart.world0);
		return Body.create(name, densityFor(name.toLowerCase(Locale.ROOT)), anchor, rotation, pieces);
	}

	private static Vector3d centroid(Piece piece) {
		List<Vector3d> points = new ArrayList<>();
		piece.points(points);
		Vector3d sum = new Vector3d();
		for (Vector3d p : points) {
			sum.add(p);
		}
		return points.isEmpty() ? piece.world0.getTranslation(sum) : sum.div(points.size());
	}

	private static Vector3d pivot(Piece part, Vector3d anchor) {
		return part.world0.getTranslation(new Vector3d()).add(anchor);
	}

	/** Index of the closest captured ancestor (by path), or -1. */
	private static int ancestor(String path, Map<String, Integer> byPath, int self) {
		String current = path;
		while (!current.isEmpty()) {
			int slash = current.lastIndexOf('/');
			current = slash <= 0 ? "" : current.substring(0, slash);
			Integer index = byPath.get(current);
			if (index != null && index != self) {
				return index;
			}
			if (slash <= 0) {
				break;
			}
		}
		Integer root = byPath.get("");
		return root != null && root != self && !path.isEmpty() ? root : -1;
	}

	static String name(String path) {
		int slash = path.lastIndexOf('/');
		String name = slash >= 0 ? path.substring(slash + 1) : path;
		return name.isEmpty() ? "root" : name;
	}

	/** A part glued to its parent: same pivot, same orientation, same scale. */
	private static boolean glued(Matrix4d parent, Matrix4d child) {
		Matrix4d relative = new Matrix4d(parent).invert().mul(child);
		Vector3d t = relative.getTranslation(new Vector3d());
		if (t.length() > 1.0E-3) {
			return false;
		}
		return Math.abs(relative.m00() - 1) < 1.0E-3 && Math.abs(relative.m11() - 1) < 1.0E-3 && Math.abs(relative.m22() - 1) < 1.0E-3
			&& Math.abs(relative.m01()) < 1.0E-3 && Math.abs(relative.m02()) < 1.0E-3 && Math.abs(relative.m10()) < 1.0E-3
			&& Math.abs(relative.m12()) < 1.0E-3 && Math.abs(relative.m20()) < 1.0E-3 && Math.abs(relative.m21()) < 1.0E-3;
	}

	private static boolean hasBoneChildren(int index, boolean[] bone, int[] owner, int[] parent) {
		for (int i = 0; i < bone.length; i++) {
			if (bone[i] && i != index && parent[i] >= 0 && owner[parent[i]] == index) {
				return true;
			}
		}
		return false;
	}

	private static void merge(int from, int to, boolean[] bone, int[] owner, double[] volume) {
		bone[from] = false;
		for (int i = 0; i < owner.length; i++) {
			if (owner[i] == from) {
				owner[i] = to;
			}
		}
		volume[to] += volume[from];
		volume[from] = 0.0;
	}

	private static void addDescendants(List<Integer> bones, int[] jointParent, List<Integer> connected) {
		boolean added = true;
		while (added) {
			added = false;
			for (int i : bones) {
				if (!connected.contains(i) && jointParent[i] >= 0 && connected.contains(jointParent[i])) {
					connected.add(i);
					added = true;
				}
			}
		}
	}

	private static boolean isJointParent(List<Integer> bones, int[] jointParent, int index) {
		for (int i : bones) {
			if (jointParent[i] == index) {
				return true;
			}
		}
		return false;
	}

	/** Outer clothing layers of player-like models ride on the part underneath. */
	static boolean isOverlay(String name) {
		return switch (name) {
			case "hat", "jacket", "left_sleeve", "right_sleeve", "left_pants", "right_pants", "cloak", "outer", "overlay" -> true;
			default -> false;
		};
	}

	static boolean isTorso(String name) {
		String lower = name.toLowerCase(Locale.ROOT);
		return lower.equals("body") || lower.contains("torso") || lower.contains("chest") || lower.equals("upper_body") || lower.equals("body0");
	}

	private static double limitFor(String rawName, Body body) {
		String name = rawName.toLowerCase(Locale.ROOT);
		double degrees;
		if (name.contains("head") || name.contains("skull")) {
			degrees = 55.0;
		} else if (name.contains("neck") || name.contains("ear") || name.contains("jaw") || name.contains("mouth")) {
			degrees = 40.0;
		} else if (name.contains("tail") || name.contains("tentacle")) {
			degrees = 80.0;
		} else if (name.contains("leg") || name.contains("arm") || name.contains("wing") || name.contains("fin") || name.contains("claw")) {
			degrees = 95.0;
		} else {
			Vector3d h = body.halfExtents;
			double max = Math.max(h.x, Math.max(h.y, h.z));
			double mid = h.x + h.y + h.z - max - Math.min(h.x, Math.min(h.y, h.z));
			degrees = max > mid * 1.8 ? 85.0 : 60.0;
		}
		return Math.toRadians(degrees);
	}

	/** Heads are light and torsos heavy for their size. */
	private static double densityFor(String name) {
		if (name.contains("head") || name.contains("skull") || name.contains("ear") || name.contains("tail") || name.contains("wing")) {
			return 0.55;
		}
		if (isTorso(name)) {
			return 1.6;
		}
		return 1.0;
	}

	private static double dampingFor(String rawName) {
		String name = rawName.toLowerCase(Locale.ROOT);
		return name.contains("tail") || name.contains("tentacle") ? 2.0 : 5.0;
	}
}
