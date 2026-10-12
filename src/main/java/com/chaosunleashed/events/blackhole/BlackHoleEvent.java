package com.chaosunleashed.events.blackhole;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.EventContext;
import com.chaosunleashed.core.EventPhase;
import com.chaosunleashed.registry.ModDamageTypes;
import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import com.chaosunleashed.registry.ModTags;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.entity.BeaconBlockEntity;
import net.minecraft.block.entity.BlockEntity;
import net.minecraft.entity.Entity;
import net.minecraft.entity.ExperienceOrbEntity;
import net.minecraft.entity.FallingBlockEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundEvent;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import net.minecraft.world.chunk.WorldChunk;
import org.jetbrains.annotations.Nullable;

/**
 * Black Hole: a small black sphere with a swirling accretion disk appears near the players. It pulls in entities
 * and loose blocks (blocks break off and fly into it as falling blocks, then vanish) and grows every few
 * seconds up to a hard cap. Stop it by throwing a Stabilizer Core into it or by placing beacons around it;
 * otherwise it collapses when the timer runs out and leaves a crater.
 */
public class BlackHoleEvent extends ChaosEvent {
	private final Vec3d center;
	private final float maxCore;
	@Nullable
	private BlackHoleEntity hole;
	private float core = 1.0F;
	private boolean stabilized;
	private int beaconsFound;
	private String stabilizedBy = "";

	public BlackHoleEvent(EventContext context) {
		super(context);
		double angle = this.random.nextDouble() * Math.PI * 2.0;
		double distance = 22 + this.random.nextInt(10);
		int x = this.origin.getX() + MathHelper.floor(Math.cos(angle) * distance);
		int z = this.origin.getZ() + MathHelper.floor(Math.sin(angle) * distance);
		BlockPos ground = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, 0, z));
		this.center = Vec3d.ofCenter(ground).add(0, 7 + this.random.nextInt(3), 0);
		this.maxCore = (float) Math.min(this.config().blackHoleMaxCoreRadius, 1.5 + this.intensity * 0.75);
	}

	private double pullRadius() {
		return Math.min(40.0, this.core * 6.0 + 6.0);
	}

	private double pullStrength() {
		return 0.035 + 0.012 * this.core + 0.004 * this.intensity;
	}

	@Override
	public Text warningTitle() {
		return Text.literal("⚠ Space is collapsing...").formatted(Formatting.DARK_PURPLE, Formatting.BOLD);
	}

	@Override
	public Text warningSubtitle() {
		return Text.literal("A singularity is forming. Prepare a Stabilizer Core or beacons!").formatted(Formatting.LIGHT_PURPLE);
	}

	@Override
	protected SoundEvent warningSound() {
		return ModSounds.BLACK_HOLE_WARNING;
	}

	@Override
	public float clientValue() {
		return this.core;
	}

	@Override
	public BlockPos clientPos() {
		return BlockPos.ofFloored(this.center);
	}

	@Override
	public Text bossBarDetail() {
		if (this.phase() != EventPhase.ACTIVE) {
			return null;
		}
		return Text.literal(String.format("Core %.1fm · Beacons %d/%d", this.core, this.beaconsFound, this.config().blackHoleBeaconsRequired))
			.formatted(Formatting.LIGHT_PURPLE);
	}

	// ------------------------------------------------------------------------------------------ warning

	@Override
	protected void tickWarning() {
		float progress = this.phaseProgress();
		if (this.phaseTicks() % 2 == 0) {
			double spread = 6.0 - progress * 4.0;
			this.farParticles(ParticleTypes.REVERSE_PORTAL, this.center, 6 + (int) (progress * 20), spread, spread, spread, 0.02);
			this.farParticles(ModParticles.VOID_SWIRL, this.center, 2, 0.5, 0.5, 0.5, 0.0);
		}
		if (this.phaseTicks() % 40 == 0) {
			this.playSoundAt(this.center, ModSounds.BLACK_HOLE_HUM, 2.0F + progress * 3.0F, 0.5F + progress * 0.3F);
		}
		int secondsLeft = this.remainingTicks() / 20;
		if (this.remainingTicks() % 20 == 0 && secondsLeft <= 5 && secondsLeft > 0) {
			this.actionBarAll(Text.literal("◉ Singularity forming in " + secondsLeft + "...").formatted(Formatting.LIGHT_PURPLE));
		}
	}

	// ------------------------------------------------------------------------------------------ active

	@Override
	protected void onActiveStart() {
		BlackHoleEntity entity = ModEntities.BLACK_HOLE.create(this.world, SpawnReason.EVENT);
		if (entity != null) {
			entity.refreshPositionAndAngles(this.center.x, this.center.y, this.center.z, 0.0F, 0.0F);
			entity.setRadius(this.core);
			if (this.spawnTracked(entity)) {
				this.hole = entity;
			}
		}
		this.playSoundAt(this.center, ModSounds.BLACK_HOLE_COLLAPSE, 6.0F, 1.4F);
		this.farParticles(ParticleTypes.SONIC_BOOM, this.center, 1, 0, 0, 0, 0);
		this.shakeNear(this.center, 80.0, 2.0F, 25);
		this.actionBarAll(Text.literal("◉ A BLACK HOLE has formed! Throw a Stabilizer Core in or surround it with beacons!")
			.formatted(Formatting.DARK_PURPLE, Formatting.BOLD));
	}

	@Override
	protected void tickActive() {
		int t = this.phaseTicks();
		int growEvery = this.config().blackHoleGrowthIntervalSeconds * 20;
		if (t % growEvery == 0 && t > 0 && this.core < this.maxCore) {
			this.core = Math.min(this.maxCore, this.core + 0.5F);
			this.playSoundAt(this.center, ModSounds.BLACK_HOLE_HUM, 4.0F + this.core, 0.4F);
			this.shakeNear(this.center, this.pullRadius() * 2.0, 1.0F, 15);
		}
		if (this.hole != null) {
			this.hole.setRadius(this.core);
		}
		if (t % 40 == 0) {
			this.playSoundAt(this.center, ModSounds.BLACK_HOLE_HUM, 3.0F + this.core, 0.5F);
		}
		this.pullEntities();
		if (this.blockDamage() && t % 2 == 0) {
			this.ripBlocks();
		}
		if (t % 20 == 0) {
			this.checkBeacons();
		}
		if (t % 10 == 0) {
			for (ServerPlayerEntity player : this.playersNear(this.center, this.pullRadius() * 1.5)) {
				this.shake(player, 0.4F + this.core * 0.15F, 12);
			}
		}
	}

	private void pullEntities() {
		double radius = this.pullRadius();
		double strength = this.pullStrength();
		double killRadius = this.core + 0.6;
		Box box = new Box(this.center, this.center).expand(radius);
		for (Entity entity : this.world.getOtherEntities(this.hole, box, Entity::isAlive)) {
			if (entity instanceof BlackHoleEntity) {
				continue;
			}
			if (entity instanceof PlayerEntity player && (player.isCreative() || player.isSpectator())) {
				continue;
			}
			Vec3d toCenter = this.center.subtract(entity.getEntityPos().add(0, entity.getHeight() * 0.5, 0));
			double distance = toCenter.length();
			if (distance > radius) {
				continue;
			}
			if (entity instanceof StabilizerCoreEntity && distance < killRadius + 2.5) {
				this.stabilize("a Stabilizer Core");
				entity.discard();
				return;
			}
			if (distance < killRadius) {
				this.devour(entity);
				continue;
			}
			double falloff = 1.0 - distance / radius;
			Vec3d pull = toCenter.normalize().multiply(strength * (0.35 + falloff * 1.4));
			// A little swirl makes it look like an accretion disk.
			Vec3d swirl = new Vec3d(-toCenter.z, 0, toCenter.x).normalize().multiply(strength * 0.4 * falloff);
			if (entity instanceof ServerPlayerEntity player) {
				if (this.phaseTicks() % 2 == 0) {
					player.addVelocity(pull.add(swirl).multiply(2.0));
					player.knockedBack = true;
				}
			} else {
				entity.addVelocity(pull.add(swirl));
				entity.velocityDirty = true;
				if (entity instanceof FallingBlockEntity falling) {
					falling.timeFalling = 1;
				}
			}
			if (entity instanceof LivingEntity living) {
				living.fallDistance = 0.0;
			}
		}
	}

	private void devour(Entity entity) {
		if (entity instanceof LivingEntity living) {
			living.damage(this.world, ModDamageTypes.of(this.world, ModDamageTypes.BLACK_HOLE), 4.0F + this.intensity);
			this.world.spawnParticles(ParticleTypes.REVERSE_PORTAL, living.getX(), living.getBodyY(0.5), living.getZ(), 8, 0.3, 0.3, 0.3, 0.2);
			return;
		}
		this.world.spawnParticles(ModParticles.VOID_SWIRL, entity.getX(), entity.getY(), entity.getZ(), 6, 0.2, 0.2, 0.2, 0.1);
		if (entity instanceof ExperienceOrbEntity || entity instanceof FallingBlockEntity || !(entity instanceof PlayerEntity)) {
			entity.discard();
		}
	}

	/** Blocks near the hole break off and fly into it. */
	private void ripBlocks() {
		if (this.blocks().pending(this) > 6 || this.trackedCount() >= this.entityCap()) {
			return;
		}
		double reach = Math.min(this.pullRadius() * 0.75, 28.0);
		int attempts = 1 + (int) this.core;
		for (int i = 0; i < attempts; i++) {
			int x = MathHelper.floor(this.center.x + (this.random.nextDouble() * 2 - 1) * reach);
			int z = MathHelper.floor(this.center.z + (this.random.nextDouble() * 2 - 1) * reach);
			BlockPos top = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, new BlockPos(x, 0, z)).down();
			if (!this.isChunkLoaded(top)) {
				continue;
			}
			double distance = Vec3d.ofCenter(top).distanceTo(this.center);
			if (distance > reach) {
				continue;
			}
			BlockState state = this.world.getBlockState(top);
			boolean close = distance < this.core * 3.5;
			if ((!close && !state.isIn(ModTags.LOOSE_BLOCKS)) || !this.canModify(top, state)) {
				continue;
			}
			this.blocks().enqueue(this, () -> {
				BlockState current = this.world.getBlockState(top);
				if (current != state || this.stabilized || this.phase() != EventPhase.ACTIVE) {
					return 1;
				}
				FallingBlockEntity falling = FallingBlockEntity.spawnFromBlock(this.world, top, current);
				falling.setNoGravity(true);
				falling.dropItem = false;
				falling.setVelocity(0.0, 0.25, 0.0);
				this.track(falling);
				this.world.spawnParticles(ParticleTypes.REVERSE_PORTAL, top.getX() + 0.5, top.getY() + 0.5, top.getZ() + 0.5, 6, 0.4, 0.4, 0.4, 0.05);
				return 1;
			});
		}
	}

	/** Enough beacons around the singularity stabilize it. Scans block entities in nearby chunks. */
	private void checkBeacons() {
		int found = 0;
		int range = 20;
		int minCx = MathHelper.floor(this.center.x - range) >> 4;
		int maxCx = MathHelper.floor(this.center.x + range) >> 4;
		int minCz = MathHelper.floor(this.center.z - range) >> 4;
		int maxCz = MathHelper.floor(this.center.z + range) >> 4;
		for (int cx = minCx; cx <= maxCx; cx++) {
			for (int cz = minCz; cz <= maxCz; cz++) {
				if (!this.world.isChunkLoaded(cx, cz)) {
					continue;
				}
				WorldChunk chunk = this.world.getChunk(cx, cz);
				for (BlockEntity blockEntity : chunk.getBlockEntities().values()) {
					if (blockEntity instanceof BeaconBlockEntity
						&& Vec3d.ofCenter(blockEntity.getPos()).squaredDistanceTo(this.center) <= range * range * 1.2) {
						found++;
					}
				}
			}
		}
		this.beaconsFound = found;
		if (found >= this.config().blackHoleBeaconsRequired) {
			this.stabilize(found + " beacons");
		}
	}

	private void stabilize(String by) {
		if (this.stabilized) {
			return;
		}
		this.stabilized = true;
		this.stabilizedBy = by;
		this.requestAftermath();
	}

	// ------------------------------------------------------------------------------------------ ending

	@Override
	protected void onAftermathStart() {
		// Release everything that was being pulled in.
		for (Entity entity : this.trackedEntities()) {
			if (entity instanceof FallingBlockEntity falling) {
				falling.discard();
			}
		}
		if (this.stabilized) {
			this.playSoundAt(this.center, ModSounds.BLACK_HOLE_STABILIZE, 6.0F, 0.8F);
			this.farParticles(ParticleTypes.END_ROD, this.center, 120, 1.0, 1.0, 1.0, 0.4);
			this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.DARK_PURPLE)
				.append(Text.literal("◉ The black hole was stabilized by " + this.stabilizedBy + " and fizzles out safely!").formatted(Formatting.GREEN)));
			// Reward: the stabilized singularity leaves some exotic matter behind.
			BlockPos ground = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, BlockPos.ofFloored(this.center));
			Vec3d drop = Vec3d.ofCenter(ground);
			net.minecraft.entity.ItemEntity echo = new net.minecraft.entity.ItemEntity(this.world, drop.x, drop.y, drop.z,
				new ItemStack(Items.ECHO_SHARD, 2 + this.random.nextInt(3)));
			this.world.spawnEntity(echo);
			ExperienceOrbEntity.spawn(this.world, drop, 40 + this.intensity * 20);
		} else {
			this.playSoundAt(this.center, ModSounds.BLACK_HOLE_COLLAPSE, 10.0F, 0.6F);
			this.farParticles(ParticleTypes.EXPLOSION_EMITTER, this.center, 3, 1.5, 1.5, 1.5, 0.0);
			this.farParticles(ParticleTypes.SONIC_BOOM, this.center, 3, 1.0, 1.0, 1.0, 0.0);
			this.shakeNear(this.center, 120.0, 3.5F, 40);
			this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.DARK_PURPLE)
				.append(Text.literal("◉ The black hole collapsed!").formatted(Formatting.RED)));
			this.blastShockwave();
			if (this.blockDamage()) {
				this.carveCrater();
			}
		}
	}

	@Override
	protected void tickAftermath() {
		float shrink = 1.0F - this.phaseProgress();
		if (this.hole != null) {
			this.hole.setRadius(Math.max(0.05F, this.core * shrink * shrink));
			if (shrink < 0.05F) {
				this.hole.discard();
			}
		}
	}

	private void blastShockwave() {
		double radius = this.pullRadius() * 1.5;
		for (Entity entity : this.world.getOtherEntities(this.hole, new Box(this.center, this.center).expand(radius), Entity::isAlive)) {
			if (entity instanceof PlayerEntity player && (player.isCreative() || player.isSpectator())) {
				continue;
			}
			Vec3d away = entity.getEntityPos().subtract(this.center);
			double distance = Math.max(1.0, away.length());
			Vec3d push = away.normalize().multiply(2.5 * (1.0 - distance / radius)).add(0, 0.6, 0);
			entity.addVelocity(push);
			entity.velocityDirty = true;
			if (entity instanceof ServerPlayerEntity player) {
				player.knockedBack = true;
			}
		}
	}

	/** Bowl-shaped crater under the collapsed singularity, carved through the block queue. */
	private void carveCrater() {
		BlockPos ground = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, BlockPos.ofFloored(this.center));
		int radius = Math.min(this.config().maxRadius, (int) (3 + this.core * 1.8));
		Vec3d bowl = Vec3d.ofCenter(ground).add(0, radius * 0.4, 0);
		// One queued operation per row so the per-tick block budget is respected.
		for (int dy = radius; dy >= -radius; dy--) {
			for (int dx = -radius; dx <= radius; dx++) {
				int layer = dy;
				int row = dx;
				// Owner null: the crater is the collapse's result and finishes even after the event ends.
				this.blocks().enqueue(null, () -> {
					int changed = 0;
					BlockPos.Mutable pos = new BlockPos.Mutable();
					for (int dz = -radius; dz <= radius; dz++) {
						pos.set(ground.getX() + row, ground.getY() + layer, ground.getZ() + dz);
						double distance = Vec3d.ofCenter(pos).distanceTo(bowl);
						if (distance > radius + this.random.nextDouble() * 0.8) {
							continue;
						}
						BlockState state = this.world.getBlockState(pos);
						if (state.isAir() || !this.canModify(pos, state)) {
							continue;
						}
						boolean rim = distance > radius - 1.2;
						this.world.setBlockState(pos, rim && this.random.nextInt(3) == 0 ? Blocks.OBSIDIAN.getDefaultState() : Blocks.AIR.getDefaultState(),
							Block.NOTIFY_LISTENERS);
						changed++;
					}
					return Math.max(1, changed);
				});
			}
		}
	}

	@Override
	protected void cleanupEntity(Entity entity) {
		if (entity instanceof FallingBlockEntity) {
			entity.discard();
		} else {
			super.cleanupEntity(entity);
		}
	}
}
