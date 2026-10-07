package dev.visceral.client.ragdoll;

import dev.visceral.client.model.ModelTree;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4d;
import org.joml.Matrix4f;
import org.joml.Quaterniond;
import org.joml.Vector3d;

/**
 * Turns any hierarchical entity model into a ragdoll, using the exact pose the creature died in.
 *
 * <ul>
 *   <li>Every visible part with geometry becomes a bone, except overlays and parts glued to their
 *       parent with an identity transform (hats, jackets, beaks), which ride along with the parent.</li>
 *   <li>Tiny decorations are merged into their parent bone, and the bone count is capped.</li>
 *   <li>Bones nested in the model hierarchy are jointed to their parent bone at their pivot. Bones
 *       that are siblings at the root (classic biped/quadruped layout) are connected into a tree
 *       grown from the heaviest bone, each attached where it touches the tree.</li>
 * </ul>
 */
final class RagdollBuilder {
	private static final int MAX_BONES = 24;
	private static final float TINY_FRACTION = 0.02F;
	private static final double MIN_MASS_RATIO = 0.3;

	private RagdollBuilder() {
	}

	/**
	 * @param modelPose model space to camera-relative transform, exactly as vanilla is about to draw it
	 * @return false when the model has nothing to simulate
	 */
	static boolean build(Ragdoll ragdoll, Model<?> model, Matrix4f modelPose, Vec3 camera) {
		ModelTree tree = ModelTree.of(model.root());
		Matrix4f[] modelMatrices = tree.poseMatrices();
		int n = tree.size();
		Vec3 origin = new Vec3(ragdoll.anchorX, ragdoll.anchorY, ragdoll.anchorZ);

		// World transforms relative to the anchor, in double precision.
		Matrix4d toAnchor = new Matrix4d()
			.translation(camera.x - origin.x, camera.y - origin.y, camera.z - origin.z)
			.mul(new Matrix4d(modelPose));
		Matrix4d[] world = new Matrix4d[n];
		for (int i = 0; i < n; i++) {
			world[i] = new Matrix4d(toAnchor).mul(new Matrix4d(modelMatrices[i]));
		}

		boolean[] geometry = new boolean[n];
		boolean[] subtreeGeometry = new boolean[n];
		for (ModelTree.Node node : tree.nodes) {
			geometry[node.index()] = node.hasCubes() && !node.part().skipDraw && tree.isVisible(node);
		}
		for (int i = n - 1; i >= 0; i--) {
			subtreeGeometry[i] |= geometry[i];
			int parent = tree.nodes.get(i).parent();
			if (parent >= 0 && subtreeGeometry[i]) {
				subtreeGeometry[parent] = true;
			}
		}

		// 1. Bones and owners.
		int[] owner = new int[n];
		int[] hierarchyParentBone = new int[n];
		boolean[] bone = new boolean[n];
		for (ModelTree.Node node : tree.nodes) {
			int i = node.index();
			int parent = node.parent();
			int parentOwner = parent >= 0 ? owner[parent] : -1;
			hierarchyParentBone[i] = -1;
			if (!subtreeGeometry[i]) {
				owner[i] = parentOwner;
				continue;
			}
			if (parentOwner >= 0 && (isIdentity(node.part()) || ModelTree.isOverlayLayer(node.name()))) {
				owner[i] = parentOwner;
				continue;
			}
			if (!geometry[i]) {
				owner[i] = parentOwner;
				continue;
			}
			bone[i] = true;
			owner[i] = i;
			hierarchyParentBone[i] = parentOwner;
		}

		// 2. Geometry per bone, in anchor-relative world space.
		List<List<Vector3d>> points = new ArrayList<>(n);
		double[] volume = new double[n];
		for (int i = 0; i < n; i++) {
			points.add(null);
		}
		double totalVolume = 0.0;
		for (ModelTree.Node node : tree.nodes) {
			int i = node.index();
			if (!geometry[i] || owner[i] < 0) {
				continue;
			}
			for (ModelPart.Cube cube : node.cubes()) {
				float[] b = ModelTree.cubeBounds(cube);
				List<Vector3d> list = points.get(owner[i]);
				if (list == null) {
					list = new ArrayList<>();
					points.set(owner[i], list);
				}
				Vector3d[] corners = new Vector3d[8];
				for (int c = 0; c < 8; c++) {
					corners[c] = world[i].transformPosition(new Vector3d(
						((c & 1) == 0 ? b[0] : b[3]) / 16.0, ((c & 2) == 0 ? b[1] : b[4]) / 16.0, ((c & 4) == 0 ? b[2] : b[5]) / 16.0
					));
					list.add(corners[c]);
				}
				double v = corners[0].distance(corners[1]) * corners[0].distance(corners[2]) * corners[0].distance(corners[4]);
				volume[owner[i]] += v;
				totalVolume += v;
			}
		}

		// 3. Merge tiny leaf bones into their parent bone.
		boolean changed = true;
		while (changed) {
			changed = false;
			for (int i = 0; i < n; i++) {
				if (!bone[i] || hierarchyParentBone[i] < 0 || volume[i] >= totalVolume * TINY_FRACTION || hasBoneChildren(tree, bone, owner, i)) {
					continue;
				}
				mergeInto(tree, bone, owner, points, volume, i, hierarchyParentBone[i]);
				changed = true;
			}
		}

		List<Integer> boneNodes = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			if (bone[i] && points.get(i) != null) {
				boneNodes.add(i);
			} else if (bone[i]) {
				bone[i] = false;
			}
		}
		if (boneNodes.isEmpty()) {
			return false;
		}

		// 4. Joint tree: hierarchy where it exists, otherwise grown from the heaviest bone.
		// The torso anchors the joint tree: a part named like one, otherwise the heaviest root-level part.
		int torso = boneNodes.getFirst();
		boolean namedTorso = false;
		for (int i : boneNodes) {
			if (hierarchyParentBone[i] >= 0) {
				continue;
			}
			boolean named = isTorsoName(tree.nodes.get(i).name());
			if (named && (!namedTorso || volume[i] > volume[torso]) || !namedTorso && !named && volume[i] > volume[torso]) {
				torso = i;
				namedTorso |= named;
			}
		}
		int[] jointParent = new int[n];
		java.util.Arrays.fill(jointParent, -1);
		List<Integer> connected = new ArrayList<>();
		List<Integer> pending = new ArrayList<>();
		for (int i : boneNodes) {
			if (i == torso) {
				continue;
			}
			if (hierarchyParentBone[i] >= 0 && bone[hierarchyParentBone[i]]) {
				jointParent[i] = hierarchyParentBone[i];
			} else {
				pending.add(i);
			}
		}

		// Bodies, built now so their boxes can be used to decide attachments.
		RigidBody[] bodies = new RigidBody[n];
		for (int i : boneNodes) {
			bodies[i] = createBody(tree.nodes.get(i).name(), world[i], points.get(i), origin);
		}

		connected.add(torso);
		addHierarchyDescendants(boneNodes, jointParent, connected, torso);
		while (!pending.isEmpty()) {
			int bestChild = -1;
			int bestParent = -1;
			double bestDistance = Double.MAX_VALUE;
			for (int candidate : pending) {
				Vector3d pivot = pivotOf(world[candidate], origin);
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
			addHierarchyDescendants(boneNodes, jointParent, connected, bestChild);
		}

		// 5. Too many bones (blazes, ghasts with modded extras...): fold the smallest leaves into their joint parent.
		while (boneNodes.size() > MAX_BONES) {
			int smallest = -1;
			for (int i : boneNodes) {
				if (jointParent[i] >= 0 && !isJointParent(boneNodes, jointParent, i) && (smallest < 0 || volume[i] < volume[smallest])) {
					smallest = i;
				}
			}
			if (smallest < 0) {
				break;
			}
			int target = jointParent[smallest];
			mergeInto(tree, bone, owner, points, volume, smallest, target);
			boneNodes.remove(Integer.valueOf(smallest));
			bodies[target] = createBody(tree.nodes.get(target).name(), world[target], points.get(target), origin);
		}

		// 6. Assemble bodies and joints.
		List<RigidBody> bodyList = new ArrayList<>();
		int[] bodyIndex = new int[n];
		java.util.Arrays.fill(bodyIndex, -1);
		for (int i : boneNodes) {
			bodyIndex[i] = bodyList.size();
			bodyList.add(bodies[i]);
		}
		// Position based solvers dislike extreme mass ratios (a heavy torso on thin legs jitters forever).
		double heaviest = 0.0;
		for (RigidBody body : bodyList) {
			heaviest = Math.max(heaviest, body.mass);
		}
		for (RigidBody body : bodyList) {
			if (body.mass < heaviest * MIN_MASS_RATIO) {
				body.setMass(heaviest * MIN_MASS_RATIO);
			}
		}
		List<Joint> joints = new ArrayList<>();
		for (int i : boneNodes) {
			int parent = jointParent[i];
			if (parent < 0 || bodyIndex[parent] < 0) {
				continue;
			}
			RigidBody child = bodies[i];
			RigidBody parentBody = bodies[parent];
			Vector3d pivot = pivotOf(world[i], origin);
			Vector3d anchor;
			if (parentBody.distanceTo(pivot) < 0.07 + child.boundingRadius * 0.15) {
				anchor = pivot;
			} else {
				Vector3d onParent = parentBody.closestPoint(child.pos);
				Vector3d onChild = child.closestPoint(onParent);
				anchor = onParent.add(onChild).mul(0.5);
			}
			String name = tree.nodes.get(i).name().toLowerCase(Locale.ROOT);
			joints.add(new Joint(parentBody, bodyIndex[parent], child, bodyIndex[i], anchor, limitFor(name, child), dampingFor(name)));
		}

		// 7. Which model parts get explicit transforms: bones, and anything whose parent belongs to a different body.
		List<Ragdoll.Part> parts = new ArrayList<>();
		for (ModelTree.Node node : tree.nodes) {
			int i = node.index();
			int own = owner[i];
			if (own < 0 || bodyIndex[own] < 0) {
				continue;
			}
			int parent = node.parent();
			boolean followsParent = parent >= 0 && owner[parent] == own && !bone[i];
			if (!followsParent) {
				parts.add(new Ragdoll.Part(node.path(), bodyIndex[own], new Matrix4d(world[i])));
			}
		}
		if (parts.isEmpty()) {
			return false;
		}
		ragdoll.install(bodyList, joints, parts);
		return true;
	}

	private static RigidBody createBody(String name, Matrix4d world, List<Vector3d> points, Vec3 origin) {
		Vector3d pivot = world.getTranslation(new Vector3d());
		Quaterniond rotation = new Quaterniond().setFromUnnormalized(world);
		Vector3d min = new Vector3d(Double.MAX_VALUE);
		Vector3d max = new Vector3d(-Double.MAX_VALUE);
		Vector3d local = new Vector3d();
		for (Vector3d point : points) {
			rotation.transformInverse(local.set(point).sub(pivot));
			min.min(local);
			max.max(local);
		}
		Vector3d centerLocal = new Vector3d(min).add(max).mul(0.5);
		Vector3d half = new Vector3d(max).sub(min).mul(0.5);
		Vector3d center = rotation.transform(new Vector3d(centerLocal)).add(pivot).add(origin.x, origin.y, origin.z);
		return new RigidBody(name, center, rotation, half, densityFor(name.toLowerCase(Locale.ROOT)));
	}

	private static Vector3d pivotOf(Matrix4d world, Vec3 origin) {
		return world.getTranslation(new Vector3d()).add(origin.x, origin.y, origin.z);
	}

	private static boolean isIdentity(ModelPart part) {
		return Math.abs(part.x) < 0.01F && Math.abs(part.y) < 0.01F && Math.abs(part.z) < 0.01F
			&& Math.abs(part.xRot) < 1.0E-3F && Math.abs(part.yRot) < 1.0E-3F && Math.abs(part.zRot) < 1.0E-3F
			&& Math.abs(part.xScale - 1.0F) < 1.0E-3F && Math.abs(part.yScale - 1.0F) < 1.0E-3F && Math.abs(part.zScale - 1.0F) < 1.0E-3F;
	}

	private static boolean hasBoneChildren(ModelTree tree, boolean[] bone, int[] owner, int index) {
		for (ModelTree.Node node : tree.nodes) {
			if (bone[node.index()] && node.index() != index && node.parent() >= 0 && owner[node.parent()] == index) {
				return true;
			}
		}
		return false;
	}

	private static void mergeInto(ModelTree tree, boolean[] bone, int[] owner, List<List<Vector3d>> points, double[] volume, int from, int to) {
		bone[from] = false;
		for (int i = 0; i < owner.length; i++) {
			if (owner[i] == from) {
				owner[i] = to;
			}
		}
		List<Vector3d> moved = points.get(from);
		if (moved != null) {
			List<Vector3d> target = points.get(to);
			if (target == null) {
				points.set(to, new ArrayList<>(moved));
			} else {
				target.addAll(moved);
			}
			points.set(from, null);
		}
		volume[to] += volume[from];
		volume[from] = 0.0;
	}

	private static void addHierarchyDescendants(List<Integer> boneNodes, int[] jointParent, List<Integer> connected, int root) {
		boolean added = true;
		while (added) {
			added = false;
			for (int i : boneNodes) {
				if (!connected.contains(i) && jointParent[i] >= 0 && connected.contains(jointParent[i])) {
					connected.add(i);
					added = true;
				}
			}
		}
	}

	private static boolean isJointParent(List<Integer> boneNodes, int[] jointParent, int index) {
		for (int i : boneNodes) {
			if (jointParent[i] == index) {
				return true;
			}
		}
		return false;
	}

	private static double limitFor(String name, RigidBody body) {
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
		return degrees * Mth.DEG_TO_RAD;
	}

	private static boolean isTorsoName(String name) {
		String lower = name.toLowerCase(Locale.ROOT);
		return lower.equals("body") || lower.contains("torso") || lower.contains("chest") || lower.equals("upper_body") || lower.equals("body0");
	}

	/** Heads are light and torsos heavy compared to their box volume. */
	private static double densityFor(String name) {
		if (name.contains("head") || name.contains("skull") || name.contains("ear") || name.contains("tail") || name.contains("wing")) {
			return 0.55;
		}
		if (isTorsoName(name)) {
			return 1.6;
		}
		return 1.0;
	}

	private static double dampingFor(String name) {
		return name.contains("tail") || name.contains("tentacle") ? 2.0 : 5.0;
	}
}
