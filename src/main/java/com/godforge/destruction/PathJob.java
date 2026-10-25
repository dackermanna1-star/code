package com.godforge.destruction;

import java.util.ArrayDeque;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.phys.Vec3;

/**
 * Erases every block within {@code radius} of a chain of line segments (a "capsule" sweep).
 * Projectiles append segments as they fly; the job trails behind them, so it can keep up with
 * orbs moving thousands of blocks per second without stalling the tick.
 */
public final class PathJob extends BlockJob {
	private static final int IDLE_TIMEOUT_TICKS = 100;

	private record Segment(Vec3 a, Vec3 b, double radius, Palette lining) {
	}

	private final ArrayDeque<Segment> segments = new ArrayDeque<>();
	private final BlockOps.ChunkCache cache;
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
	private final long seed;
	private boolean sealed;
	private int maxQueued = 4096;
	private long lastAdded;

	private Segment current;
	private int axis;
	private int slice;
	private int sliceEnd;
	private int u;
	private int v;
	private int uMin;
	private int uMax;
	private int vMin;
	private int vMax;

	public PathJob(ServerLevel level, long seed) {
		super(level);
		this.cache = new BlockOps.ChunkCache(level);
		this.seed = seed;
		this.lastAdded = level.getGameTime();
	}

	public void add(Vec3 a, Vec3 b, double radius, Palette lining) {
		this.lastAdded = this.level.getGameTime();
		if (this.segments.size() < this.maxQueued) {
			this.segments.add(new Segment(a, b, Math.max(0.5, radius), lining));
		}
	}

	/** No more segments will be appended; the job finishes once the queue is drained. */
	public void seal() {
		this.sealed = true;
	}

	@Override
	public void cancel() {
		this.segments.clear();
		super.cancel();
	}

	private boolean nextSegment() {
		this.current = this.segments.poll();
		if (this.current == null) {
			return false;
		}
		Vec3 d = this.current.b.subtract(this.current.a);
		double ax = Math.abs(d.x);
		double ay = Math.abs(d.y);
		double az = Math.abs(d.z);
		this.axis = ax >= ay && ax >= az ? 0 : (ay >= az ? 1 : 2);
		double r = this.current.radius;
		double lo = Math.min(comp(this.current.a, this.axis), comp(this.current.b, this.axis)) - r;
		double hi = Math.max(comp(this.current.a, this.axis), comp(this.current.b, this.axis)) + r;
		this.slice = Mth.floor(lo);
		this.sliceEnd = Mth.floor(hi);
		this.beginSlice();
		return true;
	}

	private static double comp(Vec3 v, int axis) {
		return axis == 0 ? v.x : (axis == 1 ? v.y : v.z);
	}

	private void beginSlice() {
		Segment s = this.current;
		double c = this.slice + 0.5;
		double a0 = comp(s.a, this.axis);
		double a1 = comp(s.b, this.axis);
		double t = Math.abs(a1 - a0) < 1.0E-6 ? 0.0 : Mth.clamp((c - a0) / (a1 - a0), 0.0, 1.0);
		Vec3 p = s.a.add(s.b.subtract(s.a).scale(t));
		int ua = (this.axis + 1) % 3;
		int va = (this.axis + 2) % 3;
		double pad = s.radius * 2.0 + 1.0;
		this.uMin = Mth.floor(comp(p, ua) - pad);
		this.uMax = Mth.floor(comp(p, ua) + pad);
		this.vMin = Mth.floor(comp(p, va) - pad);
		this.vMax = Mth.floor(comp(p, va) + pad);
		this.u = this.uMin;
		this.v = this.vMin;
	}

	@Override
	protected int run(int budget, long deadlineNanos) {
		int ops = 0;
		int checks = 0;
		while (ops < budget) {
			if (this.current == null && !this.nextSegment()) {
				// sealed, or abandoned by an owner that vanished without sealing (e.g. its chunk unloaded)
				if (this.sealed || this.level.getGameTime() - this.lastAdded > IDLE_TIMEOUT_TICKS) {
					this.finish();
				}
				return ops;
			}
			if ((++checks & 511) == 0 && System.nanoTime() > deadlineNanos) {
				return ops;
			}
			Segment s = this.current;
			int x;
			int y;
			int z;
			switch (this.axis) {
				case 0 -> {
					x = this.slice;
					y = this.u;
					z = this.v;
				}
				case 1 -> {
					y = this.slice;
					z = this.u;
					x = this.v;
				}
				default -> {
					z = this.slice;
					x = this.u;
					y = this.v;
				}
			}
			if (++this.v > this.vMax) {
				this.v = this.vMin;
				if (++this.u > this.uMax) {
					if (++this.slice > this.sliceEnd) {
						this.current = null;
					} else {
						this.beginSlice();
					}
				}
			}
			double distSq = distSqToSegment(x + 0.5, y + 0.5, z + 0.5, s.a, s.b);
			double r = s.radius;
			if (distSq > r * r) {
				continue;
			}
			if (!BlockOps.inBuildHeight(this.level, y)) {
				continue;
			}
			LevelChunk chunk = this.cache.chunk(x, z);
			if (chunk == null) {
				continue;
			}
			this.cursor.set(x, y, z);
			BlockState state = chunk.getBlockState(this.cursor);
			if (state.isAir() || BlockOps.isProtected(this.level, this.cursor, state)) {
				continue;
			}
			if (s.lining != Palette.NONE && Math.sqrt(distSq) > r - 1.2 && state.isSolid()) {
				BlockState lined = s.lining.pick(state, this.cursor, this.seed);
				if (lined != null) {
					BlockOps.set(this.level, this.cursor, lined);
				}
			} else {
				BlockOps.erase(this.level, this.cursor);
			}
			ops++;
		}
		return ops;
	}

	static double distSqToSegment(double px, double py, double pz, Vec3 a, Vec3 b) {
		double dx = b.x - a.x;
		double dy = b.y - a.y;
		double dz = b.z - a.z;
		double len = dx * dx + dy * dy + dz * dz;
		double t = len < 1.0E-9 ? 0.0 : ((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / len;
		t = Mth.clamp(t, 0.0, 1.0);
		double qx = a.x + dx * t - px;
		double qy = a.y + dy * t - py;
		double qz = a.z + dz * t - pz;
		return qx * qx + qy * qy + qz * qz;
	}
}
