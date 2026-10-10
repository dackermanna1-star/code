package com.blademode.geom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.blademode.cut.Slash;
import java.util.List;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix3d;
import org.joml.Vector3d;
import org.junit.jupiter.api.Test;

class GeometryTest {
	private static final double EPS = 1.0E-9;
	private static final AABB CUBE = new AABB(0, 0, 0, 1, 1, 1);

	@Test
	void wholeCube() {
		ConvexPart c = new ConvexPart(0, 0, 0, 1, 1, 1, List.of());
		assertEquals(1.0, c.volume, EPS);
		assertEquals(0.5, c.centroid.x, EPS);
		assertEquals(0.5, c.centroid.y, EPS);
		assertEquals(0.5, c.centroid.z, EPS);
		assertEquals(6, c.faces.size());
	}

	@Test
	void horizontalHalf() {
		ConvexPart c = new ConvexPart(0, 0, 0, 1, 1, 1, List.of(new Plane(0, 1, 0, 0.5)));
		assertEquals(0.5, c.volume, EPS);
		assertEquals(0.25, c.centroid.y, EPS);
		// 5 clipped box faces (the top one is gone) + 1 cap.
		assertEquals(6, c.faces.size());
		long caps = c.faces.stream().filter(ConvexPart.Face::isCap).count();
		assertEquals(1, caps);
		ConvexPart.Face cap = c.faces.stream().filter(ConvexPart.Face::isCap).findFirst().orElseThrow();
		assertEquals(1.0, cap.poly().area(), 1.0E-9);
		// Cap winding is counter-clockwise around its outward normal (+Y).
		Vector3d n = cap.poly().newell(new Vector3d()).normalize();
		assertEquals(1.0, n.y, 1.0E-9);
	}

	@Test
	void diagonalWedge() {
		double s = Math.sqrt(0.5);
		ConvexPart c = new ConvexPart(0, 0, 0, 1, 1, 1, List.of(new Plane(s, s, 0, s)));
		assertEquals(0.5, c.volume, 1.0E-9);
		assertEquals(1.0 / 3.0, c.centroid.x, 1.0E-9);
		assertEquals(1.0 / 3.0, c.centroid.y, 1.0E-9);
		assertEquals(0.5, c.centroid.z, 1.0E-9);
		ConvexPart.Face cap = c.faces.stream().filter(ConvexPart.Face::isCap).findFirst().orElseThrow();
		assertEquals(Math.sqrt(2.0), cap.poly().area(), 1.0E-9);
	}

	@Test
	void complementaryHalvesAddUp() {
		Vector3d n = new Vector3d(0.3, 0.8, -0.52).normalize();
		Plane p = new Plane(n.x, n.y, n.z, n.dot(new Vector3d(0.4, 0.55, 0.6)));
		PartShape back = new PartShape(List.of(CUBE), List.of(p));
		PartShape front = new PartShape(List.of(CUBE), List.of(p.flip()));
		assertEquals(1.0, back.volume + front.volume, 1.0E-9);
		Vector3d c = new Vector3d(back.centroid).mul(back.volume).fma(front.volume, front.centroid);
		assertEquals(0.5, c.x, 1.0E-9);
		assertEquals(0.5, c.y, 1.0E-9);
		assertEquals(0.5, c.z, 1.0E-9);
	}

	@Test
	void repeatedPlaneDoesNotChangeTheShape() {
		Plane p = new Plane(0.2867691459263007, -0.9579997165681731, 0.0, -0.8350366760246857);
		PartShape once = new PartShape(List.of(CUBE), List.of(p));
		PartShape twice = new PartShape(List.of(CUBE), List.of(p, p));
		assertEquals(once.volume, twice.volume, 1.0E-12);
		assertTrue(once.volume > 0.02);
		PartShape none = new PartShape(List.of(CUBE), List.of(p, p.flip()));
		assertEquals(0.0, none.volume, 1.0E-9);
	}

	@Test
	void twoCutsMakeAQuarter() {
		PartShape q = new PartShape(List.of(CUBE), List.of(new Plane(1, 0, 0, 0.5), new Plane(0, 1, 0, 0.5)));
		assertEquals(0.25, q.volume, 1.0E-9);
		assertEquals(0.25, q.fraction(), 1.0E-9);
		assertTrue(q.contains(0.2, 0.2, 0.5, 0.0));
		assertFalse(q.contains(0.7, 0.2, 0.5, 0.0));
	}

	@Test
	void slabHasHalfVolume() {
		PartShape slab = new PartShape(List.of(new AABB(0, 0, 0, 1, 0.5, 1)), List.of(new Plane(1, 0, 0, 0.25)));
		assertEquals(0.125, slab.volume, 1.0E-9);
		assertEquals(0.25, slab.fraction(), 1.0E-9);
	}

	@Test
	void contactAreaBetweenCubes() {
		PartShape a = new PartShape(List.of(CUBE), List.of());
		PartShape b = new PartShape(List.of(CUBE), List.of());
		assertEquals(1.0, a.contactArea(0, 1, 0, b), 1.0E-9);
		// A cut that removes the top half of the upper face area: plane x <= 0.5 on the lower block.
		PartShape half = new PartShape(List.of(CUBE), List.of(new Plane(1, 0, 0, 0.5)));
		assertEquals(0.5, half.contactArea(0, 1, 0, b), 1.0E-9);
		assertEquals(0.5, b.contactArea(0, -1, 0, half), 1.0E-9);
		// Opposite halves of the same cut touching across a face do not overlap at all.
		PartShape left = new PartShape(List.of(CUBE), List.of(new Plane(1, 0, 0, 0.5)));
		PartShape right = new PartShape(List.of(CUBE), List.of(new Plane(-1, 0, 0, -0.5)));
		assertEquals(0.0, left.contactArea(0, 1, 0, right), 1.0E-9);
	}

	@Test
	void slabDoesNotTouchBlockAbove() {
		PartShape slab = new PartShape(List.of(new AABB(0, 0, 0, 1, 0.5, 1)), List.of());
		PartShape cube = new PartShape(List.of(CUBE), List.of());
		assertEquals(0.0, slab.contactArea(0, 1, 0, cube), 1.0E-9);
		assertEquals(1.0, slab.contactArea(0, -1, 0, cube), 1.0E-9);
	}

	@Test
	void polygonClip() {
		Poly square = Poly.quad(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0);
		double s = Math.sqrt(0.5);
		Poly tri = square.clip(new Plane(s, s, 0, s));
		assertNotNull(tri);
		assertEquals(3, tri.count);
		assertEquals(0.5, tri.area(), 1.0E-9);
		assertNull(square.clip(new Plane(1, 0, 0, -1)));
		assertTrue(square.clip(new Plane(1, 0, 0, 2)) == square);
	}

	@Test
	void planeTransforms() {
		Plane p = new Plane(0, 1, 0, 0.25);
		// Shift origin to (0, 1, 0): the plane y <= 0.25 becomes y' <= -0.75.
		Plane t = p.translated(0, 1, 0);
		assertEquals(-0.75, t.d(), EPS);
		// Rotate 90° about Z: +Y maps to -X.
		Matrix3d rot = new Matrix3d().rotateZ(Math.PI / 2);
		Plane r = p.transformed(rot, 0, 0, 0);
		assertEquals(-1.0, r.nx(), 1.0E-9);
		assertEquals(0.0, r.ny(), 1.0E-9);
		// A point that was inside stays inside after the same transform.
		Vector3d inside = new Vector3d(0.3, 0.1, 0.2);
		assertTrue(p.dist(inside) <= 0);
		assertTrue(r.dist(rot.transform(new Vector3d(inside))) <= 1.0E-12);
	}

	@Test
	void sectorBounds() {
		Slash slash = Slash.of(new Vec3(0, 0, 0), new Vec3(-1, 0, 1), new Vec3(1, 0, 1), 10);
		assertNotNull(slash);
		// Horizontal plane through the eye.
		assertEquals(0.0, slash.dist(5, 0, 5), 1.0E-9);
		assertTrue(slash.inSector(0, 0, 5, 0));
		assertTrue(slash.inSector(3, 0, 5, 0));
		assertFalse(slash.inSector(6, 0, 5, 0));
		assertFalse(slash.inSector(0, 0, -5, 0));
		assertFalse(slash.inSector(0, 0, 11, 0));
		// Parallel rays don't define a plane.
		assertNull(Slash.of(new Vec3(0, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, 1), 10));
	}
}
