package com.chaosunleashed.events.rift;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.EventContext;
import com.chaosunleashed.core.SpawnHelper;
import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModItems;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import it.unimi.dsi.fastutil.longs.Long2ObjectLinkedOpenHashMap;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.ChestBlock;
import net.minecraft.block.ChorusFlowerBlock;
import net.minecraft.block.entity.ChestBlockEntity;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.sound.SoundEvent;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/**
 * Dimension Rift: a glowing crack opens in the sky and the land beneath it slowly turns into the Nether or the End,
 * spreading out in a rough circle from the impact point. Mobs from that dimension crawl out of the converted area.
 * When the rift closes the mobs are pulled back in; the terrain stays converted (or reverts, if configured).
 * Rare chance of a Rift Cache full of otherworldly loot.
 */
public class DimensionRiftEvent extends ChaosEvent {
	private final boolean end;
	private final BlockPos impact;
	private final int maxRadius;
	private final LongSet convertedColumns = new LongOpenHashSet();
	/** Original block states for reverting (only filled when riftRevertTerrain is on). */
	private final Long2ObjectLinkedOpenHashMap<BlockState> originals = new Long2ObjectLinkedOpenHashMap<>();
	private final List<BlockPos> chorusRoots = new ArrayList<>();
	@Nullable
	private RiftEntity rift;
	private float radius = 2.0F;
	private boolean reverted;

	public DimensionRiftEvent(EventContext context) {
		super(context);
		this.end = this.random.nextBoolean();
		double angle = this.random.nextDouble() * Math.PI * 2.0;
		double distance = 10 + this.random.nextInt(12);
		int x = this.origin.getX() + MathHelper.floor(Math.cos(angle) * distance);
		int z = this.origin.getZ() + MathHelper.floor(Math.sin(angle) * distance);
		this.impact = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z));
		this.maxRadius = this.radius(18, 8);
	}

	private boolean revertEnabled() {
		return this.config().riftRevertTerrain;
	}

	@Override
	public Text warningTitle() {
		return Text.literal("⚠ Reality is tearing apart...").formatted(Formatting.LIGHT_PURPLE, Formatting.BOLD);
	}

	@Override
	public Text warningSubtitle() {
		return Text.literal(this.end ? "A crack to the End is opening in the sky!" : "A crack to the Nether is opening in the sky!")
			.formatted(this.end ? Formatting.DARK_PURPLE : Formatting.RED);
	}

	@Override
	protected SoundEvent warningSound() {
		return ModSounds.RIFT_WARNING;
	}

	@Override
	public float clientValue() {
		return this.end ? 1.0F : 0.0F;
	}

	@Override
	public BlockPos clientPos() {
		return this.impact;
	}

	@Override
	public Text bossBarDetail() {
		return Text.literal(this.end ? "→ The End" : "→ The Nether").formatted(this.end ? Formatting.DARK_PURPLE : Formatting.RED);
	}

	private Vec3d riftPos() {
		int height = Math.min(42, this.world.getTopYInclusive() - this.impact.getY() - 16);
		return Vec3d.ofBottomCenter(this.impact).add(0, Math.max(16, height), 0);
	}

	// ------------------------------------------------------------------------------------------ warning

	@Override
	protected void onWarningStart() {
		RiftEntity entity = ModEntities.DIMENSION_RIFT.create(this.world, SpawnReason.EVENT);
		if (entity != null) {
			Vec3d pos = this.riftPos();
			entity.refreshPositionAndAngles(pos.x, pos.y, pos.z, 0.0F, 0.0F);
			entity.setEnd(this.end);
			entity.setOpenness(0.05F);
			if (this.spawnTracked(entity)) {
				this.rift = entity;
			}
		}
	}

	@Override
	protected void tickWarning() {
		float progress = this.phaseProgress();
		if (this.rift != null) {
			this.rift.setOpenness(0.1F + 0.5F * progress);
		}
		if (this.phaseTicks() % 60 == 1) {
			this.playSoundAt(this.riftPos(), ModSounds.RIFT_TEAR, 8.0F, 0.7F + progress * 0.3F);
			this.shakeNear(Vec3d.ofCenter(this.impact), 64.0, 0.4F + progress, 15);
		}
		if (this.phaseTicks() % 4 == 0) {
			Vec3d pos = this.riftPos();
			this.farParticles(ModParticles.RIFT_SPARK, pos, 4 + (int) (progress * 10), 2.0, 8.0 * progress, 2.0, 0.05);
		}
	}

	// ------------------------------------------------------------------------------------------ active

	@Override
	protected void onActiveStart() {
		if (this.rift != null) {
			this.rift.setOpenness(1.0F);
		}
		this.playSoundAt(this.riftPos(), ModSounds.RIFT_TEAR, 12.0F, 0.5F);
		this.shakeNear(Vec3d.ofCenter(this.impact), 80.0, 2.5F, 30);
		this.farParticles(ParticleTypes.EXPLOSION_EMITTER, Vec3d.ofCenter(this.impact), 2, 1.0, 0.5, 1.0, 0.0);
		this.actionBarAll(Text.literal("✦ The rift is open! " + (this.end ? "The End" : "The Nether") + " is spilling into this world!")
			.formatted(this.end ? Formatting.DARK_PURPLE : Formatting.RED, Formatting.BOLD));
	}

	@Override
	protected void tickActive() {
		int t = this.phaseTicks();
		float growth = MathHelper.clamp(t / (this.phaseLength() * 0.7F), 0.0F, 1.0F);
		this.radius = 2.0F + (this.maxRadius - 2.0F) * growth;
		if (this.blockDamage()) {
			this.queueConversions();
		}
		if (t % 80 == 40) {
			this.spawnRiftMobs();
		}
		if (t % 100 == 0) {
			this.playSoundAt(this.riftPos(), ModSounds.RIFT_TEAR, 8.0F, 0.6F + this.random.nextFloat() * 0.3F);
		}
		if (t % 2 == 0) {
			// A stream of energy pours from the crack down to the impact point.
			Vec3d top = this.riftPos();
			Vec3d bottom = Vec3d.ofCenter(this.impact);
			double f = this.random.nextDouble();
			Vec3d p = top.lerp(bottom, f);
			this.farParticles(this.end ? ParticleTypes.REVERSE_PORTAL : ParticleTypes.FLAME, p, 3, 0.6, 0.6, 0.6, 0.02);
			this.farParticles(ModParticles.RIFT_SPARK, top, 3, 1.5, 6.0, 1.5, 0.05);
		}
	}

	private void queueConversions() {
		if (this.blocks().pending(this) > 40) {
			return;
		}
		int columns = 6 + this.intensity * 3;
		int attempts = columns * 4;
		for (int i = 0; i < attempts && columns > 0; i++) {
			double r;
			if (this.random.nextFloat() < 0.6F) {
				r = Math.max(0.0, this.radius - this.random.nextDouble() * 4.0);
			} else {
				r = this.radius * Math.sqrt(this.random.nextDouble());
			}
			// Rough, noisy edge.
			double angle = this.random.nextDouble() * Math.PI * 2.0;
			r *= 0.85 + 0.15 * MathHelper.sin((float) (angle * 5.0 + this.impact.getX()));
			int x = this.impact.getX() + MathHelper.floor(Math.cos(angle) * r);
			int z = this.impact.getZ() + MathHelper.floor(Math.sin(angle) * r);
			long key = BlockPos.asLong(x, 0, z);
			if (!this.convertedColumns.add(key)) {
				continue;
			}
			columns--;
			this.blocks().enqueue(this, () -> this.convertColumn(x, z));
		}
	}

	/** Converts the top few natural blocks of a column. Returns the number of changed blocks. */
	private int convertColumn(int x, int z) {
		if (!this.world.isChunkLoaded(x >> 4, z >> 4)) {
			return 1;
		}
		BlockPos top = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, new BlockPos(x, 0, z));
		BlockPos.Mutable pos = top.mutableCopy();
		int changed = 0;
		int solid = 0;
		for (int i = 0; i < 14 && solid < 3; i++, pos.move(Direction.DOWN)) {
			BlockState state = this.world.getBlockState(pos);
			if (state.isAir() || !state.getFluidState().isEmpty()) {
				continue;
			}
			BlockState next = this.end ? this.toEnd(state, solid) : this.toNether(state, solid);
			if (next == null) {
				if (state.isSolidBlock(this.world, pos)) {
					break;
				}
				continue;
			}
			if (!this.canModify(pos, state)) {
				break;
			}
			if (this.revertEnabled()) {
				this.originals.putIfAbsent(pos.asLong(), state);
			}
			this.world.setBlockState(pos, next, Block.NOTIFY_LISTENERS);
			changed++;
			if (next.isSolidBlock(this.world, pos)) {
				solid++;
			}
		}
		if (changed > 0) {
			this.decorate(top, x, z);
			if (this.random.nextInt(6) == 0) {
				this.world.spawnParticles(this.end ? ParticleTypes.REVERSE_PORTAL : ParticleTypes.LAVA, x + 0.5, top.getY() + 0.5, z + 0.5, 3, 0.4, 0.2, 0.4, 0.02);
			}
		}
		return Math.max(1, changed);
	}

	/** Small surface features: nether roots / soul fire, or chorus plants on end stone. */
	private void decorate(BlockPos top, int x, int z) {
		BlockPos surface = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z));
		BlockState ground = this.world.getBlockState(surface.down());
		if (!this.world.isAir(surface)) {
			return;
		}
		if (this.end) {
			if (ground.isOf(Blocks.END_STONE) && this.random.nextInt(70) == 0 && !this.revertEnabled()) {
				ChorusFlowerBlock.generate(this.world, surface, this.random, 6);
				this.chorusRoots.add(surface);
			}
		} else if (ground.isOf(Blocks.CRIMSON_NYLIUM) && this.random.nextInt(4) == 0) {
			this.place(surface, this.random.nextBoolean() ? Blocks.CRIMSON_ROOTS.getDefaultState() : Blocks.CRIMSON_FUNGUS.getDefaultState());
		} else if (ground.isOf(Blocks.SOUL_SOIL) && this.random.nextInt(8) == 0) {
			this.place(surface, Blocks.SOUL_FIRE.getDefaultState());
		} else if (ground.isOf(Blocks.NETHERRACK) && this.random.nextInt(30) == 0) {
			this.place(surface, Blocks.NETHER_SPROUTS.getDefaultState());
		}
	}

	private void place(BlockPos pos, BlockState state) {
		if (state.canPlaceAt(this.world, pos)) {
			if (this.revertEnabled()) {
				this.originals.putIfAbsent(pos.asLong(), this.world.getBlockState(pos));
			}
			this.world.setBlockState(pos, state, Block.NOTIFY_ALL);
		}
	}

	@Nullable
	private BlockState toNether(BlockState state, int depth) {
		if (state.isIn(BlockTags.LOGS)) {
			return (this.random.nextInt(3) == 0 ? Blocks.WARPED_STEM : Blocks.CRIMSON_STEM).getDefaultState();
		}
		if (state.isIn(BlockTags.LEAVES)) {
			return this.random.nextInt(3) == 0 ? Blocks.WARPED_WART_BLOCK.getDefaultState() : Blocks.NETHER_WART_BLOCK.getDefaultState();
		}
		if (state.isIn(BlockTags.REPLACEABLE) || state.isIn(BlockTags.FLOWERS) || state.isOf(Blocks.SNOW)) {
			return Blocks.AIR.getDefaultState();
		}
		if (state.isIn(BlockTags.DIRT) || state.isOf(Blocks.FARMLAND) || state.isOf(Blocks.DIRT_PATH) || state.isOf(Blocks.CLAY)) {
			if (depth == 0) {
				int roll = this.random.nextInt(100);
				if (roll < 18) {
					return Blocks.CRIMSON_NYLIUM.getDefaultState();
				}
				if (roll < 28) {
					return Blocks.SOUL_SOIL.getDefaultState();
				}
				if (roll < 33) {
					return Blocks.MAGMA_BLOCK.getDefaultState();
				}
			}
			return Blocks.NETHERRACK.getDefaultState();
		}
		if (state.isIn(BlockTags.SAND) || state.isOf(Blocks.GRAVEL)) {
			return depth == 0 ? Blocks.SOUL_SAND.getDefaultState() : Blocks.SOUL_SOIL.getDefaultState();
		}
		if (state.isIn(BlockTags.BASE_STONE_OVERWORLD) || state.isOf(Blocks.COBBLESTONE) || state.isOf(Blocks.MOSSY_COBBLESTONE)) {
			return this.random.nextInt(3) == 0 ? Blocks.BLACKSTONE.getDefaultState() : Blocks.NETHERRACK.getDefaultState();
		}
		if (state.isOf(Blocks.ICE) || state.isOf(Blocks.SNOW_BLOCK) || state.isOf(Blocks.PACKED_ICE)) {
			return Blocks.MAGMA_BLOCK.getDefaultState();
		}
		return null;
	}

	@Nullable
	private BlockState toEnd(BlockState state, int depth) {
		if (state.isIn(BlockTags.LOGS)) {
			return Blocks.PURPUR_PILLAR.getDefaultState();
		}
		if (state.isIn(BlockTags.LEAVES) || state.isIn(BlockTags.REPLACEABLE) || state.isIn(BlockTags.FLOWERS) || state.isOf(Blocks.SNOW)) {
			return Blocks.AIR.getDefaultState();
		}
		if (state.isIn(BlockTags.DIRT) || state.isOf(Blocks.FARMLAND) || state.isOf(Blocks.DIRT_PATH) || state.isOf(Blocks.CLAY)
			|| state.isIn(BlockTags.SAND) || state.isOf(Blocks.GRAVEL) || state.isIn(BlockTags.BASE_STONE_OVERWORLD)
			|| state.isOf(Blocks.COBBLESTONE) || state.isOf(Blocks.SNOW_BLOCK) || state.isOf(Blocks.ICE)) {
			if (depth == 0 && this.random.nextInt(40) == 0) {
				return Blocks.PURPUR_BLOCK.getDefaultState();
			}
			if (depth == 0 && this.random.nextInt(60) == 0) {
				return Blocks.OBSIDIAN.getDefaultState();
			}
			return Blocks.END_STONE.getDefaultState();
		}
		return null;
	}

	private void spawnRiftMobs() {
		if (this.convertedColumns.size() < 30) {
			return;
		}
		int cap = Math.min(this.entityCap(), 4 + this.intensity * 3);
		int alive = this.trackedCount() - (this.rift != null && !this.rift.isRemoved() ? 1 : 0);
		int toSpawn = Math.min(1 + this.intensity / 2, cap - alive);
		for (int i = 0; i < toSpawn; i++) {
			double r = this.radius * Math.sqrt(this.random.nextDouble());
			double angle = this.random.nextDouble() * Math.PI * 2.0;
			BlockPos pos = SpawnHelper.surfaceSpawnAt(this.world, this.impact.getX() + MathHelper.floor(Math.cos(angle) * r),
				this.impact.getZ() + MathHelper.floor(Math.sin(angle) * r));
			if (pos == null) {
				continue;
			}
			EntityType<? extends MobEntity> type = this.end ? this.rollEndMob() : this.rollNetherMob();
			MobEntity mob = type.create(this.world, SpawnReason.EVENT);
			if (mob == null) {
				continue;
			}
			mob.refreshPositionAndAngles(pos, this.random.nextFloat() * 360.0F, 0.0F);
			if (this.spawnTrackedMob(mob)) {
				this.world.spawnParticles(this.end ? ParticleTypes.PORTAL : ParticleTypes.FLAME, mob.getX(), mob.getBodyY(0.5), mob.getZ(), 25, 0.4, 0.8, 0.4, 0.1);
			}
		}
	}

	private EntityType<? extends MobEntity> rollNetherMob() {
		int roll = this.random.nextInt(100);
		if (roll < 40) {
			return EntityType.ZOMBIFIED_PIGLIN;
		}
		if (roll < 62) {
			return EntityType.MAGMA_CUBE;
		}
		if (roll < 78) {
			return EntityType.PIGLIN;
		}
		if (roll < 90 && this.intensity >= 3) {
			return EntityType.BLAZE;
		}
		return EntityType.HOGLIN;
	}

	private EntityType<? extends MobEntity> rollEndMob() {
		int roll = this.random.nextInt(100);
		if (roll < 70) {
			return EntityType.ENDERMAN;
		}
		if (roll < 92 || this.intensity < 4) {
			return EntityType.ENDERMITE;
		}
		return EntityType.SHULKER;
	}

	@Override
	protected void onEntityDeath(LivingEntity entity, DamageSource source) {
		if (this.ownsEntity(entity) && source.getAttacker() instanceof PlayerEntity && this.random.nextInt(7) == 0) {
			entity.dropStack(this.world, new ItemStack(ModItems.RIFT_SHARD));
		}
	}

	private boolean ownsEntity(Entity entity) {
		return entity.getCommandTags().contains(ENTITY_TAG) && entity.getEntityWorld() == this.world
			&& this.trackedEntities().contains(entity);
	}

	// ------------------------------------------------------------------------------------------ closing

	@Override
	protected void onAftermathStart() {
		this.playSoundAt(this.riftPos(), ModSounds.RIFT_CLOSE, 10.0F, 0.6F);
		this.actionBarAll(Text.literal("✦ The rift is closing... its creatures are being pulled back!").formatted(Formatting.LIGHT_PURPLE));
		for (Entity entity : this.trackedEntities()) {
			if (entity instanceof LivingEntity living) {
				living.addStatusEffect(new StatusEffectInstance(StatusEffects.LEVITATION, 400, 3, false, false));
			}
		}
		this.maybePlaceCache();
		this.revertTerrain();
	}

	@Override
	protected void tickAftermath() {
		float closing = 1.0F - this.phaseProgress();
		if (this.rift != null) {
			this.rift.setOpenness(Math.max(0.0F, closing));
		}
		Vec3d riftPos = this.riftPos();
		for (Entity entity : this.trackedEntities()) {
			if (entity == this.rift) {
				continue;
			}
			if (entity.getY() > riftPos.y - 8.0) {
				this.world.spawnParticles(ParticleTypes.REVERSE_PORTAL, entity.getX(), entity.getBodyY(0.5), entity.getZ(), 20, 0.3, 0.5, 0.3, 0.1);
				entity.discard();
			}
		}
	}

	@Override
	protected void onEnd(boolean forced) {
		this.revertTerrain();
	}

	@Override
	protected void cleanupEntity(Entity entity) {
		if (entity instanceof RiftEntity) {
			this.farParticles(ParticleTypes.END_ROD, entity.getEntityPos(), 60, 1.5, 8.0, 1.5, 0.15);
			entity.discard();
		} else {
			super.cleanupEntity(entity);
		}
	}

	private void revertTerrain() {
		if (this.reverted || !this.revertEnabled()) {
			return;
		}
		this.reverted = true;
		long[] keys = this.originals.keySet().toLongArray();
		BlockState[] states = this.originals.values().toArray(new BlockState[0]);
		// Restore in batches as essential work: it keeps going (and is flushed on shutdown) even after the event ends.
		for (int i = 0; i < keys.length; i += 16) {
			int from = i;
			int to = Math.min(keys.length, i + 16);
			this.blocks().enqueueEssential(null, () -> {
				for (int j = from; j < to; j++) {
					this.world.setBlockState(BlockPos.fromLong(keys[j]), states[j], Block.NOTIFY_LISTENERS);
				}
				return to - from;
			});
		}
		this.originals.clear();
	}

	/** Rare: a Rift Cache chest with otherworldly loot at the impact point. */
	private void maybePlaceCache() {
		if (this.random.nextFloat() > 0.2F + 0.06F * this.intensity) {
			return;
		}
		BlockPos pos = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, this.impact);
		if (!this.world.isAir(pos)) {
			return;
		}
		this.world.setBlockState(pos, Blocks.CHEST.getDefaultState().with(ChestBlock.FACING, Direction.NORTH), Block.NOTIFY_ALL);
		if (this.world.getBlockEntity(pos) instanceof ChestBlockEntity chest) {
			List<ItemStack> loot = new ArrayList<>();
			loot.add(new ItemStack(ModItems.RIFT_SHARD, 2 + this.random.nextInt(3)));
			if (this.end) {
				loot.add(new ItemStack(Items.ENDER_PEARL, 3 + this.random.nextInt(6)));
				loot.add(new ItemStack(Items.CHORUS_FRUIT, 4 + this.random.nextInt(8)));
				if (this.random.nextInt(3) == 0) {
					loot.add(new ItemStack(Items.SHULKER_SHELL, 1 + this.random.nextInt(2)));
				}
				if (this.random.nextInt(4) == 0) {
					loot.add(new ItemStack(Items.DRAGON_BREATH, 2));
				}
				if (this.random.nextInt(30) == 0) {
					loot.add(new ItemStack(Items.ELYTRA));
				}
			} else {
				loot.add(new ItemStack(Items.GOLD_INGOT, 3 + this.random.nextInt(6)));
				loot.add(new ItemStack(Items.QUARTZ, 6 + this.random.nextInt(10)));
				loot.add(new ItemStack(Items.BLAZE_ROD, 1 + this.random.nextInt(3)));
				if (this.random.nextInt(3) == 0) {
					loot.add(new ItemStack(Items.ANCIENT_DEBRIS));
				}
				if (this.random.nextInt(12) == 0) {
					loot.add(new ItemStack(Items.NETHERITE_SCRAP));
				}
			}
			for (int i = 0; i < loot.size(); i++) {
				chest.setStack(i * 3 % chest.size(), loot.get(i));
			}
		}
		this.farParticles(ParticleTypes.END_ROD, Vec3d.ofCenter(pos), 40, 0.5, 1.0, 0.5, 0.1);
		this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.LIGHT_PURPLE)
			.append(Text.literal("The rift left something behind: a Rift Cache at " + pos.getX() + ", " + pos.getY() + ", " + pos.getZ() + "!")
				.formatted(Formatting.YELLOW)));
	}

}
