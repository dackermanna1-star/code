package com.mineception.dream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mineception.dream.render.Camera;
import org.junit.jupiter.api.Test;

/** The dream avatar must move like a Minecraft player. */
class MiniPlayerTest {
	private static final MiniInput FORWARD = new MiniInput(true, false, false, false, false, false, false);
	private static final MiniInput SPRINT = new MiniInput(true, false, false, false, false, true, false);
	private static final MiniInput JUMP = new MiniInput(false, false, false, false, true, false, false);
	private static final MiniInput SNEAK_FORWARD = new MiniInput(true, false, false, false, false, false, true);
	private static final MiniInput DIAGONAL = new MiniInput(true, false, true, false, false, false, false);

	/** An empty level with a stone floor whose top is at y = 4 over the whole area. */
	static MiniWorld flat() {
		MiniWorld w = new MiniWorld(1, 0L);
		Build.fill(w, 0, 0, 0, 39, 3, 39, MiniBlock.STONE);
		return w;
	}

	static MiniPlayer at(double x, double y, double z, float yaw) {
		MiniPlayer p = new MiniPlayer();
		p.x = p.xo = x;
		p.y = p.yo = y;
		p.z = p.zo = z;
		p.yaw = p.yawO = yaw;
		return p;
	}

	static void run(MiniPlayer p, MiniWorld w, MiniInput input, int ticks) {
		for (int i = 0; i < ticks; i++) {
			p.tick(w, input);
		}
	}

	@Test
	void fallsAndLandsExactlyOnTheFloor() {
		MiniWorld w = flat();
		MiniPlayer p = at(10.5, 12.0, 10.5, 0.0F);
		run(p, w, MiniInput.NONE, 40);
		assertTrue(p.onGround);
		assertEquals(4.0, p.y, 1e-9);
		// Like a vanilla player at rest, the remaining velocity is one tick of gravity, clipped every move
		assertEquals(-0.0784, p.vy, 1e-9);
		// Falling 8 blocks takes 16 ticks, as in Minecraft
		MiniPlayer q = at(10.5, 12.0, 10.5, 0.0F);
		int ticks = 0;
		while (!q.onGround && ticks < 100) {
			q.tick(w, MiniInput.NONE);
			ticks++;
		}
		assertEquals(16, ticks, "ticks to fall 8 blocks");
	}

	@Test
	void gravityAndDragMatchVanilla() {
		MiniWorld w = new MiniWorld(1, 0L);
		MiniPlayer p = at(10.5, 20.0, 10.5, 0.0F);
		p.tick(w, MiniInput.NONE);
		assertEquals(-0.0784, p.vy, 1e-9);
		p.tick(w, MiniInput.NONE);
		assertEquals((-0.0784 - 0.08) * 0.98, p.vy, 1e-9);
	}

	@Test
	void jumpHeightIsAboutOneAndAQuarterBlocks() {
		MiniWorld w = flat();
		MiniPlayer p = at(10.5, 4.0, 10.5, 0.0F);
		p.tick(w, MiniInput.NONE);
		assertTrue(p.onGround);
		double top = p.y;
		p.tick(w, JUMP);
		for (int i = 0; i < 30; i++) {
			p.tick(w, MiniInput.NONE);
			top = Math.max(top, p.y);
		}
		double height = top - 4.0;
		assertTrue(height >= 1.1 && height <= 1.3, "jump height " + height);
		assertTrue(p.onGround);
		assertEquals(4.0, p.y, 1e-9);
	}

	@Test
	void jumpsOntoAOneBlockStepButNotTwo() {
		MiniWorld w = flat();
		Build.fill(w, 12, 4, 0, 39, 4, 39, MiniBlock.STONE);
		MiniPlayer p = at(10.5, 4.0, 10.5, 270.0F);
		MiniInput forwardJump = new MiniInput(true, false, false, false, true, false, false);
		run(p, w, forwardJump, 30);
		run(p, w, MiniInput.NONE, 30);
		assertEquals(5.0, p.y, 1e-9, "climbed the step");
		assertTrue(p.x > 12.3);

		MiniWorld wall = flat();
		Build.fill(wall, 12, 4, 0, 39, 5, 39, MiniBlock.STONE);
		MiniPlayer q = at(10.5, 4.0, 10.5, 270.0F);
		run(q, wall, forwardJump, 40);
		run(q, wall, MiniInput.NONE, 30);
		assertEquals(4.0, q.y, 1e-9);
		assertEquals(12.0 - MiniPlayer.WIDTH / 2.0, q.x, 1e-6, "stopped at the wall");
	}

	@Test
	void walkingAndSprintingSpeedsMatchMinecraft() {
		assertEquals(4.317, speed(FORWARD), 0.02);
		assertEquals(5.612, speed(SPRINT), 0.03);
		assertEquals(1.295, speed(SNEAK_FORWARD), 0.05);
		// Diagonal walking is a touch faster than straight, as in vanilla (input length 1.0 instead of 0.98)
		assertEquals(4.317 / 0.98, speed(DIAGONAL), 0.03);
	}

	/** Blocks per second after reaching full speed on flat ground, heading east (yaw 270). */
	private static double speed(MiniInput input) {
		MiniWorld w = flat();
		MiniPlayer p = at(2.5, 4.0, 20.5, 270.0F);
		p.tick(w, MiniInput.NONE);
		run(p, w, input, 20);
		double startX = p.x;
		double startZ = p.z;
		run(p, w, input, 20);
		return Math.hypot(p.x - startX, p.z - startZ);
	}

	@Test
	void yawConventionMatchesTheCamera() {
		MiniWorld w = flat();
		for (float yaw : new float[]{0.0F, 90.0F, 180.0F, 270.0F, 37.0F}) {
			MiniPlayer p = at(20.5, 4.0, 20.5, yaw);
			p.tick(w, MiniInput.NONE);
			run(p, w, FORWARD, 10);
			double[] f = new Camera(0, 0, 0, yaw, 0.0F, 70.0F).forward();
			double dx = p.x - 20.5;
			double dz = p.z - 20.5;
			double len = Math.hypot(dx, dz);
			assertEquals(f[0], dx / len, 1e-6, "yaw " + yaw);
			assertEquals(f[2], dz / len, 1e-6, "yaw " + yaw);
		}
	}

	@Test
	void airControlIsWeakerThanGroundControl() {
		MiniWorld w = new MiniWorld(1, 0L);
		MiniPlayer air = at(20.5, 25.0, 20.5, 270.0F);
		run(air, w, FORWARD, 5);
		MiniPlayer ground = at(20.5, 4.0, 20.5, 270.0F);
		MiniWorld floor = flat();
		ground.tick(floor, MiniInput.NONE);
		run(ground, floor, FORWARD, 5);
		assertTrue(air.x - 20.5 < (ground.x - 20.5) * 0.4, "air " + (air.x - 20.5) + " ground " + (ground.x - 20.5));
	}

	@Test
	void sprintJumpCarriesFurther() {
		MiniWorld w = flat();
		MiniInput sprintJump = new MiniInput(true, false, false, false, true, true, false);
		MiniPlayer p = at(2.5, 4.0, 20.5, 270.0F);
		p.tick(w, MiniInput.NONE);
		run(p, w, sprintJump, 60);
		MiniPlayer q = at(2.5, 4.0, 20.5, 270.0F);
		q.tick(w, MiniInput.NONE);
		run(q, w, SPRINT, 60);
		assertTrue(p.x > q.x + 1.0, "sprint jumping " + p.x + " vs sprinting " + q.x);
		assertTrue(p.sprinting);
	}

	@Test
	void wallsBlockMovementOnEveryAxis() {
		MiniWorld w = flat();
		Build.fill(w, 15, 4, 0, 15, 6, 39, MiniBlock.BRICKS);
		Build.fill(w, 0, 4, 25, 39, 6, 25, MiniBlock.GLASS);
		Build.fill(w, 0, 4, 15, 39, 6, 15, MiniBlock.ICE);
		MiniPlayer east = at(12.5, 4.0, 20.5, 270.0F);
		run(east, w, SPRINT, 40);
		assertEquals(15.0 - 0.3, east.x, 1e-6);
		assertTrue(east.horizontalCollision);
		MiniPlayer south = at(10.5, 4.0, 20.5, 0.0F);
		run(south, w, FORWARD, 40);
		assertEquals(25.0 - 0.3, south.z, 1e-6, "glass is solid");
		MiniPlayer north = at(10.5, 4.0, 20.5, 180.0F);
		run(north, w, FORWARD, 40);
		assertEquals(16.0 + 0.3, north.z, 1e-6, "ice is solid");
	}

	@Test
	void slidesAlongWallsWhenWalkingDiagonally() {
		MiniWorld w = flat();
		Build.fill(w, 15, 4, 0, 15, 6, 39, MiniBlock.STONE);
		MiniPlayer p = at(14.0, 4.0, 10.5, 315.0F);
		run(p, w, FORWARD, 20);
		assertEquals(15.0 - 0.3, p.x, 1e-6);
		assertTrue(p.z > 12.0, "kept moving along the wall: " + p.z);
	}

	@Test
	void headBumpsTheCeiling() {
		MiniWorld w = flat();
		Build.fill(w, 0, 6, 0, 39, 6, 39, MiniBlock.STONE);
		MiniPlayer p = at(10.5, 4.0, 10.5, 0.0F);
		p.tick(w, MiniInput.NONE);
		double top = 0;
		for (int i = 0; i < 20; i++) {
			p.tick(w, i == 0 ? JUMP : MiniInput.NONE);
			top = Math.max(top, p.y);
		}
		assertTrue(top <= 6.0 - MiniPlayer.HEIGHT + 1e-6, "head went through the ceiling: " + top);
		assertEquals(4.0, p.y, 1e-9);
	}

	@Test
	void laptopAndWaterAreNotSolid() {
		MiniWorld w = flat();
		w.set(12, 4, 10, MiniBlock.LAPTOP);
		MiniPlayer p = at(10.5, 4.0, 10.5, 270.0F);
		run(p, w, FORWARD, 20);
		assertTrue(p.x > 13.0, "walked through the laptop cell");
	}

	@Test
	void sneakingStopsAtLedges() {
		MiniWorld w = flat();
		Build.fill(w, 15, 0, 0, 39, 3, 39, MiniBlock.AIR);
		Build.fill(w, 15, 0, 0, 39, 1, 39, MiniBlock.STONE);
		MiniPlayer p = at(12.5, 4.0, 10.5, 270.0F);
		p.tick(w, MiniInput.NONE);
		run(p, w, SNEAK_FORWARD, 80);
		assertEquals(4.0, p.y, 1e-9, "did not fall");
		assertTrue(p.x > 14.9 && p.x < 15.3 + 0.05, "stopped at the edge: " + p.x);
		// Without sneaking the same walk drops off the ledge
		MiniPlayer q = at(12.5, 4.0, 10.5, 270.0F);
		run(q, w, FORWARD, 40);
		assertEquals(2.0, q.y, 1e-9);
	}

	@Test
	void sneakingLowersTheEye() {
		MiniWorld w = flat();
		MiniPlayer p = at(10.5, 4.0, 10.5, 0.0F);
		run(p, w, new MiniInput(false, false, false, false, false, false, true), 10);
		assertEquals(MiniPlayer.SNEAK_EYE_HEIGHT, p.eyeHeight(), 1e-3);
		run(p, w, MiniInput.NONE, 10);
		assertEquals(MiniPlayer.EYE_HEIGHT, p.eyeHeight(), 1e-3);
	}

	@Test
	void walkingOffTheEdgeOfTheWorldGivesTheKick() {
		MiniWorld w = flat();
		MiniPlayer p = at(38.5, 4.0, 10.5, 270.0F);
		int ticks = 0;
		while (!p.fellOut() && ticks < 200) {
			p.tick(w, FORWARD);
			ticks++;
		}
		assertTrue(p.fellOut(), "never fell out");
		assertTrue(ticks < 80, "took " + ticks + " ticks");
		assertTrue(p.x > 40.0);
	}

	@Test
	void waterSlowsFallingAndSwimmingRises() {
		MiniWorld w = flat();
		Build.fill(w, 0, 1, 0, 39, 3, 39, MiniBlock.AIR);
		Build.fill(w, 0, 0, 0, 39, 0, 39, MiniBlock.STONE);
		Build.fill(w, 0, 1, 0, 39, 12, 39, MiniBlock.WATER);
		MiniPlayer p = at(10.5, 20.0, 10.5, 0.0F);
		double fastest = 0;
		boolean enteredWater = false;
		for (int i = 0; i < 80; i++) {
			p.tick(w, MiniInput.NONE);
			if (p.inWater) {
				enteredWater = true;
			}
			if (enteredWater && i > 30) {
				fastest = Math.max(fastest, -p.vy);
			}
		}
		assertTrue(enteredWater);
		assertTrue(fastest < 0.1, "sinks slowly in water, vy " + fastest);
		double before = p.y;
		run(p, w, JUMP, 20);
		assertTrue(p.y > before + 1.5, "swims up: " + before + " -> " + p.y);
		assertTrue(p.inWater);
		// Holding jump keeps the swimmer at the surface (bobbing near the top of the water)
		run(p, w, JUMP, 120);
		assertTrue(p.y > 11.0 && p.y < 13.2, "floats at the surface: " + p.y);
	}

	@Test
	void swimmingIntoALedgeClimbsOut() {
		MiniWorld w = flat();
		// A one block deep pool in the floor, from x = 5 to 14
		Build.fill(w, 5, 3, 5, 14, 3, 15, MiniBlock.WATER);
		MiniPlayer p = at(9.5, 3.0, 10.5, 270.0F);
		MiniInput swimForward = new MiniInput(true, false, false, false, true, false, false);
		for (int i = 0; i < 80 && p.x < 15.5; i++) {
			p.tick(w, swimForward);
		}
		run(p, w, MiniInput.NONE, 30);
		assertTrue(p.x > 15.0, "climbed out of the pool: x " + p.x);
		assertEquals(4.0, p.y, 1e-9);
		assertFalse(p.inWater);
	}

	@Test
	void underwaterWallsCannotBeClimbedByBumpingThem() {
		MiniWorld w = new MiniWorld(1, 0L);
		Build.fill(w, 0, 0, 0, 39, 0, 39, MiniBlock.STONE);
		Build.fill(w, 0, 1, 0, 39, 20, 39, MiniBlock.WATER);
		Build.fill(w, 15, 1, 0, 15, 20, 39, MiniBlock.STONE);
		MiniPlayer p = at(13.5, 5.0, 10.5, 270.0F);
		double fastestUp = 0;
		for (int i = 0; i < 40; i++) {
			p.tick(w, FORWARD);
			fastestUp = Math.max(fastestUp, p.vy);
		}
		assertTrue(fastestUp < 0.1, "launched up an underwater wall: vy " + fastestUp);
		assertTrue(p.y < 5.0, "sinks slowly while pushing against the wall");
	}

	@Test
	void interpolationFieldsTrackThePreviousTick() {
		MiniWorld w = flat();
		MiniPlayer p = at(10.5, 4.0, 10.5, 270.0F);
		p.tick(w, MiniInput.NONE);
		run(p, w, FORWARD, 5);
		double x = p.x;
		p.yaw = 280.0F;
		p.tick(w, FORWARD);
		assertEquals(x, p.xo, 1e-12);
		assertEquals(280.0F, p.yawO);
		Camera half = p.eyeCamera(0.5F, 70.0F);
		assertEquals((p.xo + p.x) / 2.0, half.x(), 1e-9);
		assertEquals(p.y + MiniPlayer.EYE_HEIGHT, half.y(), 1e-9);
	}

	@Test
	void eyeCameraInterpolatesYawAcrossTheWrap() {
		MiniPlayer p = new MiniPlayer();
		p.yawO = 350.0F;
		p.yaw = 10.0F;
		assertEquals(360.0F, p.eyeCamera(0.5F, 70.0F).yaw(), 1e-4);
	}

	@Test
	void pickFindsTheFaceTheRayEntered() {
		MiniWorld w = flat();
		w.set(13, 5, 10, MiniBlock.BRICKS);
		w.set(10, 5, 13, MiniBlock.WATER);
		MiniPlayer p = at(10.5, 4.0, 10.5, 270.0F);
		p.pitch = 0.0F;
		p.y = 4.0 - 0.12;
		MiniHit hit = p.pick(w, MiniPlayer.REACH);
		assertNotNull(hit);
		assertEquals(13, hit.x());
		assertEquals(5, hit.y());
		assertSame(Face.WEST, hit.face());
		assertSame(MiniBlock.BRICKS, hit.block());
		assertEquals(12, hit.placeX());
		assertEquals(2.5, hit.distance(), 1e-9);
		// Looking straight down hits the floor's top face
		p.pitch = 90.0F;
		MiniHit down = p.pick(w, MiniPlayer.REACH);
		assertNotNull(down);
		assertSame(Face.UP, down.face());
		assertEquals(3, down.y());
		// Water is ignored: looking south through it reaches nothing within reach
		p.yaw = 0.0F;
		p.pitch = 0.0F;
		assertNull(p.pick(w, 2.0));
		// Too far
		p.yaw = 270.0F;
		assertNull(p.pick(w, 2.0));
	}

	@Test
	void pickHitsTheLaptopFromEverySpawn() {
		for (int depth = 1; depth <= 4; depth++) {
			for (int i = 0; i < 100; i++) {
				MiniWorld w = WorldGen.generate(WorldGenTest.seed(i), depth);
				MiniPlayer p = new MiniPlayer();
				p.reset(w);
				MiniHit hit = p.pick(w, MiniPlayer.REACH);
				assertNotNull(hit, "nothing hit at depth " + depth + " seed " + WorldGenTest.seed(i));
				assertTrue(hit.isLaptop(), "hit " + hit.block() + " at depth " + depth);
				assertSame(w.laptopFacing, hit.face(), "ray enters through the screen side");
			}
		}
	}

	@Test
	void spawnIsStableAndTheIdleAvatarStaysPut() {
		for (int depth = 1; depth <= 4; depth++) {
			MiniWorld w = WorldGen.generate(77L, depth);
			MiniPlayer p = new MiniPlayer();
			p.reset(w);
			assertTrue(p.onGround);
			run(p, w, MiniInput.NONE, 40);
			assertEquals(w.spawnX, p.x, 1e-9);
			assertEquals(w.spawnY, p.y, 1e-9);
			assertEquals(w.spawnZ, p.z, 1e-9);
		}
	}

	@Test
	void walkingFromTheSpawnReachesTheDesk() {
		for (int depth = 1; depth <= 4; depth++) {
			MiniWorld w = WorldGen.generate(5L, depth);
			MiniPlayer p = new MiniPlayer();
			p.reset(w);
			run(p, w, FORWARD, 60);
			double dx = p.x - (w.laptopX + 0.5);
			double dz = p.z - (w.laptopZ + 0.5);
			assertTrue(Math.hypot(dx, dz) < 1.0, "stopped next to the desk at depth " + depth);
			assertEquals(w.spawnY, p.y, 1e-9);
		}
	}

	@Test
	void canPlaceAtRejectsCellsInsideThePlayer() {
		MiniPlayer p = at(10.5, 4.0, 10.5, 0.0F);
		assertFalse(p.canPlaceAt(10, 4, 10));
		assertFalse(p.canPlaceAt(10, 5, 10));
		assertTrue(p.canPlaceAt(10, 6, 10));
		assertTrue(p.canPlaceAt(10, 3, 10));
		assertTrue(p.canPlaceAt(11, 4, 10));
		// Standing across a block boundary blocks both cells
		MiniPlayer q = at(11.1, 4.0, 10.5, 0.0F);
		assertFalse(q.canPlaceAt(10, 4, 10));
		assertFalse(q.canPlaceAt(11, 4, 10));
		assertTrue(q.canPlaceAt(12, 4, 10));
		// Exactly touching does not count as overlapping
		MiniPlayer r = at(10.3, 4.0, 10.5, 0.0F);
		assertTrue(r.canPlaceAt(9, 4, 10));
	}

	@Test
	void pitchIsClamped() {
		MiniWorld w = flat();
		MiniPlayer p = at(10.5, 4.0, 10.5, 0.0F);
		p.pitch = 120.0F;
		p.tick(w, MiniInput.NONE);
		assertEquals(90.0F, p.pitch);
	}
}
