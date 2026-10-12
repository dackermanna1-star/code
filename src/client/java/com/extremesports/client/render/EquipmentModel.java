package com.extremesports.client.render;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.util.Mth;

/**
 * Box-built equipment model. Every leaf part carries a material, a colour slot and an animation group; the model is
 * drawn in one pass per (group, material, colour) so each component can be tinted with its customization colour.
 * Coordinates: pixels, +y up, +z toward the nose / front wheel, +x toward the left side.
 */
public class EquipmentModel extends Model<EquipmentModel.Pass> {
	public enum Group {
		BODY,
		FRAME,
		FRONT
	}

	public record LeafSpec(List<String> path, Material material, String color, Group group, String tag) {
	}

	public record PassKey(Group group, Material material, String color) {
	}

	/** Per-draw state: which pass is being drawn and the animated angles. */
	public record Pass(PassKey key, float wheel, float crank, Set<String> hiddenTags) {
	}

	/** Mesh plus leaf metadata, kept together until the layer is baked. */
	public static final class Spec {
		public final MeshDefinition mesh = new MeshDefinition();
		final Map<String, LeafSpec> leaves = new HashMap<>();
		final Map<String, List<String>> spinners = new HashMap<>();
		private final Map<PartDefinition, List<String>> paths = new HashMap<>();

		public Spec() {
			paths.put(mesh.getRoot(), List.of());
		}

		public PartDefinition root() {
			return mesh.getRoot();
		}

		public LayerDefinition layer() {
			return LayerDefinition.create(mesh, 64, 64);
		}

		/** A transform-only node; "spin" groups rotate around their x axis (wheels: "wheel", cranks: "crank"). */
		public PartDefinition group(PartDefinition parent, String name, PartPose pose, String spin) {
			PartDefinition child = parent.addOrReplaceChild(name, CubeListBuilder.create(), pose);
			List<String> path = new ArrayList<>(paths.get(parent));
			path.add(name);
			paths.put(child, path);
			if (spin != null) {
				spinners.put(name, path);
			}
			return child;
		}

		public void box(PartDefinition parent, String name, Material material, String color, Group group, String tag,
						float x, float y, float z, float w, float h, float d, PartPose pose) {
			parent.addOrReplaceChild(name, CubeListBuilder.create().texOffs(0, 0).addBox(x, y, z, w, h, d), pose);
			List<String> path = new ArrayList<>(paths.get(parent));
			path.add(name);
			leaves.put(name, new LeafSpec(path, material, color, group, tag));
		}

		public void box(PartDefinition parent, String name, Material material, String color, Group group, String tag,
						float x, float y, float z, float w, float h, float d) {
			box(parent, name, material, color, group, tag, x, y, z, w, h, d, PartPose.ZERO);
		}

		public void box(PartDefinition parent, String name, Material material, String color, Group group,
						float x, float y, float z, float w, float h, float d) {
			box(parent, name, material, color, group, "", x, y, z, w, h, d, PartPose.ZERO);
		}

		/** Square tube between two points (pixels). */
		public void tube(PartDefinition parent, String name, Material material, String color, Group group, String tag,
						 float x0, float y0, float z0, float x1, float y1, float z1, float thickness) {
			float dx = x1 - x0;
			float dy = y1 - y0;
			float dz = z1 - z0;
			float length = Mth.sqrt(dx * dx + dy * dy + dz * dz);
			float pitch = (float) Math.asin(-dy / length);
			float yaw = (float) Mth.atan2(dx, dz);
			float t = thickness / 2.0F;
			box(parent, name, material, color, group, tag, -t, -t, -length / 2.0F, thickness, thickness, length,
				PartPose.offsetAndRotation((x0 + x1) / 2.0F, (y0 + y1) / 2.0F, (z0 + z1) / 2.0F, pitch, yaw, 0.0F));
		}

		/** Ring of segments in the YZ plane around the parent origin (tyres, rims). */
		public void ring(PartDefinition parent, String prefix, Material material, String color, Group group, String tag,
						 float radius, int segments, float width, float thickness) {
			float segment = 2.0F * radius * Mth.sin((float) Math.PI / segments) + 0.25F;
			for (int i = 0; i < segments; i++) {
				float angle = (float) (2.0 * Math.PI * i / segments);
				box(parent, prefix + i, material, color, group, tag,
					-width / 2.0F, -thickness / 2.0F, -segment / 2.0F, width, thickness, segment,
					PartPose.offsetAndRotation(0.0F, radius * Mth.cos(angle), radius * Mth.sin(angle), angle, 0.0F, 0.0F));
			}
		}
	}

	private record Leaf(ModelPart part, LeafSpec spec) {
	}

	private final List<Leaf> leaves = new ArrayList<>();
	private final List<ModelPart> wheels = new ArrayList<>();
	private final List<ModelPart> cranks = new ArrayList<>();
	private final List<PassKey> passes;

	public EquipmentModel(ModelPart root, Spec spec) {
		super(root, RenderTypes::entityCutout);
		Set<PassKey> keys = new LinkedHashSet<>();
		for (LeafSpec leaf : spec.leaves.values()) {
			leaves.add(new Leaf(resolve(root, leaf.path()), leaf));
			keys.add(new PassKey(leaf.group(), leaf.material(), leaf.color()));
		}
		spec.spinners.forEach((name, path) -> {
			ModelPart part = resolve(root, path);
			if (name.startsWith("crank")) {
				cranks.add(part);
			} else {
				wheels.add(part);
			}
		});
		passes = List.copyOf(keys);
	}

	private static ModelPart resolve(ModelPart root, List<String> path) {
		ModelPart part = root;
		for (String name : path) {
			part = part.getChild(name);
		}
		return part;
	}

	public List<PassKey> passes() {
		return passes;
	}

	@Override
	public void setupAnim(Pass pass) {
		super.setupAnim(pass);
		for (Leaf leaf : leaves) {
			LeafSpec spec = leaf.spec();
			leaf.part().visible = spec.group() == pass.key().group() && spec.material() == pass.key().material()
				&& spec.color().equals(pass.key().color()) && (spec.tag().isEmpty() || !pass.hiddenTags().contains(spec.tag()));
		}
		for (ModelPart wheel : wheels) {
			wheel.xRot = pass.wheel();
		}
		for (ModelPart crank : cranks) {
			crank.xRot = pass.crank();
		}
	}
}
