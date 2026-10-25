package com.godforge.entity;

import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.BlockOps;
import com.godforge.network.Fx;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.EffectEntity;
import com.godforge.util.Loaded;
import com.godforge.weapon.WeaponType;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * A fragment of fractured terrain (up to 4x4x4 real blocks) torn out by the Reality Breaker. It rises,
 * hangs in the air slowly tumbling, then crashes back down and settles as rubble.
 */
public class FractureChunkEntity extends Entity implements EffectEntity {
	public static final int MAX_DIM = 4;
	private static final EntityDataAccessor<String> DATA_BLOCKS = SynchedEntityData.defineId(FractureChunkEntity.class, EntityDataSerializers.STRING);
	private static final EntityDataAccessor<Integer> DATA_PHASE = SynchedEntityData.defineId(FractureChunkEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Float> DATA_SPIN = SynchedEntityData.defineId(FractureChunkEntity.class, EntityDataSerializers.FLOAT);
	private static final AtomicInteger ALIVE = new AtomicInteger();
	public static final int PHASE_RISE = 0;
	public static final int PHASE_HOVER = 1;
	public static final int PHASE_FALL = 2;

	private boolean counted;
	private int life;
	private int riseTicks = 30;
	private int hoverTicks = 200;
	private float hoverHeight;
	private float damage = 10.0F;

	private String cachedKey = "";
	private int[] dims = {1, 1, 1};
	private BlockState[] cached = new BlockState[0];

	/** Live instances are never saved, so a starting server always begins from zero. */
	public static void resetLiveCount() {
		ALIVE.set(0);
	}

	public FractureChunkEntity(EntityType<? extends FractureChunkEntity> type, Level level) {
		super(type, level);
	}

	public static boolean canSpawn() {
		return ALIVE.get() < GodforgeConfig.get().performance.maxFractureChunks;
	}

	public static @Nullable FractureChunkEntity spawn(ServerLevel level, Vec3 pos, int w, int h, int d, BlockState[] states, float riseSpeed, int hoverTicks, float damage) {
		if (!canSpawn()) {
			return null;
		}
		FractureChunkEntity chunk = new FractureChunkEntity(ModEntities.FRACTURE_CHUNK, level);
		chunk.setPos(pos);
		chunk.entityData.set(DATA_BLOCKS, encode(w, h, d, states));
		chunk.entityData.set(DATA_SPIN, (level.getRandom().nextFloat() - 0.5F) * 6.0F);
		chunk.setDeltaMovement(0, riseSpeed, 0);
		chunk.hoverTicks = hoverTicks;
		chunk.riseTicks = 20 + level.getRandom().nextInt(25);
		chunk.damage = damage;
		chunk.hoverHeight = (float) pos.y;
		if (level.addFreshEntity(chunk)) {
			chunk.counted = true;
			ALIVE.incrementAndGet();
			return chunk;
		}
		return null;
	}

	static String encode(int w, int h, int d, BlockState[] states) {
		StringBuilder sb = new StringBuilder();
		sb.append(w).append(',').append(h).append(',').append(d);
		for (BlockState state : states) {
			sb.append(',').append(Integer.toString(state == null ? 0 : Block.getId(state), 36));
		}
		return sb.toString();
	}

	private void decodeIfNeeded() {
		String key = this.entityData.get(DATA_BLOCKS);
		if (key.equals(this.cachedKey)) {
			return;
		}
		this.cachedKey = key;
		String[] parts = key.split(",");
		if (parts.length < 3) {
			this.dims = new int[]{1, 1, 1};
			this.cached = new BlockState[]{Blocks.STONE.defaultBlockState()};
			return;
		}
		int w = Mth.clamp(Integer.parseInt(parts[0]), 1, MAX_DIM);
		int h = Mth.clamp(Integer.parseInt(parts[1]), 1, MAX_DIM);
		int d = Mth.clamp(Integer.parseInt(parts[2]), 1, MAX_DIM);
		this.dims = new int[]{w, h, d};
		this.cached = new BlockState[w * h * d];
		for (int i = 0; i < this.cached.length && i + 3 < parts.length; i++) {
			this.cached[i] = Block.stateById(Integer.parseInt(parts[i + 3], 36));
		}
	}

	public int[] dims() {
		this.decodeIfNeeded();
		return this.dims;
	}

	/** Block at local (x, y, z) or air. */
	public BlockState blockAt(int x, int y, int z) {
		this.decodeIfNeeded();
		int i = (y * this.dims[2] + z) * this.dims[0] + x;
		BlockState s = i >= 0 && i < this.cached.length ? this.cached[i] : null;
		return s == null ? Blocks.AIR.defaultBlockState() : s;
	}

	public float spin() {
		return this.entityData.get(DATA_SPIN);
	}

	public int phase() {
		return this.entityData.get(DATA_PHASE);
	}

	public int life() {
		return this.life;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(DATA_BLOCKS, "1,1,1," + Integer.toString(Block.getId(Blocks.STONE.defaultBlockState()), 36));
		builder.define(DATA_PHASE, PHASE_RISE);
		builder.define(DATA_SPIN, 1.0F);
	}

	@Override
	public void tick() {
		super.tick();
		this.life++;
		int phase = this.phase();
		if (phase == PHASE_RISE) {
			this.setDeltaMovement(this.getDeltaMovement().scale(0.94));
			this.setPos(this.position().add(this.getDeltaMovement()));
			if (!this.level().isClientSide() && this.life >= this.riseTicks) {
				this.entityData.set(DATA_PHASE, PHASE_HOVER);
				this.hoverHeight = (float) this.getY();
			}
		} else if (phase == PHASE_HOVER) {
			double bob = Math.sin((this.life + this.getId() * 7) * 0.08) * 0.02;
			this.setDeltaMovement(0, bob, 0);
			this.setPos(this.position().add(this.getDeltaMovement()));
			if (!this.level().isClientSide() && this.life >= this.riseTicks + this.hoverTicks) {
				this.entityData.set(DATA_PHASE, PHASE_FALL);
			}
		} else {
			this.setDeltaMovement(this.getDeltaMovement().add(0, -0.08, 0).scale(0.98));
			this.move(MoverType.SELF, this.getDeltaMovement());
			if (this.level() instanceof ServerLevel server && (this.onGround() || this.life > this.riseTicks + this.hoverTicks + 200)) {
				this.crash(server);
			}
		}
	}

	private void crash(ServerLevel level) {
		this.decodeIfNeeded();
		Vec3 at = this.position();
		DamageSource source = ModDamageTypes.source(level, WeaponType.REALITY_BREAKER, this, null);
		AABB box = this.getBoundingBox().inflate(1.5);
		for (Entity e : level.getEntities(this, box, e -> e.isAlive() && !(e instanceof EffectEntity))) {
			Combat.hurt(level, e, source, this.damage);
		}
		BlockPos base = BlockPos.containing(at.x - this.dims[0] * 0.5, at.y, at.z - this.dims[2] * 0.5);
		boolean place = GodforgeConfig.get().general.debrisPlacesBlocks;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		BlockState particleState = Blocks.STONE.defaultBlockState();
		for (int y = 0; y < this.dims[1]; y++) {
			for (int z = 0; z < this.dims[2]; z++) {
				for (int x = 0; x < this.dims[0]; x++) {
					BlockState state = this.blockAt(x, y, z);
					if (state.isAir()) {
						continue;
					}
					particleState = state;
					if (!place) {
						continue;
					}
					pos.set(base.getX() + x, base.getY() + y, base.getZ() + z);
					BlockState current = Loaded.state(level, pos);
					if (current != null && current.canBeReplaced() && BlockOps.isWithinBorder(level, pos)) {
						level.setBlock(pos, state, BlockOps.FAST_PLACE);
					}
				}
			}
		}
		level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, particleState), at.x, at.y + 0.5, at.z, 40, 1.0, 0.5, 1.0, 0.25);
		Fx.sound(level, at, ModSounds.DEBRIS_IMPACT, 2.5F, 0.8F + this.random.nextFloat() * 0.3F);
		this.discard();
	}

	@Override
	public void onRemoval(RemovalReason reason) {
		// runs for every removal, including chunk unloads that bypass remove()
		if (this.counted) {
			this.counted = false;
			ALIVE.decrementAndGet();
		}
		super.onRemoval(reason);
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 256.0 * 256.0;
	}

	@Override
	public boolean isPickable() {
		return false;
	}

	@Override
	public boolean hurtServer(ServerLevel level, net.minecraft.world.damagesource.DamageSource source, float amount) {
		return false;
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}
}
