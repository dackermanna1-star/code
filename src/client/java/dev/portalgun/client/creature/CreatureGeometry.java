package dev.portalgun.client.creature;

import com.google.gson.Gson;
import dev.portalgun.PortalGunMod;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;

/**
 * The generated creature geometry (assets/portalgun/geometry/&lt;id&gt;.json, written by tools/gen/content/creatures.py):
 * a part tree in vanilla model space with box-UV cuboids and procedural animation hints.
 */
public final class CreatureGeometry {
	public int[] texture = {64, 64};
	public float scale = 1.0F;
	public String archetype = "quadruped";
	public boolean translucent;
	public boolean glow;
	public List<Part> parts = new ArrayList<>();

	public static final class Part {
		public String name;
		public float[] pivot = {0, 0, 0};
		public float[] rot = {0, 0, 0};
		public List<Cube> cubes = new ArrayList<>();
		public List<Anim> anims = new ArrayList<>();
		public List<Part> children = new ArrayList<>();
	}

	public static final class Cube {
		public float[] o = {0, 0, 0};
		public float[] s = {1, 1, 1};
		public int[] uv = {0, 0};
		public float inflate;
		public boolean mirror;
	}

	/** Animation hint: kind leg|arm|wing|tentacle|tail|segment|swim|bob|sway|spin|jaw|look|squish|hop_body|hop_leg|hop_arm. */
	public static final class Anim {
		public String kind = "sway";
		public String axis = "x";
		public float amp = 0.5F;
		public float speed = 1.0F;
		public float phase;
		public float attack;
		public float rest;
	}

	public static CreatureGeometry load(String id) {
		String path = "/assets/" + PortalGunMod.MOD_ID + "/geometry/" + id + ".json";
		try (InputStream in = CreatureGeometry.class.getResourceAsStream(path)) {
			if (in == null) {
				PortalGunMod.LOGGER.error("Missing creature geometry {} - using a placeholder box", path);
				return placeholder();
			}
			CreatureGeometry g = new Gson().fromJson(new InputStreamReader(in, StandardCharsets.UTF_8), CreatureGeometry.class);
			return g == null || g.parts.isEmpty() ? placeholder() : g;
		} catch (Exception e) {
			PortalGunMod.LOGGER.error("Bad creature geometry {}", path, e);
			return placeholder();
		}
	}

	private static CreatureGeometry placeholder() {
		CreatureGeometry g = new CreatureGeometry();
		Part p = new Part();
		p.name = "body";
		p.pivot = new float[] {0, 24, 0};
		Cube c = new Cube();
		c.o = new float[] {-4, -8, -4};
		c.s = new float[] {8, 8, 8};
		p.cubes.add(c);
		g.parts.add(p);
		return g;
	}

	public LayerDefinition layer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		for (Part p : this.parts) {
			add(root, p);
		}
		return LayerDefinition.create(mesh, this.texture[0], this.texture[1]);
	}

	private static void add(PartDefinition parent, Part p) {
		CubeListBuilder cubes = CubeListBuilder.create();
		for (Cube c : p.cubes) {
			cubes.texOffs(c.uv[0], c.uv[1]).mirror(c.mirror)
				.addBox(c.o[0], c.o[1], c.o[2], c.s[0], c.s[1], c.s[2], new CubeDeformation(c.inflate));
		}
		float[] r = p.rot != null ? p.rot : new float[3];
		PartDefinition def = parent.addOrReplaceChild(p.name, cubes, PartPose.offsetAndRotation(p.pivot[0], p.pivot[1], p.pivot[2], r[0], r[1], r[2]));
		for (Part ch : p.children) {
			add(def, ch);
		}
	}
}
