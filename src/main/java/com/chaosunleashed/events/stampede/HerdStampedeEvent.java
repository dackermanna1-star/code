package com.chaosunleashed.events.stampede;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.EventContext;
import com.chaosunleashed.core.SpawnHelper;
import com.chaosunleashed.registry.ModDamageTypes;
import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import com.chaosunleashed.registry.ModTags;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.CropBlock;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.passive.HorseEntity;
import net.minecraft.entity.passive.PigEntity;
import net.minecraft.entity.passive.SheepEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundEvent;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Herd Stampede: hundreds of cows, horses, pigs, sheep and bison appear at one edge of the area and charge
 * straight across it. A dust cloud and rumble build up as they approach; they trample crops, smash through
 * fences, and knock back and hurt anything in their path, then thunder off the other side and disappear,
 * leaving some drops behind.
 */
public class HerdStampedeEvent extends ChaosEvent {
	private record Runner(MobEntity mob, double speed, float weave) {
	}

	private final Map<UUID, Runner> herd = new LinkedHashMap<>();
	private final Map<UUID, Integer> hitCooldown = new HashMap<>();
	private final LongSet queuedBlocks = new LongOpenHashSet();
	private final Vec3d dir;
	private final Vec3d perp;
	private final Vec3d start;
	private final double travelDistance;
	private final int width;
	private final int herdSize;
	private int spawned;
	private int spawnAttempts;
	private Vec3d centroid;

	public HerdStampedeEvent(EventContext context) {
		super(context);
		double angle = this.random.nextDouble() * Math.PI * 2.0;
		this.dir = new Vec3d(Math.cos(angle), 0.0, Math.sin(angle));
		this.perp = new Vec3d(-this.dir.z, 0.0, this.dir.x);
		int view = this.world.getServer().getPlayerManager().getViewDistance() * 16;
		double distance = MathHelper.clamp(view - 24, 40, 72);
		this.start = Vec3d.ofBottomCenter(this.origin).subtract(this.dir.multiply(distance));
		this.travelDistance = distance * 2.0 + 20.0;
		this.width = Math.min(24 + 8 * (this.intensity - 1), this.config().maxRadius * 2);
		this.herdSize = Math.min(this.config().stampedeMaxAnimals, 40 + 35 * this.intensity);
		this.centroid = this.start;
	}

	@Override
	protected int entityCap() {
		return this.config().stampedeMaxAnimals;
	}

	private String fromDirection() {
		Vec3d from = this.dir.negate();
		double deg = Math.toDegrees(Math.atan2(from.z, from.x));
		String[] names = {"east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"};
		int index = Math.floorMod((int) Math.round(deg / 45.0), 8);
		return names[index];
	}

	@Override
	public Text warningTitle() {
		return Text.literal("⚠ The ground is shaking...").formatted(Formatting.GOLD, Formatting.BOLD);
	}

	@Override
	public Text warningSubtitle() {
		return Text.literal("A stampede is thundering in from the " + this.fromDirection() + "!").formatted(Formatting.YELLOW);
	}

	@Override
	protected SoundEvent warningSound() {
		return ModSounds.STAMPEDE_WARNING;
	}

	@Override
	public Text bossBarDetail() {
		return this.phase() == com.chaosunleashed.core.EventPhase.ACTIVE ? Text.literal("Herd: " + this.herd.size()).formatted(Formatting.GOLD) : null;
	}

	// ------------------------------------------------------------------------------------------ warning

	@Override
	protected void tickWarning() {
		float progress = this.phaseProgress();
		if (this.phaseTicks() % 10 == 0) {
			for (int i = 0; i < 3; i++) {
				Vec3d pos = this.start.add(this.perp.multiply((this.random.nextDouble() - 0.5) * this.width)).add(0, 1.5, 0);
				this.farParticles(ModParticles.DUST_CLOUD, pos, 4 + (int) (progress * 16), 3.0, 1.5, 3.0, 0.02);
			}
		}
		if (this.phaseTicks() % 20 == 0) {
			this.playSoundAt(this.start, ModSounds.STAMPEDE_RUMBLE, 4.0F + progress * 8.0F, 0.6F);
			this.shakeNear(Vec3d.ofCenter(this.origin), 100.0, 0.15F + progress * 0.6F, 20);
		}
	}

	// ------------------------------------------------------------------------------------------ active

	@Override
	protected void onActiveStart() {
		this.actionBarAll(Text.literal("♞ STAMPEDE! Get out of the way!").formatted(Formatting.GOLD, Formatting.BOLD));
	}

	@Override
	protected void tickActive() {
		this.spawnHerd();
		this.moveHerd();
		int t = this.phaseTicks();
		if (t % 3 == 0 && !this.herd.isEmpty()) {
			List<Runner> runners = new ArrayList<>(this.herd.values());
			for (int i = 0; i < 4; i++) {
				MobEntity mob = runners.get(this.random.nextInt(runners.size())).mob();
				this.world.spawnParticles(ModParticles.DUST_CLOUD, mob.getX(), mob.getY() + 0.4, mob.getZ(), 2, 0.8, 0.3, 0.8, 0.02);
			}
			MobEntity lead = runners.get(this.random.nextInt(runners.size())).mob();
			this.farParticles(ModParticles.DUST_CLOUD, lead.getEntityPos().add(0, 1.0, 0), 2, 1.5, 0.6, 1.5, 0.02);
		}
		if (t % 15 == 0 && !this.herd.isEmpty()) {
			this.playSoundAt(this.centroid, ModSounds.STAMPEDE_RUMBLE, 6.0F, 0.55F + this.random.nextFloat() * 0.1F);
			this.shakeNear(this.centroid, 45.0, 1.4F, 20);
		}
		if (this.spawned >= this.herdSize && this.herd.isEmpty() && t > 100) {
			this.requestAftermath();
		}
	}

	private void spawnHerd() {
		int perTick = Math.max(1, MathHelper.ceil(this.herdSize / 60.0F));
		int rowCapacity = Math.max(4, this.width / 2);
		for (int i = 0; i < perTick && this.spawned < this.herdSize && this.spawnAttempts < this.herdSize * 3; i++) {
			this.spawnAttempts++;
			int row = this.spawned / rowCapacity;
			double lateral = (this.random.nextDouble() - 0.5) * this.width;
			double back = row * 2.2 + this.random.nextDouble() * 1.5;
			Vec3d pos = this.start.subtract(this.dir.multiply(back)).add(this.perp.multiply(lateral));
			BlockPos ground = SpawnHelper.surfaceSpawnAt(this.world, MathHelper.floor(pos.x), MathHelper.floor(pos.z));
			if (ground == null) {
				continue;
			}
			MobEntity mob = this.createAnimal();
			if (mob == null) {
				continue;
			}
			float yaw = (float) (MathHelper.atan2(this.dir.z, this.dir.x) * MathHelper.DEGREES_PER_RADIAN) - 90.0F;
			mob.refreshPositionAndAngles(pos.x, ground.getY(), pos.z, yaw, 0.0F);
			mob.setAiDisabled(true);
			mob.setPersistent();
			if (this.spawnTracked(mob)) {
				this.spawned++;
				double speed = 0.30 + this.random.nextDouble() * 0.08 + this.intensity * 0.015;
				this.herd.put(mob.getUuid(), new Runner(mob, speed, this.random.nextFloat() * MathHelper.TAU));
			}
		}
	}

	private MobEntity createAnimal() {
		int roll = this.random.nextInt(100);
		EntityType<? extends MobEntity> type;
		if (roll < 35) {
			type = ModEntities.BISON;
		} else if (roll < 60) {
			type = EntityType.COW;
		} else if (roll < 75) {
			type = EntityType.HORSE;
		} else if (roll < 87) {
			type = EntityType.PIG;
		} else {
			type = EntityType.SHEEP;
		}
		return type.create(this.world, SpawnReason.EVENT);
	}

	private void moveHerd() {
		double sumX = 0;
		double sumY = 0;
		double sumZ = 0;
		int count = 0;
		float yaw = (float) (MathHelper.atan2(this.dir.z, this.dir.x) * MathHelper.DEGREES_PER_RADIAN) - 90.0F;
		Iterator<Map.Entry<UUID, Runner>> iterator = this.herd.entrySet().iterator();
		while (iterator.hasNext()) {
			Runner runner = iterator.next().getValue();
			MobEntity mob = runner.mob();
			if (mob.isRemoved() || !mob.isAlive()) {
				iterator.remove();
				continue;
			}
			double progress = mob.getEntityPos().subtract(this.start).dotProduct(this.dir);
			if (progress > this.travelDistance || !this.isChunkLoaded(mob.getBlockPos().add(MathHelper.floor(this.dir.x * 16), 0, MathHelper.floor(this.dir.z * 16)))) {
				if (progress > this.travelDistance * 0.5) {
					this.leaveDrops(mob);
				}
				this.forget(mob.getUuid());
				mob.discard();
				iterator.remove();
				continue;
			}
			double weave = MathHelper.sin(mob.age * 0.15F + runner.weave()) * 0.05;
			Vec3d velocity = mob.getVelocity();
			double vy = velocity.y;
			if (mob.horizontalCollision && mob.isOnGround()) {
				vy = 0.45;
			} else if (mob.isTouchingWater()) {
				vy = 0.06;
			}
			mob.setVelocity(this.dir.x * runner.speed() + this.perp.x * weave, vy, this.dir.z * runner.speed() + this.perp.z * weave);
			mob.setYaw(yaw);
			mob.setBodyYaw(yaw);
			mob.setHeadYaw(yaw);
			if ((mob.age + mob.getId()) % 4 == 0) {
				this.trample(mob);
				this.ram(mob);
			}
			sumX += mob.getX();
			sumY += mob.getY();
			sumZ += mob.getZ();
			count++;
		}
		if (count > 0) {
			this.centroid = new Vec3d(sumX / count, sumY / count, sumZ / count);
		}
		this.hitCooldown.replaceAll((uuid, ticks) -> ticks - 1);
		this.hitCooldown.values().removeIf(ticks -> ticks <= 0);
	}

	/** Crops, flowers, fences and gates under or right in front of the animal get flattened. */
	private void trample(MobEntity mob) {
		if (!this.blockDamage() || this.blocks().pending(this) > 200) {
			return;
		}
		BlockPos feet = mob.getBlockPos();
		BlockPos ahead = BlockPos.ofFloored(mob.getX() + this.dir.x * 1.2, mob.getY(), mob.getZ() + this.dir.z * 1.2);
		for (BlockPos pos : new BlockPos[] {feet, ahead, ahead.up()}) {
			BlockState state = this.world.getBlockState(pos);
			if (!state.isIn(ModTags.STAMPEDE_TRAMPLES) || !this.canModify(pos, state) || !this.queuedBlocks.add(pos.asLong())) {
				continue;
			}
			BlockPos target = pos.toImmutable();
			this.blocks().enqueue(this, () -> {
				BlockState current = this.world.getBlockState(target);
				if (!current.isIn(ModTags.STAMPEDE_TRAMPLES)) {
					return 1;
				}
				boolean crop = current.getBlock() instanceof CropBlock;
				this.world.breakBlock(target, this.random.nextInt(4) == 0);
				if (crop && this.world.getBlockState(target.down()).isOf(Blocks.FARMLAND)) {
					this.world.setBlockState(target.down(), Blocks.DIRT.getDefaultState(), Block.NOTIFY_ALL);
				}
				return 1;
			});
		}
	}

	/** Anything in the way gets hurt and thrown forward. */
	private void ram(MobEntity mob) {
		for (Entity other : this.world.getOtherEntities(mob, mob.getBoundingBox().expand(0.4, 0.0, 0.4), entity -> entity instanceof LivingEntity && entity.isAlive())) {
			if (this.herd.containsKey(other.getUuid()) || this.hitCooldown.containsKey(other.getUuid())) {
				continue;
			}
			if (other instanceof PlayerEntity player && (player.isCreative() || player.isSpectator())) {
				continue;
			}
			LivingEntity living = (LivingEntity) other;
			living.damage(this.world, ModDamageTypes.of(this.world, ModDamageTypes.STAMPEDE), 2.0F + this.intensity);
			living.addVelocity(this.dir.x * 1.3, 0.45, this.dir.z * 1.3);
			living.velocityDirty = true;
			if (living instanceof ServerPlayerEntity player) {
				player.knockedBack = true;
				this.shake(player, 2.5F, 15);
			}
			this.hitCooldown.put(other.getUuid(), 3);
		}
	}

	private void leaveDrops(MobEntity mob) {
		if (this.random.nextInt(4) != 0) {
			return;
		}
		List<ItemStack> drops = new ArrayList<>();
		if (mob instanceof PigEntity) {
			drops.add(new ItemStack(Items.PORKCHOP, 1 + this.random.nextInt(2)));
		} else if (mob instanceof SheepEntity) {
			drops.add(new ItemStack(Items.WHITE_WOOL));
			drops.add(new ItemStack(Items.MUTTON));
		} else if (mob instanceof HorseEntity) {
			drops.add(new ItemStack(Items.LEATHER, 1 + this.random.nextInt(2)));
		} else {
			drops.add(new ItemStack(Items.LEATHER, 1 + this.random.nextInt(2)));
			drops.add(new ItemStack(Items.BEEF, 1 + this.random.nextInt(2)));
		}
		for (ItemStack stack : drops) {
			mob.dropStack(this.world, stack);
		}
	}

	// ------------------------------------------------------------------------------------------ after

	@Override
	protected void onAftermathStart() {
		this.actionBarAll(Text.literal("♞ The stampede has passed. The dust settles...").formatted(Formatting.YELLOW));
	}

	@Override
	protected void tickAftermath() {
		if (this.phaseTicks() % 5 == 0) {
			this.world.spawnParticles(ModParticles.DUST_CLOUD, this.centroid.x, this.centroid.y + 1, this.centroid.z, 3, 6, 1, 6, 0.01);
		}
	}

	@Override
	protected void onEnd(boolean forced) {
		this.herd.clear();
	}
}
