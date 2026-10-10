package com.blademode.gore;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.blademode.geom.Plane;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.phys.AABB;
import org.joml.Matrix4d;
import org.joml.Vector3d;
import org.junit.jupiter.api.Test;

class RagdollTest {
	/** Solid below y = 0. */
	static final class Floor implements WorldShape {
		@Override
		public void prepare(AABB region) {
		}

		@Override
		public boolean isEmpty() {
			return false;
		}

		@Override
		public long signature() {
			return 1;
		}

		@Override
		public boolean isSolid(double x, double y, double z) {
			return y < 0;
		}

		@Override
		public boolean collide(Vector3d point, Vector3d previous, Contact out) {
			if (point.y >= 0) {
				return false;
			}
			out.normal.set(0, 1, 0);
			out.depth = -point.y;
			return true;
		}
	}

	private static Piece part(String path, double px, double py, double pz, double yaw, float x0, float y0, float z0, float x1, float y1, float z1) {
		Matrix4d world = new Matrix4d().rotateY(yaw).translate(px, py, pz);
		return new Piece(0, path, world, List.of(Cube.box(x0, y0, z0, x1, y1, z1)), List.of());
	}

	/** A player-sized humanoid standing on y = 0, parts side by side at the root like vanilla's biped model. */
	static List<Piece> humanoid(double yaw) {
		List<Piece> parts = new ArrayList<>();
		parts.add(part("/head", 0, 1.5, 0, yaw, -0.25F, 0F, -0.25F, 0.25F, 0.5F, 0.25F));
		parts.add(part("/body", 0, 1.5, 0, yaw, -0.25F, -0.75F, -0.125F, 0.25F, 0F, 0.125F));
		parts.add(part("/right_arm", -0.375, 1.375, 0, yaw, -0.125F, -0.625F, -0.125F, 0.125F, 0.125F, 0.125F));
		parts.add(part("/left_arm", 0.375, 1.375, 0, yaw, -0.125F, -0.625F, -0.125F, 0.125F, 0.125F, 0.125F));
		parts.add(part("/right_leg", -0.125, 0.75, 0, yaw, -0.125F, -0.75F, -0.125F, 0.125F, 0F, 0.125F));
		parts.add(part("/left_leg", 0.125, 0.75, 0, yaw, -0.125F, -0.75F, -0.125F, 0.125F, 0F, 0.125F));
		return parts;
	}

	private static Ragdoll build(double yaw) {
		Ragdoll ragdoll = RagdollBuilder.build(new Vector3d(), humanoid(yaw), 7L);
		assertNotNull(ragdoll);
		return ragdoll;
	}

	private static Ragdoll.Cut cut(Ragdoll ragdoll, Plane plane) {
		return ragdoll.cut(plane, body -> true, new Vector3d(1, 0, 0), 1.0, 1.0);
	}

	@Test
	void humanoidBecomesSixJointedBones() {
		Ragdoll ragdoll = build(0);
		assertEquals(6, ragdoll.bodies.size());
		assertEquals(5, ragdoll.jointCount());
		assertEquals(1, ragdoll.chunkCount());
	}

	@Test
	void cutThroughTheWaistSplitsTorsoAndArms() {
		Ragdoll ragdoll = build(0.4);
		// Level cut at y = 1.1: through the torso and both hanging arms.
		Ragdoll.Cut result = cut(ragdoll, new Plane(0, 1, 0, 1.1));
		assertTrue(result.happened());
		assertEquals(9, ragdoll.bodies.size(), "torso and both arms are cut in two");
		// Head + upper torso + upper arms, lower torso + legs, and the two loose forearms.
		assertEquals(4, ragdoll.chunkCount());
		assertEquals(5, ragdoll.jointCount());
		for (Body body : ragdoll.bodies) {
			for (Piece piece : body.pieces) {
				List<Vector3d> points = new ArrayList<>();
				piece.points(points);
				boolean above = points.stream().allMatch(p -> p.y >= 1.1 - 1.0E-4);
				boolean below = points.stream().allMatch(p -> p.y <= 1.1 + 1.0E-4);
				assertTrue(above || below, "every piece lies on one side of the cut: " + body.name);
			}
		}
	}

	@Test
	void cutAtTheNeckTakesTheHeadOff() {
		Ragdoll ragdoll = build(0);
		Ragdoll.Cut result = cut(ragdoll, new Plane(0, 1, 0, 1.5));
		// No body straddles the plane, but the neck joint is severed.
		assertEquals(6, ragdoll.bodies.size());
		assertEquals(4, ragdoll.jointCount());
		assertEquals(2, ragdoll.chunkCount());
		assertTrue(result.happened() && result.created().isEmpty());
		assertEquals(1, result.severed().size());
	}

	@Test
	void diagonalCutKeepsVolume() {
		Ragdoll ragdoll = build(0.9);
		double before = ragdoll.bodies.stream().mapToDouble(b -> b.volume).sum();
		Vector3d n = new Vector3d(0.6, 0.8, 0.3).normalize();
		cut(ragdoll, new Plane(n.x, n.y, n.z, n.dot(0.05, 1.2, 0)));
		double after = ragdoll.bodies.stream().mapToDouble(b -> b.volume).sum();
		assertEquals(before, after, 1.0E-6, "cutting only redistributes the body");
		assertTrue(ragdoll.chunkCount() >= 2);
	}

	@Test
	void corpseCollapsesAndRestsOnTheFloor() {
		Ragdoll ragdoll = build(0.2);
		Floor floor = new Floor();
		for (int t = 0; t < 200; t++) {
			ragdoll.tick(floor, 22.0, 100000);
		}
		double lowest = Double.MAX_VALUE;
		double torsoY = 0;
		for (Body body : ragdoll.bodies) {
			for (Vector3d s : body.samples) {
				lowest = Math.min(lowest, body.worldPoint(s, new Vector3d()).y);
			}
			if (body.name.equals("body")) {
				torsoY = body.pos.y;
			}
			assertTrue(Double.isFinite(body.pos.x + body.pos.y + body.pos.z));
		}
		assertTrue(lowest > -0.06, "nothing sinks into the floor: " + lowest);
		assertTrue(torsoY < 0.5, "a dead body does not stay standing, torso at " + torsoY);
	}

	@Test
	void halvesFallApartAndSettle() {
		Ragdoll ragdoll = build(0);
		cut(ragdoll, new Plane(0, 1, 0, 1.1));
		Floor floor = new Floor();
		for (int t = 0; t < 300; t++) {
			ragdoll.tick(floor, 22.0, 100000);
		}
		for (Body body : ragdoll.bodies) {
			for (Vector3d s : body.samples) {
				assertTrue(body.worldPoint(s, new Vector3d()).y > -0.06, body.name + " sank into the floor");
			}
		}
		assertTrue(ragdoll.isSleeping(), "the pieces come to rest");
	}
}
