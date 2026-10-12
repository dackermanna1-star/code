package com.chaosunleashed.events.kaiju;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.EventContext;
import com.chaosunleashed.core.EventPhase;
import com.chaosunleashed.registry.ModDamageTypes;
import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.entity.Entity;
import net.minecraft.entity.FallingBlockEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.attribute.EntityAttributeInstance;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.particle.BlockStateParticleEffect;
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
import org.jetbrains.annotations.Nullable;

/**
 * Kaiju Attack: a ~100 block monster appears far away and walks in a straight-ish line across the map, passing
 * near the players. Every footstep shakes the screen, booms and leaves a crater; it flattens whatever is in its
 * path, roars (knockback wave) and scorches the land with a breath beam. Very tanky, but its glowing weak points on
 * the legs and back take extra damage. Killed: a massive death animation and rare loot. Not killed: it walks off.
 */
public class KaijuAttackEvent extends ChaosEvent {
	private final Vec3d start;
	private final Vec3d dir;
	private final Vec3d right;
	private final double pathLength;
	private final double speed;
	@Nullable
	private KaijuEntity kaiju;
	private double travelled;
	private double groundY;
	private int stepTimer;
	private boolean leftFoot;
	private int nextRoar;
	private int nextBeam;
	private int beamTicks;
	@Nullable
	private Vec3d beamTarget;
	@Nullable
	private Vec3d beamSweep;
	private boolean killed;

	public KaijuAttackEvent(EventContext context) {
		super(context);
		double angle = this.random.nextDouble() * Math.PI * 2.0;
		Vec3d player = Vec3d.ofBottomCenter(this.origin);
		Vec3d away = new Vec3d(Math.cos(angle), 0.0, Math.sin(angle));
		Vec3d side = new Vec3d(-away.z, 0.0, away.x);
		int view = this.world.getServer().getPlayerManager().getViewDistance() * 16;
		double distance = MathHelper.clamp(view - 24, 56, 150);
		// Find a start point in a loaded chunk.
		Vec3d candidate = player.add(away.multiply(distance));
		while (distance > 40 && !this.world.isChunkLoaded(MathHelper.floor(candidate.x) >> 4, MathHelper.floor(candidate.z) >> 4)) {
			distance -= 8;
			candidate = player.add(away.multiply(distance));
		}
		this.start = candidate;
		// Walk past the player at a safe-ish distance (it's 14 blocks wide).
		Vec3d passBy = player.add(side.multiply((this.random.nextBoolean() ? 1 : -1) * (18 + this.random.nextInt(12))));
		this.dir = passBy.subtract(this.start).multiply(1, 0, 1).normalize();
		this.right = new Vec3d(-this.dir.z, 0.0, this.dir.x);
		this.pathLength = distance * 2.0 + 40.0;
		this.speed = 0.11 + 0.02 * this.intensity;
		this.groundY = this.world.getTopY(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, MathHelper.floor(this.start.x), MathHelper.floor(this.start.z));
	}

	@Override
	public Text warningTitle() {
		return Text.literal("⚠ Something enormous is coming...").formatted(Formatting.DARK_GREEN, Formatting.BOLD);
	}

	@Override
	public Text warningSubtitle() {
		return Text.literal("The ground trembles with every step. Aim for the glowing weak points!").formatted(Formatting.GREEN);
	}

	@Override
	protected SoundEvent warningSound() {
		return ModSounds.KAIJU_WARNING;
	}

	@Override
	public Text bossBarDetail() {
		if (this.kaiju == null || this.phase() != EventPhase.ACTIVE) {
			return null;
		}
		int percent = MathHelper.ceil(this.kaiju.getHealth() / this.kaiju.getMaxHealth() * 100.0F);
		return Text.literal("Kaiju HP " + percent + "%").formatted(Formatting.GREEN);
	}

	private float yaw() {
		return (float) (MathHelper.atan2(this.dir.z, this.dir.x) * MathHelper.DEGREES_PER_RADIAN) - 90.0F;
	}

	// ------------------------------------------------------------------------------------------ warning

	@Override
	protected void tickWarning() {
		// Distant footsteps getting louder.
		if (this.phaseTicks() % 40 == 0) {
			float progress = this.phaseProgress();
			this.playSoundAt(this.start, ModSounds.KAIJU_STEP, 8.0F + progress * 10.0F, 0.5F);
			this.shakeNear(this.start, 260.0, 0.6F + progress * 1.2F, 15);
			this.farParticles(ParticleTypes.CAMPFIRE_COSY_SMOKE, this.start.add(0, this.groundY - this.start.y + 2, 0), 20, 6, 2, 6, 0.05);
		}
	}

	// ------------------------------------------------------------------------------------------ active

	@Override
	protected void onActiveStart() {
		KaijuEntity entity = ModEntities.KAIJU.create(this.world, SpawnReason.EVENT);
		if (entity == null) {
			this.requestEnd();
			return;
		}
		entity.refreshPositionAndAngles(this.start.x, this.groundY, this.start.z, this.yaw(), 0.0F);
		entity.setBodyYaw(this.yaw());
		entity.setHeadYaw(this.yaw());
		EntityAttributeInstance health = entity.getAttributeInstance(EntityAttributes.MAX_HEALTH);
		if (health != null) {
			health.setBaseValue(this.config().kaijuHealth * (0.5 + this.intensity * 0.1));
			entity.setHealth((float) health.getValue());
		}
		entity.setLootTier(this.intensity);
		if (!this.spawnTracked(entity)) {
			this.requestEnd();
			return;
		}
		this.kaiju = entity;
		for (KaijuWeakPointEntity point : entity.createWeakPoints(this.world)) {
			this.spawnTracked(point);
		}
		this.nextRoar = 100;
		this.nextBeam = 300 + this.random.nextInt(200);
		this.roar();
		this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.DARK_GREEN)
			.append(Text.literal("♜ A KAIJU has appeared! Shoot the glowing weak points on its legs and back!").formatted(Formatting.GREEN, Formatting.BOLD)));
	}

	@Override
	protected void tickActive() {
		KaijuEntity entity = this.kaiju;
		if (entity == null || entity.isRemoved()) {
			this.requestAftermath();
			return;
		}
		if (entity.isDead()) {
			return;
		}
		this.walk(entity);
		if (--this.nextRoar <= 0) {
			this.roar();
			this.nextRoar = 400 + this.random.nextInt(240);
		}
		if (this.beamTicks > 0) {
			this.tickBeam(entity);
		} else if (--this.nextBeam <= 0) {
			this.startBeam(entity);
			this.nextBeam = 520 + this.random.nextInt(260) - this.intensity * 40;
		}
		if (this.phaseTicks() % 5 == 0) {
			this.smashPath(entity);
		}
	}

	private void walk(KaijuEntity entity) {
		this.travelled += this.speed;
		Vec3d pos = this.start.add(this.dir.multiply(this.travelled));
		int x = MathHelper.floor(pos.x);
		int z = MathHelper.floor(pos.z);
		if (this.travelled > this.pathLength || !this.world.isChunkLoaded(x >> 4, z >> 4)
			|| !this.world.isChunkLoaded(MathHelper.floor(pos.x + this.dir.x * 20) >> 4, MathHelper.floor(pos.z + this.dir.z * 20) >> 4)) {
			// Walked off into the distance.
			this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.DARK_GREEN)
				.append(Text.literal("♜ The Kaiju lumbers off into the distance...").formatted(Formatting.GRAY)));
			this.requestAftermath();
			return;
		}
		int ground = this.world.getTopY(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, x, z);
		this.groundY = MathHelper.lerp(0.05, this.groundY, ground);
		entity.setPosition(pos.x, this.groundY, pos.z);
		entity.setYaw(this.yaw());
		entity.setBodyYaw(this.yaw());
		entity.setHeadYaw(this.yaw());
		if (++this.stepTimer >= 34) {
			this.stepTimer = 0;
			this.footstep(entity);
		}
	}

	private void footstep(KaijuEntity entity) {
		this.leftFoot = !this.leftFoot;
		Vec3d foot = entity.getEntityPos().add(this.right.multiply(this.leftFoot ? -8.5 : 8.5)).add(this.dir.multiply(3.0));
		int fx = MathHelper.floor(foot.x);
		int fz = MathHelper.floor(foot.z);
		BlockPos ground = new BlockPos(fx, this.world.getTopY(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, fx, fz) - 1, fz);
		Vec3d impact = Vec3d.ofCenter(ground).add(0, 1, 0);
		this.playSoundAt(impact, ModSounds.KAIJU_STEP, 12.0F, 0.5F + this.random.nextFloat() * 0.1F);
		this.shakeNear(impact, 110.0, 3.5F, 16);
		BlockState groundState = this.world.getBlockState(ground);
		if (!groundState.isAir()) {
			this.farParticles(new BlockStateParticleEffect(ParticleTypes.BLOCK, groundState), impact, 80, 4.0, 0.5, 4.0, 0.3);
		}
		this.farParticles(ParticleTypes.EXPLOSION, impact, 6, 3.0, 0.5, 3.0, 0.0);
		this.farParticles(ParticleTypes.CAMPFIRE_COSY_SMOKE, impact, 12, 4.0, 0.5, 4.0, 0.03);
		// Anything under the foot gets crushed and flung.
		for (Entity other : this.world.getOtherEntities(entity, new Box(impact, impact).expand(6.0, 4.0, 6.0), e -> e instanceof LivingEntity && e.isAlive())) {
			if (other instanceof KaijuWeakPointEntity || other instanceof PlayerEntity player && (player.isCreative() || player.isSpectator())) {
				continue;
			}
			other.damage(this.world, ModDamageTypes.of(this.world, ModDamageTypes.KAIJU, entity, entity), 10.0F + this.intensity * 2.0F);
			Vec3d push = other.getEntityPos().subtract(impact).multiply(1, 0, 1).normalize().multiply(1.2).add(0, 0.6, 0);
			other.addVelocity(push);
			other.velocityDirty = true;
			if (other instanceof ServerPlayerEntity player) {
				player.knockedBack = true;
			}
		}
		if (this.blockDamage()) {
			this.crater(ground, 3 + this.intensity / 2);
		}
	}

	private void crater(BlockPos center, int radius) {
		for (int dy = 1; dy >= -radius; dy--) {
			for (int dx = -radius; dx <= radius; dx++) {
				int layer = dy;
				int row = dx;
				this.blocks().enqueue(this, () -> {
					int changed = 0;
					BlockPos.Mutable pos = new BlockPos.Mutable();
					for (int dz = -radius; dz <= radius; dz++) {
						double distance = Math.sqrt(row * row + dz * dz + layer * layer * 2.0);
						if (distance > radius + this.random.nextDouble() * 0.7) {
							continue;
						}
						pos.set(center.getX() + row, center.getY() + layer, center.getZ() + dz);
						BlockState state = this.world.getBlockState(pos);
						if (state.isAir() || !this.canModify(pos, state)) {
							continue;
						}
						this.world.setBlockState(pos, Blocks.AIR.getDefaultState(), Block.NOTIFY_LISTENERS);
						changed++;
					}
					return Math.max(1, changed);
				});
			}
		}
	}

	/** Knock down whatever stands in the Kaiju's way, throwing some debris around. */
	private void smashPath(KaijuEntity entity) {
		if (!this.blockDamage() || this.blocks().pending(this) > 120) {
			return;
		}
		Vec3d front = entity.getEntityPos().add(this.dir.multiply(7.0));
		int height = 36;
		for (int w = -7; w <= 7; w++) {
			int column = w;
			Vec3d at = front.add(this.right.multiply(column));
			int x = MathHelper.floor(at.x);
			int z = MathHelper.floor(at.z);
			int top = this.world.getTopY(Heightmap.Type.MOTION_BLOCKING, x, z);
			int base = MathHelper.floor(this.groundY);
			if (top <= base + 1) {
				continue;
			}
			this.blocks().enqueue(this, () -> {
				int changed = 0;
				BlockPos.Mutable pos = new BlockPos.Mutable();
				int max = Math.min(top, base + height);
				for (int y = max; y > base; y--) {
					pos.set(x, y, z);
					BlockState state = this.world.getBlockState(pos);
					if (state.isAir() || !this.canModify(pos, state)) {
						continue;
					}
					if (this.random.nextInt(14) == 0 && this.trackedCount() < this.entityCap()) {
						FallingBlockEntity debris = FallingBlockEntity.spawnFromBlock(this.world, pos.toImmutable(), state);
						debris.dropItem = false;
						debris.setVelocity(this.right.multiply((this.random.nextDouble() - 0.5) * 1.6).add(this.dir.multiply(0.4)).add(0, 0.5 + this.random.nextDouble() * 0.4, 0));
						this.track(debris);
					} else {
						this.world.setBlockState(pos, Blocks.AIR.getDefaultState(), Block.NOTIFY_LISTENERS);
					}
					changed++;
				}
				return Math.max(1, changed);
			});
		}
	}

	private void roar() {
		KaijuEntity entity = this.kaiju;
		if (entity == null) {
			return;
		}
		entity.setRoarTicks(60);
		Vec3d mouth = entity.getMouthPos();
		this.playSoundAt(mouth, ModSounds.KAIJU_ROAR, 20.0F, 0.5F + this.random.nextFloat() * 0.1F);
		this.shakeNear(entity.getEntityPos(), 180.0, 4.0F, 50);
		this.farParticles(ParticleTypes.SONIC_BOOM, mouth, 3, 2.0, 2.0, 2.0, 0.0);
		// Knockback wave
		Vec3d center = entity.getEntityPos();
		for (Entity other : this.world.getOtherEntities(entity, new Box(center, center).expand(36.0, 20.0, 36.0), e -> e instanceof LivingEntity && e.isAlive())) {
			if (other instanceof KaijuWeakPointEntity || other instanceof PlayerEntity player && (player.isCreative() || player.isSpectator())) {
				continue;
			}
			Vec3d away = other.getEntityPos().subtract(center).multiply(1, 0, 1);
			double distance = Math.max(1.0, away.length());
			double strength = 2.2 * (1.0 - distance / 40.0);
			if (strength <= 0) {
				continue;
			}
			other.addVelocity(away.normalize().multiply(strength).add(0, 0.5 * strength, 0));
			other.velocityDirty = true;
			if (other instanceof ServerPlayerEntity player) {
				player.knockedBack = true;
			}
		}
		this.actionBarAll(Text.literal("♜ The Kaiju ROARS!").formatted(Formatting.DARK_GREEN, Formatting.BOLD));
	}

	private void startBeam(KaijuEntity entity) {
		ServerPlayerEntity target = null;
		double best = 90.0 * 90.0;
		for (ServerPlayerEntity player : this.vulnerablePlayers()) {
			double d = player.squaredDistanceTo(entity);
			if (d < best) {
				best = d;
				target = player;
			}
		}
		Vec3d aim = target != null ? target.getEntityPos() : entity.getEntityPos().add(this.dir.multiply(40.0));
		// Sweep across a line near the target so players can dodge.
		Vec3d sweep = new Vec3d(-(aim.z - entity.getZ()), 0, aim.x - entity.getX()).normalize();
		this.beamTarget = aim.subtract(sweep.multiply(14.0)).add(this.dir.multiply(-6.0));
		this.beamSweep = sweep.multiply(28.0 / 70.0);
		this.beamTicks = 70;
		entity.setBeaming(true);
		this.playSoundAt(entity.getMouthPos(), ModSounds.KAIJU_BEAM, 16.0F, 0.6F);
		this.actionBarAll(Text.literal("♜ BREATH BEAM! Get out of the line of fire!").formatted(Formatting.GOLD, Formatting.BOLD));
	}

	private void tickBeam(KaijuEntity entity) {
		this.beamTicks--;
		if (this.beamTarget == null || this.beamSweep == null) {
			this.beamTicks = 0;
		}
		if (this.beamTicks <= 0) {
			entity.setBeaming(false);
			return;
		}
		this.beamTarget = this.beamTarget.add(this.beamSweep);
		int tx = MathHelper.floor(this.beamTarget.x);
		int tz = MathHelper.floor(this.beamTarget.z);
		Vec3d end = new Vec3d(this.beamTarget.x, this.world.getTopY(Heightmap.Type.MOTION_BLOCKING, tx, tz), this.beamTarget.z);
		Vec3d mouth = entity.getMouthPos();
		// The beam itself: dense sparks along the line (visible from far away).
		Vec3d step = end.subtract(mouth);
		double length = step.length();
		int points = (int) (length / 2.0);
		for (int i = 0; i < points; i++) {
			if ((i + this.beamTicks) % 2 != 0) {
				continue;
			}
			Vec3d p = mouth.add(step.multiply(i / (double) points));
			this.farParticles(ModParticles.BEAM_SPARK, p, 2, 0.3, 0.3, 0.3, 0.02);
		}
		this.farParticles(ParticleTypes.FLAME, end, 25, 1.5, 0.4, 1.5, 0.08);
		this.farParticles(ParticleTypes.LAVA, end, 4, 1.0, 0.2, 1.0, 0.0);
		if (this.beamTicks % 10 == 0) {
			this.playSoundAt(end, ModSounds.KAIJU_BEAM, 6.0F, 0.9F);
		}
		// Burn whatever is hit.
		for (Entity other : this.world.getOtherEntities(entity, new Box(end, end).expand(3.0, 4.0, 3.0), e -> e instanceof LivingEntity && e.isAlive())) {
			if (other instanceof KaijuWeakPointEntity || other instanceof PlayerEntity player && (player.isCreative() || player.isSpectator())) {
				continue;
			}
			other.damage(this.world, this.world.getDamageSources().inFire(), 4.0F + this.intensity);
			other.setOnFireFor(6.0F);
		}
		if (this.blockDamage() && this.beamTicks % 2 == 0) {
			BlockPos center = BlockPos.ofFloored(end).down();
			this.blocks().enqueue(this, () -> this.scorch(center));
		}
	}

	private int scorch(BlockPos center) {
		int changed = 0;
		for (BlockPos pos : BlockPos.iterate(center.add(-1, -1, -1), center.add(1, 0, 1))) {
			BlockState state = this.world.getBlockState(pos);
			if (state.isAir() || !this.canModify(pos, state)) {
				continue;
			}
			BlockState burnt = this.random.nextInt(3) == 0 ? Blocks.MAGMA_BLOCK.getDefaultState()
				: this.random.nextBoolean() ? Blocks.BLACKSTONE.getDefaultState() : Blocks.NETHERRACK.getDefaultState();
			this.world.setBlockState(pos, burnt, Block.NOTIFY_ALL);
			changed++;
			BlockPos above = pos.up();
			if (this.random.nextInt(3) == 0 && this.world.isAir(above)) {
				this.world.setBlockState(above, Blocks.FIRE.getDefaultState(), Block.NOTIFY_ALL);
			}
		}
		return Math.max(1, changed);
	}

	@Override
	protected void onEntityDeath(LivingEntity entity, DamageSource source) {
		if (entity == this.kaiju) {
			this.killed = true;
			this.kaiju.setBeaming(false);
			this.shakeNear(entity.getEntityPos(), 200.0, 5.0F, 100);
			this.playSoundAt(entity.getEntityPos().add(0, 80, 0), ModSounds.KAIJU_DEATH, 24.0F, 0.5F);
			this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.GOLD)
				.append(Text.literal("♜ THE KAIJU HAS FALLEN! Claim its scales and heart!").formatted(Formatting.GOLD, Formatting.BOLD)));
			// Give the death animation time to play out before the aftermath starts.
			this.extendPhase(110);
		}
	}

	// ------------------------------------------------------------------------------------------ ending

	@Override
	protected void tickAftermath() {
		if (this.kaiju != null && !this.kaiju.isRemoved() && !this.kaiju.isDead()) {
			// It walks away during the aftermath.
			this.travelled += this.speed * 2;
			Vec3d pos = this.start.add(this.dir.multiply(this.travelled));
			if (this.world.isChunkLoaded(MathHelper.floor(pos.x) >> 4, MathHelper.floor(pos.z) >> 4)) {
				this.kaiju.setPosition(pos.x, this.groundY, pos.z);
			}
		}
	}

	@Override
	protected void cleanupEntity(Entity entity) {
		if (entity instanceof KaijuEntity kaijuEntity && kaijuEntity.isDead()) {
			return;
		}
		if (entity instanceof FallingBlockEntity) {
			entity.discard();
			return;
		}
		super.cleanupEntity(entity);
	}

	@Override
	protected void onEnd(boolean forced) {
		if (this.kaiju != null) {
			this.kaiju.setBeaming(false);
		}
	}

	public boolean wasKilled() {
		return this.killed;
	}
}
