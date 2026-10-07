package dev.visceral.client.fx;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.visceral.VisceralConfig;
import dev.visceral.blood.BloodType;
import dev.visceral.client.render.Atlas;
import dev.visceral.client.render.PolygonClipper;
import dev.visceral.client.render.QuadBatch;
import dev.visceral.client.render.VisceralRenderTypes;
import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.joml.Vector3f;

/**
 * Blood on blocks: splats, directional spatter, drops, runs on walls and pools. Every decal is
 * clipped against the real collision boxes of the blocks it lies on, so blood never hangs over
 * ledges, wraps nicely onto slabs and stairs, and disappears with the block it was on.
 */
public final class BloodDecals {
	public static final int SPLAT = 0;
	public static final int SPATTER = 1;
	public static final int DROP = 2;
	public static final int POOL = 3;
	public static final int TRAIL = 4;
	public static final int FOOTPRINT = 5;

	private static final float LIFT = 0.0025F;
	private static final double PLANE_TOLERANCE = 0.012;
	private static final double RENDER_DISTANCE = 96.0;

	private static final ArrayDeque<Decal> DECALS = new ArrayDeque<>();
	private static final Long2ObjectMap<List<Decal>> INDEX = new Long2ObjectOpenHashMap<>();
	private static final RandomSource RANDOM = RandomSource.create();
	private static long clock;

	private BloodDecals() {
	}

	public static final class Decal {
		final int kind;
		final Direction face;
		final double cx;
		final double cy;
		final double cz;
		final BloodType blood;
		int cell;
		final float angle;
		final float stretch;
		float radius;
		float target;
		long born;
		int lifetime;
		float wash;
		float opacity = 1.0F;
		boolean dirty = true;
		boolean removed;
		final List<Piece> pieces = new ArrayList<>(2);
		final long indexKey;

		Decal(int kind, Direction face, double cx, double cy, double cz, float radius, float angle, float stretch, int cell, BloodType blood, int lifetime) {
			this.kind = kind;
			this.face = face;
			this.cx = cx;
			this.cy = cy;
			this.cz = cz;
			this.radius = radius;
			this.target = radius;
			this.angle = angle;
			this.stretch = stretch;
			this.cell = cell;
			this.blood = blood;
			this.lifetime = lifetime;
			this.born = clock;
			this.indexKey = BlockPos.asLong(Mth.floor(cx), Mth.floor(cy), Mth.floor(cz)) * 31 + face.ordinal();
		}

		public double x() {
			return this.cx;
		}

		public double y() {
			return this.cy;
		}

		public double z() {
			return this.cz;
		}

		public float radius() {
			return this.radius;
		}
	}

	/** A clipped part of a decal lying on one collision box. Vertices are x, y, z (relative to decal centre), u, v. */
	record Piece(BlockPos support, BlockState state, BlockPos lightPos, float[] vertices, int[] light) {
	}

	// ------------------------------------------------------------------ spawning

	public static int count() {
		return DECALS.size();
	}

	public static int count(int kind) {
		int count = 0;
		for (Decal decal : DECALS) {
			if (decal.kind == kind) {
				count++;
			}
		}
		return count;
	}

	public static void clear() {
		DECALS.clear();
		INDEX.clear();
	}

	/**
	 * Drops a stain where a blood droplet hit a block.
	 *
	 * @param velocity impact velocity, blocks per tick
	 * @param size     droplet radius, blocks
	 */
	public static void impact(ClientLevel level, Vec3 hit, Direction face, Vec3 velocity, float size, BloodType blood) {
		VisceralConfig config = VisceralConfig.get();
		if (!config.worldStains || !blood.stains()) {
			return;
		}
		double speed = velocity.length();
		Vec3 normal = Vec3.atLowerCornerOf(face.getUnitVec3i());
		double normalSpeed = Math.abs(velocity.dot(normal));
		Vec3 tangent = velocity.subtract(normal.scale(velocity.dot(normal)));
		double tangentSpeed = tangent.length();

		// Drops merge into nearby fresh blood: this is how drip trails thicken into pools.
		if (speed < 0.35 && tryMerge(hit, face, size * size * 1.6F)) {
			return;
		}

		int kind;
		int cell;
		float radius;
		float stretch = 1.0F;
		float angle;
		if (tangentSpeed > 0.12 && tangentSpeed > normalSpeed * 0.9) {
			kind = SPATTER;
			cell = Atlas.SPATTER_FIRST + RANDOM.nextInt(Atlas.SPATTER_COUNT);
			radius = (float) Mth.clamp(size * (2.0 + speed * 4.0), 0.04, 0.45);
			stretch = (float) Mth.clamp(0.45 + normalSpeed / Math.max(tangentSpeed, 1.0E-3) * 0.4, 0.3, 0.8);
			angle = inPlaneAngle(face, tangent);
		} else if (speed < 0.2 || size < 0.03F) {
			kind = DROP;
			cell = RANDOM.nextFloat() < 0.6F ? Atlas.DROP : Atlas.DROP_CROWN;
			radius = (float) Mth.clamp(size * (1.6 + speed * 3.0), 0.025, 0.18);
			angle = RANDOM.nextFloat() * Mth.TWO_PI;
		} else {
			kind = SPLAT;
			cell = Atlas.SPLAT_FIRST + RANDOM.nextInt(Atlas.SPLAT_COUNT);
			radius = (float) Mth.clamp(size * (2.2 + speed * 4.5), 0.05, 0.6);
			angle = RANDOM.nextFloat() * Mth.TWO_PI;
		}
		add(level, new Decal(kind, face, hit.x, hit.y, hit.z, radius, angle, stretch, cell, blood, lifetimeTicks(config)));

		// Heavy hits on walls start to run downwards.
		if (face.getAxis().isHorizontal() && size > 0.04F && speed > 0.2 && RANDOM.nextFloat() < 0.35F) {
			float runRadius = radius * (0.7F + RANDOM.nextFloat() * 0.5F);
			Vec3 runCenter = hit.add(0.0, -runRadius * 1.4, 0.0);
			add(level, new Decal(TRAIL, face, runCenter.x, runCenter.y, runCenter.z, runRadius * 0.55F, 0.0F, 2.6F, Atlas.TRAIL, blood, lifetimeTicks(config)));
		}
	}

	/** Large directional splash, e.g. on the wall behind a creature that was just slashed. */
	public static void spatter(ClientLevel level, Vec3 hit, Direction face, Vec3 direction, float radius, BloodType blood) {
		VisceralConfig config = VisceralConfig.get();
		if (!config.worldStains || !blood.stains()) {
			return;
		}
		Vec3 normal = Vec3.atLowerCornerOf(face.getUnitVec3i());
		Vec3 tangent = direction.subtract(normal.scale(direction.dot(normal)));
		float angle = tangent.lengthSqr() > 1.0E-4 ? inPlaneAngle(face, tangent) : RANDOM.nextFloat() * Mth.TWO_PI;
		float stretch = tangent.lengthSqr() > 0.25 ? 0.55F : 0.9F;
		int cell = stretch < 0.8F ? Atlas.SPATTER_FIRST + RANDOM.nextInt(Atlas.SPATTER_COUNT) : Atlas.SPLAT_FIRST + RANDOM.nextInt(Atlas.SPLAT_COUNT);
		add(level, new Decal(stretch < 0.8F ? SPATTER : SPLAT, face, hit.x, hit.y, hit.z, radius, angle, stretch, cell, blood, lifetimeTicks(config)));
		if (face.getAxis().isHorizontal() && radius > 0.15F) {
			for (int i = 0; i < 1 + RANDOM.nextInt(3); i++) {
				float runRadius = radius * (0.2F + RANDOM.nextFloat() * 0.25F);
				double offset = (RANDOM.nextFloat() - 0.5F) * radius;
				Vec3 along = face.getAxis() == Direction.Axis.X ? new Vec3(0, 0, offset) : new Vec3(offset, 0, 0);
				Vec3 runCenter = hit.add(along).add(0.0, -runRadius * 2.4, 0.0);
				add(level, new Decal(TRAIL, face, runCenter.x, runCenter.y, runCenter.z, runRadius, 0.0F, 3.2F, Atlas.TRAIL, blood, lifetimeTicks(config)));
			}
		}
	}

	/**
	 * Grows (or starts) a pool on the floor around {@code floor}. Used by bleeding corpses.
	 *
	 * @return the pool, or null when there is no floor
	 */
	public static Decal feedPool(ClientLevel level, Vec3 floor, BloodType blood, float growth, float maxRadius) {
		VisceralConfig config = VisceralConfig.get();
		if (!config.bloodPools || !config.worldStains || !blood.stains()) {
			return null;
		}
		Decal best = null;
		double bestDistance = Double.MAX_VALUE;
		for (Decal decal : nearby(floor, Direction.UP)) {
			if (decal.kind != POOL || decal.removed || Math.abs(decal.cy - floor.y) > 0.05) {
				continue;
			}
			double distance = Mth.square(decal.cx - floor.x) + Mth.square(decal.cz - floor.z);
			if (distance < Mth.square(decal.radius * 0.8 + 0.3) && distance < bestDistance) {
				best = decal;
				bestDistance = distance;
			}
		}
		if (best == null) {
			best = new Decal(POOL, Direction.UP, floor.x, floor.y, floor.z, 0.06F, RANDOM.nextFloat() * Mth.TWO_PI, 1.0F,
				Atlas.POOL_FIRST + RANDOM.nextInt(Atlas.POOL_COUNT), blood, lifetimeTicks(config) * 3 / 2);
			add(level, best);
		}
		best.target = Math.min(maxRadius, Math.max(best.target, best.radius) + growth);
		best.born = Math.max(best.born, clock - 200);
		return best;
	}

	/** A bloody footprint pointing along {@code yawRadians} (0 = towards +x). */
	public static void footprint(ClientLevel level, Vec3 floor, float yawRadians, float size, BloodType blood, float opacity) {
		VisceralConfig config = VisceralConfig.get();
		if (!config.worldStains || !blood.stains()) {
			return;
		}
		Decal decal = new Decal(FOOTPRINT, Direction.UP, floor.x, floor.y, floor.z, size, yawRadians, 0.62F, Atlas.FOOTPRINT, blood, lifetimeTicks(config) / 2);
		decal.opacity = opacity;
		add(level, decal);
	}

	/** Fresh, wet blood under {@code feet} that something walking through would pick up, or null. */
	public static BloodType wetBloodAt(Vec3 feet) {
		for (Decal decal : nearby(feet, Direction.UP)) {
			if (decal.removed || decal.kind == FOOTPRINT || decal.kind == TRAIL || clock - decal.born > 1600 || Math.abs(decal.cy - feet.y) > 0.08) {
				continue;
			}
			if (decal.radius < 0.12F && decal.kind != POOL) {
				continue;
			}
			double distanceSq = Mth.square(decal.cx - feet.x) + Mth.square(decal.cz - feet.z);
			if (distanceSq < Mth.square(decal.radius * 0.75)) {
				return decal.blood;
			}
		}
		return null;
	}

	private static boolean tryMerge(Vec3 hit, Direction face, float area) {
		for (Decal decal : nearby(hit, face)) {
			if (decal.removed || decal.face != face || decal.kind == TRAIL || decal.kind == SPATTER || decal.kind == FOOTPRINT || clock - decal.born > 1200) {
				continue;
			}
			double plane = coordinate(face.getAxis(), hit);
			if (Math.abs(coordinate(face.getAxis(), decal.cx, decal.cy, decal.cz) - plane) > 0.02) {
				continue;
			}
			double distanceSq = hit.distanceToSqr(decal.cx, decal.cy, decal.cz);
			if (distanceSq < Mth.square(decal.radius * 0.6 + 0.06)) {
				float max = decal.kind == POOL ? 1.6F : 0.55F;
				decal.target = Math.min(max, (float) Math.sqrt(decal.target * decal.target + area));
				decal.born = Math.max(decal.born, clock - 400);
				if (decal.kind != POOL && decal.target > 0.22F && decal.cell < Atlas.POOL_FIRST) {
					// A puddle that collected enough drops looks like a small pool.
					decal.cell = Atlas.POOL_FIRST + (int) (decal.indexKey & 1);
				}
				return true;
			}
		}
		return false;
	}

	private static List<Decal> nearby(Vec3 pos, Direction face) {
		List<Decal> result = new ArrayList<>();
		int bx = Mth.floor(pos.x);
		int by = Mth.floor(pos.y);
		int bz = Mth.floor(pos.z);
		for (int dx = -1; dx <= 1; dx++) {
			for (int dy = -1; dy <= 1; dy++) {
				for (int dz = -1; dz <= 1; dz++) {
					List<Decal> list = INDEX.get(BlockPos.asLong(bx + dx, by + dy, bz + dz) * 31 + face.ordinal());
					if (list != null) {
						result.addAll(list);
					}
				}
			}
		}
		return result;
	}

	private static void add(ClientLevel level, Decal decal) {
		int max = VisceralConfig.get().maxStains;
		if (max <= 0) {
			return;
		}
		decal.dirty = true;
		DECALS.addLast(decal);
		INDEX.computeIfAbsent(decal.indexKey, key -> new ArrayList<>(2)).add(decal);
		while (DECALS.size() > max) {
			remove(DECALS.pollFirst());
		}
	}

	private static void remove(Decal decal) {
		if (decal == null) {
			return;
		}
		decal.removed = true;
		List<Decal> list = INDEX.get(decal.indexKey);
		if (list != null) {
			list.remove(decal);
			if (list.isEmpty()) {
				INDEX.remove(decal.indexKey);
			}
		}
	}

	private static int lifetimeTicks(VisceralConfig config) {
		return config.stainLifetimeSeconds * 20;
	}

	// ------------------------------------------------------------------ simulation

	public static void tick(ClientLevel level) {
		clock++;
		boolean rainWash = VisceralConfig.get().rainWashesBlood && level.isRaining();
		Iterator<Decal> iterator = DECALS.iterator();
		int index = 0;
		while (iterator.hasNext()) {
			Decal decal = iterator.next();
			index++;
			long age = clock - decal.born;
			if (age > decal.lifetime || decal.wash >= 1.0F) {
				iterator.remove();
				remove(decal);
				continue;
			}
			if (decal.radius < decal.target) {
				decal.radius = Math.min(decal.target, decal.radius + Math.max(0.002F, (decal.target - decal.radius) * 0.04F));
				if ((clock + index) % 4 == 0) {
					decal.dirty = true;
				}
			}
			if (decal.dirty) {
				rebuild(level, decal);
				if (decal.pieces.isEmpty()) {
					iterator.remove();
					remove(decal);
					continue;
				}
			}
			// Spread validation over time: blocks changing under the blood, water, rain.
			if ((clock + index) % 20 == 0) {
				for (Piece piece : decal.pieces) {
					if (level.getBlockState(piece.support) != piece.state) {
						decal.dirty = true;
						break;
					}
				}
				BlockPos front = BlockPos.containing(decal.cx, decal.cy, decal.cz).relative(decal.face, decal.face.getAxisDirection() == Direction.AxisDirection.POSITIVE ? 0 : 1);
				if (level.getFluidState(front).is(FluidTags.WATER)) {
					decal.wash += 0.25F;
				} else if (rainWash && level.isRainingAt(front.above(decal.face == Direction.UP ? 0 : 1))) {
					decal.wash += 0.012F;
				}
				for (Piece piece : decal.pieces) {
					piece.light[0] = LevelRenderer.getLightColor(level, piece.lightPos);
				}
			}
		}
	}

	private static void rebuild(ClientLevel level, Decal decal) {
		decal.dirty = false;
		decal.pieces.clear();
		Direction face = decal.face;
		Direction.Axis axis = face.getAxis();
		int sign = face.getAxisDirection().getStep();
		Vec3 center = new Vec3(decal.cx, decal.cy, decal.cz);
		double plane = coordinate(axis, center);

		Vec3 ep = inPlaneP(face);
		Vec3 eq = inPlaneQ(face);
		float cos = Mth.cos(decal.angle);
		float sin = Mth.sin(decal.angle);
		Vec3 uAxis = ep.scale(cos).add(eq.scale(sin));
		Vec3 vAxis = ep.scale(-sin).add(eq.scale(cos));
		double halfU = decal.radius;
		double halfV = decal.radius * decal.stretch;
		double extent = Math.sqrt(halfU * halfU + halfV * halfV);

		int supportCoord = Mth.floor(plane - sign * 0.001);
		AABB area = new AABB(center.subtract(extent, extent, extent), center.add(extent, extent, extent));
		int minX = axis == Direction.Axis.X ? supportCoord : Mth.floor(area.minX);
		int maxX = axis == Direction.Axis.X ? supportCoord : Mth.floor(area.maxX);
		int minY = axis == Direction.Axis.Y ? supportCoord : Mth.floor(area.minY);
		int maxY = axis == Direction.Axis.Y ? supportCoord : Mth.floor(area.maxY);
		int minZ = axis == Direction.Axis.Z ? supportCoord : Mth.floor(area.minZ);
		int maxZ = axis == Direction.Axis.Z ? supportCoord : Mth.floor(area.maxZ);

		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int x = minX; x <= maxX; x++) {
			for (int y = minY; y <= maxY; y++) {
				for (int z = minZ; z <= maxZ; z++) {
					pos.set(x, y, z);
					BlockState state = level.getBlockState(pos);
					VoxelShape shape = state.getCollisionShape(level, pos);
					if (shape.isEmpty()) {
						continue;
					}
					BlockPos front = pos.relative(face);
					BlockState frontState = level.getBlockState(front);
					if (frontState.isCollisionShapeFullBlock(level, front)) {
						continue;
					}
					for (AABB box : shape.toAabbs()) {
						AABB world = box.move(x, y, z);
						double faceCoord = sign > 0 ? world.max(axis) : world.min(axis);
						if (Math.abs(faceCoord - plane) > PLANE_TOLERANCE) {
							continue;
						}
						Piece piece = clipToBox(decal, world, axis, center, uAxis, vAxis, halfU, halfV, face, pos.immutable(), state, level);
						if (piece != null) {
							decal.pieces.add(piece);
						}
					}
				}
			}
		}
	}

	private static Piece clipToBox(Decal decal, AABB box, Direction.Axis axis, Vec3 center, Vec3 uAxis, Vec3 vAxis, double halfU, double halfV, Direction face, BlockPos support, BlockState state, ClientLevel level) {
		Direction.Axis a1 = axis == Direction.Axis.X ? Direction.Axis.Y : Direction.Axis.X;
		Direction.Axis a2 = axis == Direction.Axis.Z ? Direction.Axis.Y : Direction.Axis.Z;
		double faceCoord = coordinate(axis, center);
		Vec3[] corners = {
			point(axis, faceCoord, a1, box.min(a1), a2, box.min(a2)),
			point(axis, faceCoord, a1, box.max(a1), a2, box.min(a2)),
			point(axis, faceCoord, a1, box.max(a1), a2, box.max(a2)),
			point(axis, faceCoord, a1, box.min(a1), a2, box.max(a2))
		};
		float[] qx = new float[4];
		float[] qy = new float[4];
		for (int i = 0; i < 4; i++) {
			Vec3 rel = corners[i].subtract(center);
			qx[i] = (float) (rel.dot(uAxis) / halfU);
			qy[i] = (float) (rel.dot(vAxis) / halfV);
		}
		float[] poly = PolygonClipper.clipSquare(qx, qy);
		if (poly == null) {
			return null;
		}
		int n = poly.length / 2;
		float[] vertices = new float[n * 5];
		Vec3 lift = Vec3.atLowerCornerOf(face.getUnitVec3i()).scale(LIFT);
		for (int i = 0; i < n; i++) {
			float x = poly[i * 2];
			float y = poly[i * 2 + 1];
			Vec3 p = uAxis.scale(halfU * x).add(vAxis.scale(halfV * y)).add(lift);
			vertices[i * 5] = (float) p.x;
			vertices[i * 5 + 1] = (float) p.y;
			vertices[i * 5 + 2] = (float) p.z;
			vertices[i * 5 + 3] = (x + 1.0F) * 0.5F;
			vertices[i * 5 + 4] = (y + 1.0F) * 0.5F;
		}
		BlockPos lightPos = support.relative(face);
		return new Piece(support, state, lightPos, vertices, new int[] {LevelRenderer.getLightColor(level, lightPos)});
	}

	// ------------------------------------------------------------------ rendering

	public static void submit(SubmitNodeCollector collector, Vec3 camera, Frustum frustum) {
		if (DECALS.isEmpty()) {
			return;
		}
		QuadBatch lit = new QuadBatch(DECALS.size() * 4);
		QuadBatch glowing = null;
		double maxDistanceSq = RENDER_DISTANCE * RENDER_DISTANCE;
		for (Decal decal : DECALS) {
			if (decal.pieces.isEmpty()) {
				continue;
			}
			double dx = decal.cx - camera.x;
			double dy = decal.cy - camera.y;
			double dz = decal.cz - camera.z;
			if (dx * dx + dy * dy + dz * dz > maxDistanceSq) {
				continue;
			}
			double r = decal.radius * Math.max(1.0F, decal.stretch) * 1.5;
			if (frustum != null && !frustum.isVisible(new AABB(decal.cx - r, decal.cy - r, decal.cz - r, decal.cx + r, decal.cy + r, decal.cz + r))) {
				continue;
			}
			long age = clock - decal.born;
			int color = color(decal, age);
			if ((color >>> 24) == 0) {
				continue;
			}
			QuadBatch batch = lit;
			if (decal.blood.glows() && age < 2400) {
				if (glowing == null) {
					glowing = new QuadBatch(64);
				}
				batch = glowing;
			}
			Vector3f normal = new Vector3f(decal.face.getUnitVec3i().getX(), decal.face.getUnitVec3i().getY(), decal.face.getUnitVec3i().getZ());
			for (Piece piece : decal.pieces) {
				batch.polygon(piece.vertices, 5, (float) dx, (float) dy, (float) dz, decal.cell, color, piece.light[0], normal);
			}
		}
		PoseStack identity = new PoseStack();
		if (lit.vertexCount() > 0) {
			collector.submitCustomGeometry(identity, VisceralRenderTypes.BLOOD, lit::emit);
		}
		if (glowing != null && glowing.vertexCount() > 0) {
			collector.submitCustomGeometry(identity, VisceralRenderTypes.GLOWING, glowing::emit);
		}
	}

	private static int color(Decal decal, long age) {
		float dryTime = decal.kind == POOL ? 4800.0F : 2400.0F;
		float dryness = Mth.clamp(age / dryTime, 0.0F, 1.0F);
		int rgb = BloodType.lerpRgb(decal.blood.fresh, decal.blood.dried, (float) Math.sqrt(dryness));
		float alpha = (decal.kind == POOL ? 0.94F : decal.kind == TRAIL ? 0.85F : 0.92F) * decal.opacity;
		float fadeStart = decal.lifetime * 0.85F;
		if (age > fadeStart) {
			alpha *= 1.0F - (age - fadeStart) / (decal.lifetime - fadeStart);
		}
		alpha *= 1.0F - Mth.clamp(decal.wash, 0.0F, 1.0F);
		// Fresh blood grows in quickly instead of popping.
		alpha *= Mth.clamp(age / 3.0F + 0.35F, 0.0F, 1.0F);
		return ARGB.color(Math.round(Mth.clamp(alpha, 0.0F, 1.0F) * 255.0F), rgb);
	}

	// ------------------------------------------------------------------ helpers

	private static Vec3 inPlaneP(Direction face) {
		return face.getAxis() == Direction.Axis.X ? new Vec3(0, 0, 1) : new Vec3(1, 0, 0);
	}

	/** Second in-plane axis; on walls this points down so runs drip downwards. */
	private static Vec3 inPlaneQ(Direction face) {
		return face.getAxis() == Direction.Axis.Y ? new Vec3(0, 0, 1) : new Vec3(0, -1, 0);
	}

	private static float inPlaneAngle(Direction face, Vec3 tangent) {
		Vec3 p = inPlaneP(face);
		Vec3 q = inPlaneQ(face);
		return (float) Math.atan2(tangent.dot(q), tangent.dot(p));
	}

	private static double coordinate(Direction.Axis axis, Vec3 v) {
		return axis.choose(v.x, v.y, v.z);
	}

	private static double coordinate(Direction.Axis axis, double x, double y, double z) {
		return axis.choose(x, y, z);
	}

	private static Vec3 point(Direction.Axis axis, double coord, Direction.Axis a1, double c1, Direction.Axis a2, double c2) {
		double x = axis == Direction.Axis.X ? coord : a1 == Direction.Axis.X ? c1 : c2;
		double y = axis == Direction.Axis.Y ? coord : a1 == Direction.Axis.Y ? c1 : c2;
		double z = axis == Direction.Axis.Z ? coord : a1 == Direction.Axis.Z ? c1 : c2;
		return new Vec3(x, y, z);
	}
}
