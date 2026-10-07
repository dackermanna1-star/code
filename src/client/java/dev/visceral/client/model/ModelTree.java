package dev.visceral.client.model;

import dev.visceral.client.mixin.ModelPartAccessor;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.model.geom.ModelPart;
import org.joml.Matrix4f;
import org.joml.Quaternionf;

/**
 * Flattened view of a {@link ModelPart} hierarchy. Paths follow vanilla's {@code ModelPart.visit}
 * scheme: {@code ""} for the root, {@code "/head"}, {@code "/head/hat"} and so on.
 */
public final class ModelTree {
	private static final Map<ModelPart, ModelTree> CACHE = Collections.synchronizedMap(new WeakHashMap<>());

	public final ModelPart root;
	/** Depth first, parents always before their children. */
	public final List<Node> nodes;
	public final Map<String, Node> byPath;

	public record Node(int index, String path, String name, ModelPart part, int parent, List<ModelPart.Cube> cubes) {
		public boolean hasCubes() {
			return !this.cubes.isEmpty();
		}
	}

	private ModelTree(ModelPart root) {
		this.root = root;
		List<Node> list = new ArrayList<>();
		add(list, root, "", "root", -1);
		this.nodes = List.copyOf(list);
		Map<String, Node> map = new HashMap<>();
		for (Node node : this.nodes) {
			map.put(node.path, node);
		}
		this.byPath = map;
	}

	private static void add(List<Node> list, ModelPart part, String path, String name, int parent) {
		ModelPartAccessor accessor = (ModelPartAccessor) (Object) part;
		int index = list.size();
		list.add(new Node(index, path, name, part, parent, List.copyOf(accessor.visceral$cubes())));
		for (Map.Entry<String, ModelPart> entry : accessor.visceral$children().entrySet()) {
			add(list, entry.getValue(), path + "/" + entry.getKey(), entry.getKey(), index);
		}
	}

	public static ModelTree of(ModelPart root) {
		return CACHE.computeIfAbsent(root, ModelTree::new);
	}

	public int size() {
		return this.nodes.size();
	}

	/** Model-space transform of every node for the model's current pose (blocks, before the entity transform). */
	public Matrix4f[] poseMatrices() {
		Matrix4f[] result = new Matrix4f[this.nodes.size()];
		for (Node node : this.nodes) {
			Matrix4f matrix = node.parent < 0 ? new Matrix4f() : new Matrix4f(result[node.parent]);
			applyLocal(matrix, node.part);
			result[node.index] = matrix;
		}
		return result;
	}

	/** Whether this node and every ancestor is visible. */
	public boolean isVisible(Node node) {
		for (Node current = node; current != null; current = current.parent < 0 ? null : this.nodes.get(current.parent)) {
			if (!current.part.visible) {
				return false;
			}
		}
		return true;
	}

	/** Same as {@code ModelPart.translateAndRotate}. */
	public static void applyLocal(Matrix4f matrix, ModelPart part) {
		matrix.translate(part.x / 16.0F, part.y / 16.0F, part.z / 16.0F);
		if (part.xRot != 0.0F || part.yRot != 0.0F || part.zRot != 0.0F) {
			matrix.rotate(new Quaternionf().rotationZYX(part.zRot, part.yRot, part.xRot));
		}
		if (part.xScale != 1.0F || part.yScale != 1.0F || part.zScale != 1.0F) {
			matrix.scale(part.xScale, part.yScale, part.zScale);
		}
	}

	/** Rendered bounds of a cube in part space, pixels: {minX, minY, minZ, maxX, maxY, maxZ} including inflation. */
	public static float[] cubeBounds(ModelPart.Cube cube) {
		float minX = Float.POSITIVE_INFINITY;
		float minY = Float.POSITIVE_INFINITY;
		float minZ = Float.POSITIVE_INFINITY;
		float maxX = Float.NEGATIVE_INFINITY;
		float maxY = Float.NEGATIVE_INFINITY;
		float maxZ = Float.NEGATIVE_INFINITY;
		for (ModelPart.Polygon polygon : cube.polygons) {
			for (ModelPart.Vertex vertex : polygon.vertices()) {
				minX = Math.min(minX, vertex.x());
				minY = Math.min(minY, vertex.y());
				minZ = Math.min(minZ, vertex.z());
				maxX = Math.max(maxX, vertex.x());
				maxY = Math.max(maxY, vertex.y());
				maxZ = Math.max(maxZ, vertex.z());
			}
		}
		if (minX == Float.POSITIVE_INFINITY) {
			return new float[] {cube.minX, cube.minY, cube.minZ, cube.maxX, cube.maxY, cube.maxZ};
		}
		return new float[] {minX, minY, minZ, maxX, maxY, maxZ};
	}

	/** Outer clothing layers of player-like models: wounds go on the skin underneath. */
	public static boolean isOverlayLayer(String name) {
		return switch (name) {
			case "hat", "jacket", "left_sleeve", "right_sleeve", "left_pants", "right_pants", "cloak", "outer", "overlay" -> true;
			default -> false;
		};
	}
}
