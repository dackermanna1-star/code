package com.ordnance.entity;

import com.ordnance.ClientBridge;
import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.explosion.TerrainEffects;
import com.ordnance.fire.FireHelper;
import com.ordnance.registry.ModEntities;
import com.ordnance.registry.ModSounds;
import com.ordnance.registry.ModTags;
import it.unimi.dsi.fastutil.longs.LongSet;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.block.Block;
import net.minecraft.block.BlockRenderType;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.MovementType;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;
import net.minecraft.world.WorldEvents;
import org.jspecify.annotations.Nullable;

/**
 * A chunk of a destroyed block thrown by a blast. Simulated identically on both sides (the server corrects the
 * client occasionally). On landing it either settles as rubble or shatters, and burning debris starts fires.
 * Never saved to disk.
 */
public class DebrisEntity extends Entity {
	private static final TrackedData<BlockState> BLOCK = DataTracker.registerData(DebrisEntity.class, TrackedDataHandlerRegistry.BLOCK_STATE);
	private int life;
	private int bounces;
	@Nullable
	private Entity owner;
	private boolean hitEntity;
	/** Client-side tumble angles for the renderer. */
	public float spinX;
	public float spinY;
	public float lastSpinX;
	public float lastSpinY;

	public DebrisEntity(EntityType<? extends DebrisEntity> type, World world) {
		super(type, world);
	}

	public DebrisEntity(World world, double x, double y, double z, BlockState state, @Nullable Entity owner) {
		this(ModEntities.DEBRIS, world);
		this.setPosition(x, y, z);
		this.dataTracker.set(BLOCK, state);
		this.owner = owner;
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		builder.add(BLOCK, Blocks.STONE.getDefaultState());
	}

	public BlockState getBlockState() {
		return this.dataTracker.get(BLOCK);
	}

	/** Render scale, varied per entity so a debris shower doesn't look uniform. */
	public float getScale() {
		return 0.38F + (Math.floorMod(this.getId() * 31, 17) / 17.0F) * 0.42F;
	}

	@Override
	public void tick() {
		super.tick();
		Vec3d velocity = this.getVelocity().multiply(this.isTouchingWater() ? 0.8 : 0.985).add(0.0, -0.045, 0.0);
		this.setVelocity(velocity);
		Vec3d start = this.getEntityPos();
		this.move(MovementType.SELF, velocity);
		Vec3d moved = this.getEntityPos().subtract(start);
		boolean hitY = !MathHelper.approximatelyEquals(velocity.y, moved.y);
		boolean hitX = !MathHelper.approximatelyEquals(velocity.x, moved.x);
		boolean hitZ = !MathHelper.approximatelyEquals(velocity.z, moved.z);
		double speed = velocity.length();
		if (hitX || hitZ) {
			this.setVelocity(hitX ? -velocity.x * 0.3 : velocity.x, velocity.y, hitZ ? -velocity.z * 0.3 : velocity.z);
		}

		World world = this.getEntityWorld();
		if (world.isClient()) {
			this.lastSpinX = this.spinX;
			this.lastSpinY = this.spinY;
			if (!this.isOnGround()) {
				float rate = (float)speed * 55.0F;
				this.spinX += rate;
				this.spinY += rate * 0.6F;
			}

			ClientBridge.get().entityTick(this);
			return;
		}

		if (!this.hitEntity && speed > 0.45) {
			this.damageEntitiesInPath((ServerWorld)world, speed);
		}

		if (hitY && velocity.y < 0.0) {
			if (speed > 0.35 && this.bounces < 1) {
				this.bounces++;
				Vec3d v = this.getVelocity();
				this.setVelocity(v.x * 0.45, -velocity.y * 0.3, v.z * 0.45);
			} else {
				this.land((ServerWorld)world);
				return;
			}
		}

		if (++this.life > 200) {
			this.land((ServerWorld)world);
		}
	}

	private void damageEntitiesInPath(ServerWorld world, double speed) {
		for (Entity entity : world.getOtherEntities(this, this.getBoundingBox().expand(0.15), e -> e.isAlive() && e.canHit() && !(e instanceof DebrisEntity))) {
			DamageSource source = this.getDamageSources().fallingBlock(this.owner != null ? this.owner : this);
			entity.damage(world, source, (float)Math.min(6.0, 2.0 + speed * 3.0));
			this.hitEntity = true;
			this.setVelocity(this.getVelocity().multiply(0.3));
			break;
		}
	}

	private void land(ServerWorld world) {
		OrdnanceConfig.Explosions cfg = ConfigManager.get().explosions;
		BlockState state = this.getBlockState();
		BlockPos pos = BlockPos.ofFloored(this.getX(), this.getY() + 0.25, this.getZ());
		if (this.isOnFire() && !this.isTouchingWater() && this.random.nextFloat() < 0.6F) {
			FireHelper.tryIgnite(world, pos, false, this.owner);
		}

		BlockState rubble = rubbleOf(state);
		BlockState current = world.getBlockState(pos);
		BlockPos below = pos.down();
		if (rubble != null && cfg.terrainDamage && this.random.nextFloat() < cfg.rubbleChance && (current.isAir() || current.isReplaceable())
			&& current.getFluidState().isEmpty() && world.getBlockState(below).isSideSolidFullSquare(world, below, Direction.UP)
			&& TerrainEffects.canModify(world, pos, this.owner)) {
			world.setBlockState(pos, rubble, Block.NOTIFY_ALL);
			world.playSound(null, pos, ModSounds.DEBRIS_LAND, SoundCategory.BLOCKS, 0.7F, 0.8F + this.random.nextFloat() * 0.4F);
		} else {
			world.syncWorldEvent(WorldEvents.BLOCK_BROKEN, pos, Block.getRawIdFromState(state));
			if (cfg.dropBlocks && rubble != null && this.random.nextFloat() < 0.2F) {
				Block.dropStacks(state, world, pos);
			}
		}

		this.discard();
	}

	/** The block a settling chunk becomes, or null if it can only shatter. */
	@Nullable
	public static BlockState rubbleOf(BlockState state) {
		if (state.isIn(ModTags.SHATTERABLE) || state.isIn(BlockTags.LEAVES)) {
			return null;
		} else if (state.isOf(Blocks.STONE) || state.isOf(Blocks.ANDESITE) || state.isOf(Blocks.DIORITE) || state.isOf(Blocks.GRANITE) || state.isOf(Blocks.TUFF)) {
			return Blocks.COBBLESTONE.getDefaultState();
		} else if (state.isOf(Blocks.DEEPSLATE)) {
			return Blocks.COBBLED_DEEPSLATE.getDefaultState();
		} else if (state.isOf(Blocks.GRASS_BLOCK) || state.isOf(Blocks.PODZOL) || state.isOf(Blocks.MYCELIUM) || state.isOf(Blocks.DIRT_PATH) || state.isOf(Blocks.FARMLAND)) {
			return Blocks.DIRT.getDefaultState();
		}

		return state.getBlock().getDefaultState();
	}

	public static boolean isSuitable(World world, BlockPos pos, BlockState state) {
		return state.getRenderType() == BlockRenderType.MODEL && !state.hasBlockEntity() && state.getFluidState().isEmpty() && state.isFullCube(world, pos);
	}

	/** Picks up to {@code count} destroyed blocks to throw, capped by the per-world debris budget. */
	public static List<Seed> sample(ServerWorld world, LongSet blocks, int count, Random random) {
		if (count <= 0 || blocks.isEmpty()) {
			return List.of();
		}

		int active = world.getEntitiesByType(ModEntities.DEBRIS, e -> true).size();
		count = Math.min(count, ConfigManager.get().explosions.maxActiveDebris - active);
		if (count <= 0) {
			return List.of();
		}

		long[] keys = blocks.toLongArray();
		List<Seed> seeds = new ArrayList<>(count);
		LongSet used = new it.unimi.dsi.fastutil.longs.LongOpenHashSet();
		for (int attempt = 0; attempt < count * 4 && seeds.size() < count; attempt++) {
			long key = keys[random.nextInt(keys.length)];
			if (!used.add(key)) {
				continue;
			}

			BlockPos pos = BlockPos.fromLong(key);
			BlockState state = world.getBlockState(pos);
			if (isSuitable(world, pos, state)) {
				seeds.add(new Seed(pos, state));
			}
		}

		return seeds;
	}

	/** Launches sampled debris away from the blast centre. */
	public static void launch(ServerWorld world, List<Seed> seeds, Vec3d center, float radius, float scale, float burnChance, @Nullable Entity owner) {
		Random random = world.getRandom();
		for (Seed seed : seeds) {
			Vec3d blockCenter = Vec3d.ofCenter(seed.pos());
			Vec3d out = blockCenter.subtract(center);
			double distance = out.length();
			Vec3d dir = distance < 0.01 ? new Vec3d(0.0, 1.0, 0.0) : out.multiply(1.0 / distance);
			dir = dir.add((random.nextDouble() - 0.5) * 0.4, 0.55 + random.nextDouble() * 0.7, (random.nextDouble() - 0.5) * 0.4).normalize();
			double falloff = MathHelper.clamp(1.25 - distance / Math.max(1.0, radius), 0.25, 1.0);
			double speed = Math.min(2.2, (0.32 + scale * 0.13) * (0.6 + random.nextDouble() * 0.8) * falloff);
			DebrisEntity debris = new DebrisEntity(world, blockCenter.x, blockCenter.y - 0.25, blockCenter.z, seed.state(), owner);
			debris.setVelocity(dir.multiply(speed));
			if (random.nextFloat() < burnChance) {
				debris.setOnFireForTicks(60 + random.nextInt(80));
			}

			world.spawnEntity(debris);
		}
	}

	@Override
	public boolean damage(ServerWorld world, DamageSource source, float amount) {
		return false;
	}

	@Override
	public boolean shouldRender(double distance) {
		return distance < 96.0 * 96.0;
	}

	@Override
	protected void readCustomData(ReadView view) {
	}

	@Override
	protected void writeCustomData(WriteView view) {
	}

	public record Seed(BlockPos pos, BlockState state) {
	}
}
