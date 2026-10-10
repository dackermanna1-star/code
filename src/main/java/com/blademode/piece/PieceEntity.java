package com.blademode.piece;

import com.blademode.BladeConfig;
import com.blademode.geom.BlockGeometry;
import com.blademode.geom.ConvexPart;
import com.blademode.geom.PartShape;
import com.blademode.geom.Plane;
import com.blademode.registry.ModEntities;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializer;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.ExtraCodecs;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.InterpolationHandler;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.joml.Matrix3d;
import org.joml.Quaterniond;
import org.joml.Quaternionf;
import org.joml.Quaternionfc;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/**
 * A rigid body made of (possibly cut) blocks. The entity position is the centre of mass; the
 * orientation is a quaternion. Physics runs on the server in {@link PhysicsWorld}; clients only
 * interpolate the synced transform.
 */
public class PieceEntity extends Entity {
	public static final EntityDataSerializer<PieceData> PIECE_DATA_SERIALIZER = EntityDataSerializer.forValueType(PieceData.STREAM_CODEC);
	private static final EntityDataAccessor<PieceData> DATA_PIECE = SynchedEntityData.defineId(PieceEntity.class, PIECE_DATA_SERIALIZER);
	private static final EntityDataAccessor<Quaternionfc> DATA_ROT = SynchedEntityData.defineId(PieceEntity.class, EntityDataSerializers.QUATERNION);
	private static final EntityDataAccessor<Long> DATA_CUT_TIME = SynchedEntityData.defineId(PieceEntity.class, EntityDataSerializers.LONG);
	/** Resting pieces are solid for other entities (players can stand on a fallen trunk). */
	private static final EntityDataAccessor<Boolean> DATA_RESTING = SynchedEntityData.defineId(PieceEntity.class, EntityDataSerializers.BOOLEAN);
	private static final double COLLISION_VOXEL = 0.25;

	// --- Server-side physics state ------------------------------------------------------------
	public final Quaterniond rot = new Quaterniond();
	public final Vector3d vel = new Vector3d();
	public final Vector3d angVel = new Vector3d();
	public boolean sleeping;
	/** Consecutive ticks spent nearly motionless. */
	public int slowTicks;
	/** Ticks spent asleep. */
	public int restTicks;
	private @Nullable PieceBody body;
	private @Nullable PieceData bodyData;
	private final Quaternionf lastSentRot = new Quaternionf();

	// --- Client-side interpolation ------------------------------------------------------------
	public final Quaternionf renderRot = new Quaternionf();
	public final Quaternionf renderRotOld = new Quaternionf();
	/** Latest rotation received from the server; applied on the next client tick together with the position. */
	private final Quaternionf rotTarget = new Quaternionf();
	private boolean renderRotInit;
	/** Buffers server positions by one tick so rendering can interpolate smoothly between updates. */
	private final InterpolationHandler interpolation = new InterpolationHandler(this, 1);
	/** Owned by the client renderer. */
	public @Nullable Object renderCache;

	public PieceEntity(EntityType<? extends PieceEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
	}

	/**
	 * Creates (but does not add) a piece from blocks laid out on a grid whose origin is at
	 * {@code gridOrigin} in the world and which is rotated by {@code rotation}.
	 * The new piece inherits the rigid motion ({@code vel}, {@code angVel} about {@code refPoint}).
	 */
	public static @Nullable PieceEntity create(ServerLevel level, List<PieceBlock> blocks, Vector3d gridOrigin, Quaterniond rotation,
		Vector3d vel, Vector3d angVel, Vector3d refPoint) {
		if (blocks.isEmpty()) {
			return null;
		}
		Vector3d com = PieceBody.centerOfMass(blocks);
		PieceData data = new PieceData(blocks, new Vec3(-com.x, -com.y, -com.z));
		PieceEntity piece = new PieceEntity(ModEntities.PIECE, level);
		piece.rot.set(rotation);
		piece.entityData.set(DATA_ROT, new Quaternionf((float) rotation.x, (float) rotation.y, (float) rotation.z, (float) rotation.w));
		piece.setPieceData(data);
		Vector3d pos = rotation.transform(new Vector3d(com)).add(gridOrigin);
		piece.setPos(pos.x, pos.y, pos.z);
		Vector3d r = new Vector3d(pos).sub(refPoint);
		piece.vel.set(vel).add(new Vector3d(angVel).cross(r));
		piece.angVel.set(angVel);
		return piece;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_PIECE, PieceData.EMPTY);
		builder.define(DATA_ROT, new Quaternionf());
		builder.define(DATA_CUT_TIME, Long.MIN_VALUE / 2);
		builder.define(DATA_RESTING, false);
	}

	public boolean isResting() {
		return this.entityData.get(DATA_RESTING);
	}

	/**
	 * Adds this piece's solid volume inside {@code query} as world-aligned quarter-block boxes, so
	 * entities can walk on and bump into resting pieces.
	 */
	public void addCollisionShapes(AABB query, List<VoxelShape> out) {
		AABB region = query.intersect(this.getBoundingBox().inflate(0.01));
		if (region.getXsize() <= 0 || region.getYsize() <= 0 || region.getZsize() <= 0) {
			return;
		}
		double v = COLLISION_VOXEL;
		int x0 = (int) Math.floor(region.minX / v), x1 = (int) Math.ceil(region.maxX / v);
		int y0 = (int) Math.floor(region.minY / v), y1 = (int) Math.ceil(region.maxY / v);
		int z0 = (int) Math.floor(region.minZ / v), z1 = (int) Math.ceil(region.maxZ / v);
		if ((long) (x1 - x0) * (y1 - y0) * (z1 - z0) > 4096) {
			return;
		}
		Quaterniond q = this.level().isClientSide()
			? new Quaterniond(this.renderRot.x, this.renderRot.y, this.renderRot.z, this.renderRot.w)
			: this.rot;
		PieceBody b = this.body();
		Vector3d p = new Vector3d();
		for (int y = y0; y < y1; y++) {
			for (int z = z0; z < z1; z++) {
				int runStart = Integer.MIN_VALUE;
				for (int x = x0; x <= x1; x++) {
					boolean solid = false;
					if (x < x1) {
						p.set((x + 0.5) * v - this.getX(), (y + 0.5) * v - this.getY(), (z + 0.5) * v - this.getZ());
						q.transformInverse(p);
						solid = b.blockAt(p.x, p.y, p.z, 0.0) >= 0;
					}
					if (solid && runStart == Integer.MIN_VALUE) {
						runStart = x;
					} else if (!solid && runStart != Integer.MIN_VALUE) {
						out.add(Shapes.create(runStart * v, y * v, z * v, x * v, (y + 1) * v, (z + 1) * v));
						runStart = Integer.MIN_VALUE;
					}
				}
			}
		}
	}

	/** Marks this piece as freshly cut (its cut faces glow briefly on clients). */
	public void markFreshCut() {
		this.entityData.set(DATA_CUT_TIME, this.level().getGameTime());
	}

	public long getCutTime() {
		return this.entityData.get(DATA_CUT_TIME);
	}

	public PieceData getPieceData() {
		return this.entityData.get(DATA_PIECE);
	}

	public void setPieceData(PieceData data) {
		this.entityData.set(DATA_PIECE, data);
		this.body = null;
		this.setBoundingBox(this.makeBoundingBox());
	}

	public PieceBody body() {
		PieceData data = this.getPieceData();
		PieceBody b = this.body;
		if (b == null || this.bodyData != data) {
			b = new PieceBody(data);
			this.body = b;
			this.bodyData = data;
		}
		return b;
	}

	/** World position of the grid origin. */
	public Vector3d gridOriginWorld() {
		Vec3 off = this.getPieceData().gridOffset();
		return this.rot.transform(new Vector3d(off.x, off.y, off.z)).add(this.getX(), this.getY(), this.getZ());
	}

	public void wake() {
		this.sleeping = false;
		this.slowTicks = 0;
		this.restTicks = 0;
		this.entityData.set(DATA_RESTING, false);
	}

	void setResting(boolean resting) {
		if (this.entityData.get(DATA_RESTING) != resting) {
			this.entityData.set(DATA_RESTING, resting);
		}
	}

	/** Called by the physics world after integrating a tick. */
	void applyPhysicsTransform(Vector3d pos) {
		this.setPos(pos.x, pos.y, pos.z);
		Quaternionf q = new Quaternionf((float) this.rot.x, (float) this.rot.y, (float) this.rot.z, (float) this.rot.w);
		if (Math.abs(q.dot(this.lastSentRot)) < 0.9999995F) {
			this.lastSentRot.set(q);
			this.entityData.set(DATA_ROT, q);
		}
		this.setBoundingBox(this.makeBoundingBox());
	}

	// ------------------------------------------------------------------------------------------

	@Override
	public void tick() {
		if (this.level().isClientSide()) {
			if (this.interpolation.hasActiveInterpolation()) {
				this.interpolation.interpolate();
			}
			this.renderRotOld.set(this.renderRot);
			this.renderRot.set(this.rotTarget);
			this.setBoundingBox(this.makeBoundingBox());
			return;
		}
		if (this.getPieceData().isEmpty() || this.getY() < this.level().getMinY() - 64) {
			this.discard();
			return;
		}
		if (this.sleeping) {
			this.restTicks++;
			BladeConfig cfg = BladeConfig.get();
			ServerLevel level = (ServerLevel) this.level();
			if (this.body().volume < 0.03 && this.restTicks > 40) {
				// Tiny slivers just crumble away.
				this.discard();
				return;
			}
			if (cfg.solidify && this.restTicks >= cfg.solidifyDelayTicks && (this.restTicks - cfg.solidifyDelayTicks) % 20 == 0) {
				if (Solidifier.trySolidify(level, this)) {
					return;
				}
			}
		} else {
			this.restTicks = 0;
		}
	}

	@Override
	public void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {
		super.onSyncedDataUpdated(accessor);
		if (this.level().isClientSide()) {
			if (DATA_ROT.equals(accessor) && this.rotTarget != null) {
				this.rotTarget.set(this.entityData.get(DATA_ROT));
				if (!this.renderRotInit) {
					this.renderRot.set(this.rotTarget);
					this.renderRotOld.set(this.rotTarget);
					this.renderRotInit = true;
				}
			} else if (DATA_PIECE.equals(accessor)) {
				this.body = null;
				this.renderCache = null;
			}
			if (this.renderRot != null) {
				this.setBoundingBox(this.makeBoundingBox());
			}
		}
	}

	public Quaternionf getRenderRotation(float partialTick, Quaternionf dest) {
		return this.renderRotOld.slerp(this.renderRot, partialTick, dest);
	}

	@Override
	public @Nullable InterpolationHandler getInterpolation() {
		return this.interpolation != null && this.level().isClientSide() ? this.interpolation : null;
	}

	@Override
	protected AABB makeBoundingBox(Vec3 pos) {
		if (this.rot == null || this.renderRot == null) {
			return super.makeBoundingBox(pos);
		}
		PieceData data = this.getPieceData();
		if (data.isEmpty()) {
			return super.makeBoundingBox(pos);
		}
		PieceBody b = this.body();
		Matrix3d m = new Matrix3d();
		if (this.level().isClientSide()) {
			m.set(new Quaterniond(this.renderRot.x, this.renderRot.y, this.renderRot.z, this.renderRot.w));
		} else {
			m.set(this.rot);
		}
		double minX = Double.MAX_VALUE, minY = Double.MAX_VALUE, minZ = Double.MAX_VALUE;
		double maxX = -Double.MAX_VALUE, maxY = -Double.MAX_VALUE, maxZ = -Double.MAX_VALUE;
		Vector3d v = new Vector3d();
		for (int i = 0; i < 8; i++) {
			v.set((i & 1) == 0 ? b.minX : b.maxX, (i & 2) == 0 ? b.minY : b.maxY, (i & 4) == 0 ? b.minZ : b.maxZ);
			m.transform(v);
			minX = Math.min(minX, v.x);
			minY = Math.min(minY, v.y);
			minZ = Math.min(minZ, v.z);
			maxX = Math.max(maxX, v.x);
			maxY = Math.max(maxY, v.y);
			maxZ = Math.max(maxZ, v.z);
		}
		return new AABB(pos.x + minX, pos.y + minY, pos.z + minZ, pos.x + maxX, pos.y + maxY, pos.z + maxZ);
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distSqr) {
		double r = (this.getPieceData().isEmpty() ? 1.0 : this.body().radius) + 96.0;
		r *= Entity.getViewScale();
		return distSqr < r * r;
	}

	@Override
	public boolean isPickable() {
		return !this.isRemoved();
	}

	@Override
	public boolean canBeCollidedWith(@Nullable Entity entity) {
		return false;
	}

	@Override
	public boolean isPushable() {
		return false;
	}

	@Override
	public void push(double x, double y, double z) {
		if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) {
			return;
		}
		// Explosions and other pushes act on the whole body (scaled down for heavy pieces).
		double scale = 20.0 * Math.min(1.0, 2.5 / Math.sqrt(Math.max(0.1, this.body().mass)));
		this.vel.add(x * scale, y * scale, z * scale);
		this.wake();
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		if (this.isRemoved()) {
			return false;
		}
		Entity attacker = source.getEntity();
		if (attacker instanceof Player player && source.getDirectEntity() == player) {
			return this.knockOffBlock(level, player);
		}
		return false;
	}

	/** A player punching the piece knocks off the block they are looking at. */
	private boolean knockOffBlock(ServerLevel level, Player player) {
		Vec3 eye = player.getEyePosition();
		Vec3 look = player.getViewVector(1.0F);
		double reach = player.entityInteractionRange() + 2.0;
		int hit = this.raycastBlock(eye, look, reach);
		if (hit < 0) {
			return false;
		}
		PieceBody b = this.body();
		PieceBlock block = b.blocks.get(hit);
		Vector3d c = this.toWorld(b.blockCenters[hit * 3], b.blockCenters[hit * 3 + 1], b.blockCenters[hit * 3 + 2]);
		BlockPos at = BlockPos.containing(c.x, c.y, c.z);
		BlockState state = block.state();
		ItemStack tool = player.getMainHandItem();
		boolean drops = !player.isCreative() && (!state.requiresCorrectToolForDrops() || player.hasCorrectToolForDrops(state));
		if (drops) {
			double fraction = block.isCut() ? b.shapes[hit].fraction() : 1.0;
			if (level.getRandom().nextDouble() < fraction) {
				for (ItemStack stack : Block.getDrops(state, level, at, null, player, tool)) {
					Block.popResource(level, at, stack);
				}
			}
		}
		level.levelEvent(2001, at, Block.getId(state));
		level.playSound(null, c.x, c.y, c.z, state.getSoundType().getBreakSound(), SoundSource.BLOCKS, 1.0F, 1.0F);

		List<PieceBlock> rest = new ArrayList<>(b.blocks);
		rest.remove(hit);
		this.replaceBlocks(level, rest);
		return true;
	}

	/** Replaces this piece's blocks, splitting into several pieces if they no longer hold together. */
	public void replaceBlocks(ServerLevel level, List<PieceBlock> blocks) {
		if (blocks.isEmpty()) {
			this.discard();
			return;
		}
		List<List<PieceBlock>> parts = PieceGraph.components(blocks);
		Vector3d origin = this.gridOriginWorld();
		Vector3d com = new Vector3d(this.getX(), this.getY(), this.getZ());
		for (int i = 1; i < parts.size(); i++) {
			PieceEntity extra = create(level, parts.get(i), origin, this.rot, this.vel, this.angVel, com);
			if (extra != null) {
				level.addFreshEntity(extra);
			}
		}
		List<PieceBlock> mine = parts.getFirst();
		Vector3d newCom = PieceBody.centerOfMass(mine);
		Vector3d newPos = this.rot.transform(new Vector3d(newCom)).add(origin);
		this.vel.add(new Vector3d(this.angVel).cross(new Vector3d(newPos).sub(com)));
		this.setPieceData(new PieceData(mine, new Vec3(-newCom.x, -newCom.y, -newCom.z)));
		this.setPos(newPos.x, newPos.y, newPos.z);
		this.wake();
	}

	public Vector3d toWorld(double bx, double by, double bz) {
		return this.rot.transform(new Vector3d(bx, by, bz)).add(this.getX(), this.getY(), this.getZ());
	}

	public Vector3d toBody(double wx, double wy, double wz) {
		return this.rot.transformInverse(new Vector3d(wx - this.getX(), wy - this.getY(), wz - this.getZ()));
	}

	/** Index of the first block hit by the ray, or -1. Works on server and client (uses the matching rotation). */
	public int raycastBlock(Vec3 from, Vec3 dir, double maxDist) {
		Quaterniond q = this.level().isClientSide()
			? new Quaterniond(this.renderRot.x, this.renderRot.y, this.renderRot.z, this.renderRot.w)
			: this.rot;
		Vector3d o = q.transformInverse(new Vector3d(from.x - this.getX(), from.y - this.getY(), from.z - this.getZ()));
		Vector3d d = q.transformInverse(new Vector3d(dir.x, dir.y, dir.z)).normalize();
		PieceBody b = this.body();
		Vec3 off = this.getPieceData().gridOffset();
		o.sub(off.x, off.y, off.z);
		int best = -1;
		double bestT = maxDist;
		for (int i = 0; i < b.blocks.size(); i++) {
			BlockPos p = b.blocks.get(i).pos();
			double t = rayHit(b.shapes[i], b.blocks.get(i), o.x - p.getX(), o.y - p.getY(), o.z - p.getZ(), d, bestT);
			if (t >= 0 && t < bestT) {
				bestT = t;
				best = i;
			}
		}
		return best;
	}

	private static double rayHit(PartShape shape, PieceBlock block, double ox, double oy, double oz, Vector3d d, double maxT) {
		double best = -1;
		List<ConvexPart> parts = shape.parts;
		if (parts.isEmpty()) {
			// Non-collidable attachment: use its outline box.
			for (var box : BlockGeometry.outlineBoxes(block.state())) {
				double t = clipRay(ox, oy, oz, d, maxT, box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ, block.planes());
				if (t >= 0 && (best < 0 || t < best)) {
					best = t;
				}
			}
			return best;
		}
		for (ConvexPart part : parts) {
			double t = clipRay(ox, oy, oz, d, maxT, part.x0, part.y0, part.z0, part.x1, part.y1, part.z1, part.planes);
			if (t >= 0 && (best < 0 || t < best)) {
				best = t;
			}
		}
		return best;
	}

	/** Cyrus–Beck ray clip against box ∩ planes; returns entry distance or -1. */
	static double clipRay(double ox, double oy, double oz, Vector3d d, double maxT, double x0, double y0, double z0, double x1, double y1, double z1, List<Plane> planes) {
		double tIn = 0;
		double tOut = maxT;
		double[][] faces = {{-1, 0, 0, -x0}, {1, 0, 0, x1}, {0, -1, 0, -y0}, {0, 1, 0, y1}, {0, 0, -1, -z0}, {0, 0, 1, z1}};
		for (double[] f : faces) {
			double num = f[3] - (f[0] * ox + f[1] * oy + f[2] * oz);
			double den = f[0] * d.x + f[1] * d.y + f[2] * d.z;
			if (Math.abs(den) < 1.0E-12) {
				if (num < 0) {
					return -1;
				}
			} else if (den > 0) {
				tOut = Math.min(tOut, num / den);
			} else {
				tIn = Math.max(tIn, num / den);
			}
			if (tIn > tOut) {
				return -1;
			}
		}
		for (Plane p : planes) {
			double num = p.d() - (p.nx() * ox + p.ny() * oy + p.nz() * oz);
			double den = p.nx() * d.x + p.ny() * d.y + p.nz() * d.z;
			if (Math.abs(den) < 1.0E-12) {
				if (num < 0) {
					return -1;
				}
			} else if (den > 0) {
				tOut = Math.min(tOut, num / den);
			} else {
				tIn = Math.max(tIn, num / den);
			}
			if (tIn > tOut) {
				return -1;
			}
		}
		return tIn;
	}

	// ------------------------------------------------------------------------------------------

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		input.read("rotation", ExtraCodecs.QUATERNIONF).ifPresent(q -> {
			this.rot.set(q.x(), q.y(), q.z(), q.w()).normalize();
			this.entityData.set(DATA_ROT, new Quaternionf(q));
		});
		input.read("piece", PieceData.CODEC).ifPresent(this::setPieceData);
		input.read("velocity", Vec3.CODEC).ifPresent(v -> this.vel.set(v.x, v.y, v.z));
		input.read("angular_velocity", Vec3.CODEC).ifPresent(v -> this.angVel.set(v.x, v.y, v.z));
		this.sleeping = input.getBooleanOr("sleeping", false);
		this.entityData.set(DATA_RESTING, this.sleeping);
		this.restTicks = input.getIntOr("rest_ticks", 0);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		output.store("piece", PieceData.CODEC, this.getPieceData());
		output.store("rotation", ExtraCodecs.QUATERNIONF, new Quaternionf((float) this.rot.x, (float) this.rot.y, (float) this.rot.z, (float) this.rot.w));
		output.store("velocity", Vec3.CODEC, new Vec3(this.vel.x, this.vel.y, this.vel.z));
		output.store("angular_velocity", Vec3.CODEC, new Vec3(this.angVel.x, this.angVel.y, this.angVel.z));
		output.putBoolean("sleeping", this.sleeping);
		output.putInt("rest_ticks", this.restTicks);
	}
}
