package com.blademode.piece;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.blademode.BladeConfig;
import com.blademode.Scenes;
import com.blademode.cut.Slash;
import com.blademode.geom.Plane;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.BiFunction;
import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaterniond;
import org.joml.Vector3d;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class PhysicsTest {
	@BeforeAll
	static void bootstrap() {
		SharedConstants.tryDetectVersion();
		Bootstrap.bootStrap();
	}

	/** Solid everywhere below y = 0. */
	static final CellSource FLAT = (x, y, z) -> y < 0 ? CellCache.Cell.FULL : CellCache.Cell.EMPTY;

	/** An infinite slope: solid where n.p <= 0, surface rising with x. */
	static CellSource slope(double degrees) {
		double a = Math.toRadians(degrees);
		Plane world = new Plane(-Math.sin(a), Math.cos(a), 0, 0);
		return (x, y, z) -> {
			double min = world.minDist(x, y, z, x + 1, y + 1, z + 1);
			double max = world.maxDist(x, y, z, x + 1, y + 1, z + 1);
			if (max <= 0) {
				return CellCache.Cell.FULL;
			}
			if (min >= 0) {
				return CellCache.Cell.EMPTY;
			}
			Plane local = world.translated(x, y, z);
			return new CellCache.Cell(new AABB[]{new AABB(0, 0, 0, 1, 1, 1)}, new Plane[]{local}, false, -1, 0);
		};
	}

	static PhysicsWorld.Sim body(List<PieceBlock> blocks, Vector3d gridOrigin) {
		Vector3d com = PieceBody.centerOfMass(blocks);
		PieceData data = new PieceData(blocks, new Vec3(-com.x, -com.y, -com.z));
		PieceBody b = new PieceBody(data);
		return new PhysicsWorld.Sim(b, new Vector3d(gridOrigin).add(com), new Quaterniond(), new Vector3d(), new Vector3d(), true, null);
	}

	static PieceBlock block(int x, int y, int z, BlockState state) {
		return new PieceBlock(new BlockPos(x, y, z), state, List.of(), Optional.empty());
	}

	static void run(PhysicsWorld.Sim s, CellSource world, int ticks) {
		List<PhysicsWorld.Sim> list = new ArrayList<>(List.of(s));
		for (int i = 0; i < ticks; i++) {
			PhysicsWorld.simulate(list, list, world, BladeConfig.get());
		}
	}

	@Test
	void cubeFallsAndRestsOnFlatGround() {
		PhysicsWorld.Sim s = body(List.of(block(0, 0, 0, Blocks.STONE.defaultBlockState())), new Vector3d(0, 4, 0));
		run(s, FLAT, 60);
		assertEquals(0.5, s.pos.y, 0.03, "cube centre should rest half a block above the ground");
		assertEquals(0.5, s.pos.x, 0.05);
		assertEquals(0.5, s.pos.z, 0.05);
		assertTrue(s.vel.length() < 0.1, "should be at rest: " + s.vel);
	}

	@Test
	void cubeSlidesDownSteepSlope() {
		// tan(26°) ≈ 0.49 is above the cut-surface friction (0.25) but below ordinary friction (0.55).
		CellSource world = slope(26);
		double a = Math.toRadians(26);
		// Put the cube's bottom face on the slope at x = 0.
		PhysicsWorld.Sim s = body(List.of(block(0, 0, 0, Blocks.STONE.defaultBlockState())), new Vector3d(-0.5, 0.05, -0.5));
		s.rot.rotateZ(a);
		s.updateMatrices();
		s.pos.set(-Math.sin(a) * 0.5, Math.cos(a) * 0.5 + 0.01, 0);
		double x0 = s.pos.x;
		run(s, world, 20);
		System.out.println("slope pos=" + s.pos + " vel=" + s.vel + " contacts=" + PhysicsWorld.lastContactCount);
		assertTrue(s.pos.x < x0 - 0.3, "cube should slide downhill (-x), moved " + (s.pos.x - x0));
	}

	/** The exact stump left by the in-game tree test: a log at (0,-60,6) cut by a 26° plane, grass below. */
	static CellSource stumpWorld(Plane stumpLocal) {
		return (x, y, z) -> {
			if (y < -60) {
				return CellCache.Cell.FULL;
			}
			if (x == 0 && y == -60 && z == 6) {
				return new CellCache.Cell(new AABB[]{new AABB(0, 0, 0, 1, 1, 1)}, new Plane[]{stumpLocal}, false, -1, 0);
			}
			return CellCache.Cell.EMPTY;
		};
	}

	@Test
	void treeTrunkSlidesOffDiagonalStump() {
		Plane stump = new Plane(-0.40986387048127776, 0.8966691512946772, 0.16732017448768677, 0.3274110275588171);
		List<PieceBlock> blocks = new ArrayList<>();
		BlockState log = Blocks.OAK_LOG.defaultBlockState();
		blocks.add(new PieceBlock(new BlockPos(2, 0, 2), log, List.of(stump.flip()), Optional.empty()));
		for (int y = 1; y <= 3; y++) {
			blocks.add(block(2, y, 2, log));
		}
		// A ring of leaves around the upper logs.
		for (int y = 1; y <= 4; y++) {
			for (int dx = -2; dx <= 2; dx++) {
				for (int dz = -2; dz <= 2; dz++) {
					if ((dx != 0 || dz != 0 || y == 4) && Math.abs(dx) + Math.abs(dz) <= 3) {
						blocks.add(block(2 + dx, y, 2 + dz, Blocks.OAK_LEAVES.defaultBlockState()));
					}
				}
			}
		}
		PhysicsWorld.Sim s = body(blocks, new Vector3d(-2, -60, 4));
		Vector3d start = new Vector3d(s.pos);
		CellSource world = stumpWorld(stump);
		for (int t = 0; t < 40; t++) {
			run(s, world, 1);
			if (t % 5 == 0 || t < 10) {
				System.out.println("tree t=" + t + " pos=" + s.pos + " vel=" + s.vel + " ang=" + s.angVel + " contacts=" + PhysicsWorld.lastContactCount);
			}
		}
		assertTrue(s.pos.distance(start) > 0.3, "tree top should slide or topple off the slanted stump, moved " + s.pos.distance(start));
	}

	@Test
	void houseTopSlidesDownTiltedCut() {
		Slash slash = Scenes.houseSlash();
		Plane plane = slash.worldPlane();
		List<PieceBlock> top = Scenes.sideOf(Scenes.house(), plane, new Vec3(23.5, -50, 11));
		CellSource world = Scenes.world(Scenes.sideOf(Scenes.house(), plane, new Vec3(23.5, -70, 11)), -61);
		PhysicsWorld.Sim s = body(top, new Vector3d());
		Vector3d start = new Vector3d(s.pos);
		for (int t = 0; t < 100; t++) {
			run(s, world, 1);
			if (t % 10 == 0) {
				System.out.println("house t=" + t + " pos=" + s.pos + " vel=" + s.vel + " contacts=" + PhysicsWorld.lastContactCount);
			}
		}
		// The cut drops about 17 degrees towards -x, more than the cut-surface friction holds. The top
		// must glide across the doorway (it used to catch on the far jamb) until its low edge reaches
		// the ground, about two blocks down the slope.
		assertTrue(start.x - s.pos.x > 1.5, "the top of the house should slide down the cut, moved " + (s.pos.x - start.x));
		assertTrue(Math.abs(s.pos.z - start.z) < 0.2, "it should slide straight down the slope");
	}

	@Test
	void complementaryHalvesMerge() {
		Plane cut = new Plane(0.3, 0.9, 0.1, 0.5);
		Plane other = new Plane(1, 0, 0, 0.8);
		assertEquals(List.of(), Solidifier.mergeComplementary(List.of(cut), List.of(cut.flip())));
		assertEquals(List.of(other), Solidifier.mergeComplementary(List.of(other, cut), List.of(cut.flip(), other)));
		assertEquals(null, Solidifier.mergeComplementary(List.of(cut), List.of(other)));
	}
}
