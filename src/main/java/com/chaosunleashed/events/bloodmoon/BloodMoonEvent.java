package com.chaosunleashed.events.bloodmoon;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.EventContext;
import com.chaosunleashed.core.SpawnHelper;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import com.chaosunleashed.registry.ModTags;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.ChestBlock;
import net.minecraft.block.entity.ChestBlockEntity;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.attribute.EntityAttributeInstance;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.mob.ZombieEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.particle.DustParticleEffect;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.rule.GameRules;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.WorldEvents;
import net.minecraft.world.WorldProperties;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Blood Moon (Zombie Apocalypse): only at night. The moon and sky turn blood red with red fog, zombies spawn ten
 * times faster around players, include runners, armored brutes and screamers (which call more zombies), and they
 * smash through doors, glass, wood, dirt and leaves with visible crack progress. Ends at sunrise, when the zombies
 * burn; everyone who survived the night gets a reward chest at their spawn point.
 */
public class BloodMoonEvent extends ChaosEvent {
	private static final String RUNNER = "chaosunleashed.runner";
	private static final String BRUTE = "chaosunleashed.brute";
	private static final String SCREAMER = "chaosunleashed.screamer";
	private static final DustParticleEffect BLOOD_DUST = new DustParticleEffect(0xB00000, 1.6F);

	private static final class BreakState {
		BlockPos pos;
		int ticks;
		int needed;
	}

	private final Map<UUID, BreakState> breaking = new HashMap<>();
	private final Map<UUID, Vec3d> lastPositions = new HashMap<>();
	private final Map<UUID, Integer> stuckTicks = new HashMap<>();
	private final Set<UUID> survivors = new HashSet<>();
	private final Set<UUID> fallen = new HashSet<>();

	public BloodMoonEvent(EventContext context) {
		super(context);
	}

	@Override
	public Text warningTitle() {
		return Text.literal("⚠ The moon is bleeding...").formatted(Formatting.DARK_RED, Formatting.BOLD);
	}

	@Override
	public Text warningSubtitle() {
		return Text.literal("The dead will rise in hordes. Barricade your doors.").formatted(Formatting.RED);
	}

	@Override
	protected SoundEvent warningSound() {
		return ModSounds.BLOOD_MOON_WARNING;
	}

	/** Lasts until sunrise (or the configured duration if time doesn't advance). */
	@Override
	protected int activeLength() {
		boolean timeAdvances = this.world.getGameRules().getValue(GameRules.ADVANCE_TIME);
		if (!timeAdvances) {
			return super.activeLength();
		}
		long time = Math.floorMod(this.world.getTimeOfDay(), 24000L);
		long untilSunrise = Math.floorMod(23000L - time, 24000L);
		return (int) Math.max(600L, untilSunrise);
	}

	@Override
	public Text bossBarDetail() {
		return Text.literal("Survive until sunrise").formatted(Formatting.GRAY);
	}

	// ------------------------------------------------------------------------------------------ warning

	@Override
	protected void tickWarning() {
		if (this.phaseTicks() % 10 == 0) {
			for (ServerPlayerEntity player : this.players()) {
				this.world.spawnParticles(ModParticles.BLOOD_MIST, player.getX(), player.getY() + 1, player.getZ(),
					2 + (int) (this.phaseProgress() * 8), 10, 2, 10, 0.01);
			}
		}
		if (this.phaseTicks() % 80 == 40) {
			for (ServerPlayerEntity player : this.players()) {
				Vec3d away = player.getEntityPos().add(this.random.nextBetween(-30, 30), 0, this.random.nextBetween(-30, 30));
				this.world.playSound(null, away.x, away.y, away.z, ModSounds.ZOMBIE_SCREAM, SoundCategory.HOSTILE, 2.0F, 0.6F);
			}
		}
	}

	// ------------------------------------------------------------------------------------------ active

	@Override
	protected void onActiveStart() {
		this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.DARK_RED)
			.append(Text.literal("☾ The Blood Moon has risen! Survive until sunrise for a reward.").formatted(Formatting.RED)));
		for (ServerPlayerEntity player : this.vulnerablePlayers()) {
			this.survivors.add(player.getUuid());
		}
	}

	@Override
	protected void onEntityDeath(LivingEntity entity, DamageSource source) {
		if (entity instanceof ServerPlayerEntity player && this.phase() == com.chaosunleashed.core.EventPhase.ACTIVE) {
			this.fallen.add(player.getUuid());
		}
	}

	@Override
	protected void tickActive() {
		long time = Math.floorMod(this.world.getTimeOfDay(), 24000L);
		if (time >= 23000L || time < 12000L) {
			this.requestAftermath();
			return;
		}
		// Late joiners still count as survivors if they make it.
		for (ServerPlayerEntity player : this.vulnerablePlayers()) {
			this.survivors.add(player.getUuid());
		}
		int t = this.phaseTicks();
		if (t % 40 == 0) {
			this.spawnWave();
		}
		if (t % 20 == 5) {
			this.tickScreamers();
		}
		if (t % 5 == 0) {
			this.tickSiege();
		}
		if (t % 10 == 0) {
			for (ServerPlayerEntity player : this.players()) {
				this.world.spawnParticles(ModParticles.BLOOD_MIST, player.getX(), player.getY() + 1, player.getZ(), 6, 14, 3, 14, 0.01);
			}
		}
	}

	private int zombieCap() {
		return Math.min(this.entityCap(), 30 + 15 * this.intensity);
	}

	private void spawnWave() {
		int alive = this.trackedCount();
		int cap = this.zombieCap();
		int perPlayer = Math.max(1, Math.round(this.config().bloodMoonZombiesPerWave * this.intensity / 3.0F));
		for (ServerPlayerEntity player : this.vulnerablePlayers()) {
			for (int i = 0; i < perPlayer && alive < cap; i++) {
				BlockPos pos = SpawnHelper.findSurfaceSpawn(this.world, player.getBlockPos(), 22, 44, this.random);
				if (pos != null && this.spawnZombie(pos, player, this.rollVariant()) != null) {
					alive++;
				}
			}
		}
	}

	private String rollVariant() {
		int roll = this.random.nextInt(100);
		if (roll < 6 + this.intensity) {
			return SCREAMER;
		}
		if (roll < 18 + this.intensity * 2) {
			return BRUTE;
		}
		if (roll < 36 + this.intensity * 3) {
			return RUNNER;
		}
		return "";
	}

	@Nullable
	private ZombieEntity spawnZombie(BlockPos pos, @Nullable LivingEntity target, String variant) {
		ZombieEntity zombie = EntityType.ZOMBIE.create(this.world, SpawnReason.EVENT);
		if (zombie == null) {
			return null;
		}
		zombie.refreshPositionAndAngles(pos, this.random.nextFloat() * 360.0F, 0.0F);
		if (!this.spawnTrackedMob(zombie)) {
			return null;
		}
		// No vanilla reinforcements: they would not be tracked and could outlive the event.
		setBase(zombie, EntityAttributes.SPAWN_REINFORCEMENTS, 0.0);
		setBase(zombie, EntityAttributes.FOLLOW_RANGE, 64.0);
		switch (variant) {
			case RUNNER -> {
				zombie.addCommandTag(RUNNER);
				setBase(zombie, EntityAttributes.MOVEMENT_SPEED, 0.36);
				zombie.equipStack(EquipmentSlot.FEET, new ItemStack(Items.LEATHER_BOOTS));
			}
			case BRUTE -> {
				zombie.addCommandTag(BRUTE);
				setBase(zombie, EntityAttributes.SCALE, 1.35);
				setBase(zombie, EntityAttributes.MAX_HEALTH, 40.0);
				setBase(zombie, EntityAttributes.ATTACK_DAMAGE, 6.0);
				setBase(zombie, EntityAttributes.KNOCKBACK_RESISTANCE, 0.6);
				setBase(zombie, EntityAttributes.MOVEMENT_SPEED, 0.2);
				zombie.setHealth(40.0F);
				zombie.equipStack(EquipmentSlot.CHEST, new ItemStack(Items.IRON_CHESTPLATE));
				zombie.equipStack(EquipmentSlot.LEGS, new ItemStack(Items.IRON_LEGGINGS));
				zombie.equipStack(EquipmentSlot.MAINHAND, new ItemStack(Items.IRON_AXE));
			}
			case SCREAMER -> {
				zombie.addCommandTag(SCREAMER);
				setBase(zombie, EntityAttributes.SCALE, 0.85);
				setBase(zombie, EntityAttributes.MOVEMENT_SPEED, 0.28);
				zombie.equipStack(EquipmentSlot.HEAD, ItemStack.EMPTY);
			}
			default -> {
			}
		}
		if (target != null) {
			zombie.setTarget(target);
		}
		this.world.spawnParticles(BLOOD_DUST, pos.getX() + 0.5, pos.getY() + 0.2, pos.getZ() + 0.5, 12, 0.4, 0.1, 0.4, 0.0);
		return zombie;
	}

	private static void setBase(LivingEntity entity, net.minecraft.registry.entry.RegistryEntry<net.minecraft.entity.attribute.EntityAttribute> attribute, double value) {
		EntityAttributeInstance instance = entity.getAttributeInstance(attribute);
		if (instance != null) {
			instance.setBaseValue(value);
		}
	}

	/** Screamers shriek, rally every zombie nearby and call more of the horde. */
	private void tickScreamers() {
		List<ZombieEntity> zombies = this.zombies();
		for (ZombieEntity screamer : zombies) {
			if (!screamer.getCommandTags().contains(SCREAMER)) {
				continue;
			}
			this.world.spawnParticles(BLOOD_DUST, screamer.getX(), screamer.getEyeY(), screamer.getZ(), 2, 0.2, 0.2, 0.2, 0.0);
			if (this.random.nextInt(12) != 0) {
				continue;
			}
			LivingEntity target = screamer.getTarget();
			if (target == null) {
				target = this.world.getClosestPlayer(screamer, 48.0);
			}
			this.world.playSound(null, screamer.getX(), screamer.getY(), screamer.getZ(), ModSounds.ZOMBIE_SCREAM, SoundCategory.HOSTILE, 4.0F, 0.8F + this.random.nextFloat() * 0.3F);
			this.world.spawnParticles(ParticleTypes.SONIC_BOOM, screamer.getX(), screamer.getEyeY(), screamer.getZ(), 1, 0, 0, 0, 0);
			if (target != null) {
				for (ZombieEntity other : zombies) {
					if (other != screamer && other.squaredDistanceTo(screamer) < 40 * 40) {
						other.setTarget(target);
					}
				}
			}
			int calls = 1 + this.intensity / 2;
			for (int i = 0; i < calls && this.trackedCount() < this.zombieCap(); i++) {
				BlockPos pos = SpawnHelper.findSurfaceSpawn(this.world, screamer.getBlockPos(), 3, 8, this.random);
				if (pos != null) {
					this.spawnZombie(pos, target, this.random.nextInt(3) == 0 ? RUNNER : "");
				}
			}
		}
	}

	private List<ZombieEntity> zombies() {
		List<ZombieEntity> list = new ArrayList<>();
		for (Entity entity : this.trackedEntities()) {
			if (entity instanceof ZombieEntity zombie && zombie.isAlive()) {
				list.add(zombie);
			}
		}
		return list;
	}

	/** Zombies that can't reach their target push toward it and break through weak blocks. */
	private void tickSiege() {
		for (ZombieEntity zombie : this.zombies()) {
			UUID id = zombie.getUuid();
			LivingEntity target = zombie.getTarget();
			if (target == null || !target.isAlive() || target.getEntityWorld() != this.world) {
				ServerPlayerEntity nearest = (ServerPlayerEntity) this.world.getClosestPlayer(zombie, 40.0);
				if (nearest != null && !nearest.isCreative() && !nearest.isSpectator()) {
					zombie.setTarget(nearest);
				}
				this.stopBreaking(zombie);
				continue;
			}
			double distance = zombie.squaredDistanceTo(target);
			if (distance > 28 * 28 || distance < 2.0 * 2.0) {
				this.stopBreaking(zombie);
				continue;
			}
			Vec3d last = this.lastPositions.put(id, zombie.getEntityPos());
			boolean stuck = last != null && last.squaredDistanceTo(zombie.getEntityPos()) < 0.05;
			int stuckFor = stuck ? this.stuckTicks.merge(id, 5, Integer::sum) : 0;
			if (!stuck) {
				this.stuckTicks.remove(id);
			}
			if (zombie.getNavigation().isIdle() || stuckFor >= 20) {
				zombie.getMoveControl().moveTo(target.getX(), target.getY(), target.getZ(), 1.0);
			}
			if (!this.blockDamage() || (stuckFor < 15 && !zombie.horizontalCollision)) {
				continue;
			}
			BlockPos obstacle = this.findObstacle(zombie, target);
			if (obstacle == null) {
				this.stopBreaking(zombie);
				continue;
			}
			this.workOnBlock(zombie, obstacle);
		}
	}

	@Nullable
	private BlockPos findObstacle(ZombieEntity zombie, LivingEntity target) {
		Vec3d toTarget = target.getEntityPos().subtract(zombie.getEntityPos()).multiply(1, 0, 1);
		if (toTarget.lengthSquared() < 1.0E-4) {
			return null;
		}
		Vec3d dir = toTarget.normalize();
		for (double height : new double[] {zombie.getHeight() * 0.85, 0.4}) {
			Vec3d start = zombie.getEntityPos().add(0, height, 0);
			Vec3d end = start.add(dir.multiply(2.2));
			BlockHitResult hit = this.world.raycast(new RaycastContext(start, end, RaycastContext.ShapeType.COLLIDER, RaycastContext.FluidHandling.NONE, zombie));
			if (hit.getType() == HitResult.Type.BLOCK) {
				BlockPos pos = hit.getBlockPos();
				BlockState state = this.world.getBlockState(pos);
				if (state.isIn(ModTags.ZOMBIE_BREAKABLE) && this.canModify(pos, state)) {
					return pos;
				}
			}
		}
		return null;
	}

	private void workOnBlock(ZombieEntity zombie, BlockPos pos) {
		BreakState state = this.breaking.get(zombie.getUuid());
		BlockState block = this.world.getBlockState(pos);
		if (state == null || !state.pos.equals(pos)) {
			this.stopBreaking(zombie);
			state = new BreakState();
			state.pos = pos.toImmutable();
			float hardness = Math.max(0.2F, block.getHardness(this.world, pos));
			state.needed = (int) ((30 + hardness * 30) * (6 - this.intensity) / 3.0F);
			this.breaking.put(zombie.getUuid(), state);
		}
		state.ticks += 5;
		zombie.swingHand(Hand.MAIN_HAND);
		zombie.getLookControl().lookAt(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5);
		int stage = MathHelper.clamp((int) (state.ticks / (float) state.needed * 10.0F), 0, 9);
		this.world.setBlockBreakingInfo(zombie.getId(), pos, stage);
		if (state.ticks % 20 == 0) {
			boolean wooden = block.isIn(net.minecraft.registry.tag.BlockTags.WOODEN_DOORS) || block.isIn(net.minecraft.registry.tag.BlockTags.PLANKS);
			if (wooden) {
				this.world.syncWorldEvent(WorldEvents.ZOMBIE_ATTACKS_WOODEN_DOOR, pos, 0);
			} else {
				this.world.playSound(null, pos, block.getSoundGroup().getHitSound(), SoundCategory.HOSTILE, 1.0F, 0.8F);
			}
		}
		if (state.ticks >= state.needed) {
			this.world.setBlockBreakingInfo(zombie.getId(), pos, -1);
			this.breaking.remove(zombie.getUuid());
			this.world.syncWorldEvent(WorldEvents.ZOMBIE_BREAKS_WOODEN_DOOR, pos, 0);
			this.world.breakBlock(pos, true, zombie);
		}
	}

	private void stopBreaking(ZombieEntity zombie) {
		BreakState state = this.breaking.remove(zombie.getUuid());
		if (state != null) {
			this.world.setBlockBreakingInfo(zombie.getId(), state.pos, -1);
		}
	}

	// ------------------------------------------------------------------------------------------ dawn

	@Override
	protected void onAftermathStart() {
		this.clearAllCracks();
		this.playSoundToAll(ModSounds.BLOOD_MOON_DAWN, 1.0F, 1.0F);
		this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.GOLD)
			.append(Text.literal("☀ Dawn breaks! The Blood Moon is over and the horde burns.").formatted(Formatting.YELLOW)));
		// Helmets come off so every zombie caught in the sun burns.
		for (ZombieEntity zombie : this.zombies()) {
			zombie.equipStack(EquipmentSlot.HEAD, ItemStack.EMPTY);
			zombie.setTarget(null);
		}
		this.giveRewards();
	}

	@Override
	protected void tickAftermath() {
		if (this.phaseTicks() % 20 == 0) {
			for (ZombieEntity zombie : this.zombies()) {
				if (this.world.isSkyVisible(zombie.getBlockPos().up()) && !zombie.isOnFire()) {
					zombie.setOnFireFor(8.0F);
				}
			}
		}
	}

	@Override
	protected void onEnd(boolean forced) {
		this.clearAllCracks();
	}

	private void clearAllCracks() {
		for (Map.Entry<UUID, BreakState> entry : this.breaking.entrySet()) {
			Entity zombie = this.world.getEntity(entry.getKey());
			if (zombie != null) {
				this.world.setBlockBreakingInfo(zombie.getId(), entry.getValue().pos, -1);
			}
		}
		this.breaking.clear();
	}

	/** A reward chest at the spawn point of every player who survived the night. */
	private void giveRewards() {
		for (UUID uuid : this.survivors) {
			if (this.fallen.contains(uuid)) {
				continue;
			}
			ServerPlayerEntity player = this.world.getServer().getPlayerManager().getPlayer(uuid);
			if (player == null || !player.isAlive()) {
				continue;
			}
			ServerWorld spawnWorld = this.world.getServer().getOverworld();
			BlockPos spawn = spawnWorld.getSpawnPoint().getPos();
			ServerPlayerEntity.Respawn respawn = player.getRespawn();
			if (respawn != null) {
				WorldProperties.SpawnPoint data = respawn.respawnData();
				ServerWorld world = this.world.getServer().getWorld(data.getDimension());
				if (world != null) {
					spawnWorld = world;
					spawn = data.getPos();
				}
			}
			BlockPos chestPos = this.findChestSpot(spawnWorld, spawn);
			if (chestPos == null) {
				player.giveOrDropStack(this.rewardStacks().getFirst());
				continue;
			}
			spawnWorld.setBlockState(chestPos, Blocks.CHEST.getDefaultState().with(ChestBlock.FACING, Direction.Type.HORIZONTAL.random(this.random)), Block.NOTIFY_ALL);
			if (spawnWorld.getBlockEntity(chestPos) instanceof ChestBlockEntity chest) {
				List<ItemStack> loot = this.rewardStacks();
				for (int i = 0; i < loot.size() && i < chest.size(); i++) {
					chest.setStack(i * 2 % chest.size(), loot.get(i));
				}
			}
			spawnWorld.spawnParticles(ParticleTypes.TOTEM_OF_UNDYING, chestPos.getX() + 0.5, chestPos.getY() + 1, chestPos.getZ() + 0.5, 30, 0.5, 0.5, 0.5, 0.3);
			player.sendMessage(Text.literal("[Chaos] ").formatted(Formatting.GOLD)
				.append(Text.literal("You survived the Blood Moon! A reward chest waits at your spawn point ("
					+ chestPos.getX() + ", " + chestPos.getY() + ", " + chestPos.getZ() + ").").formatted(Formatting.GREEN)), false);
		}
	}

	@Nullable
	private BlockPos findChestSpot(ServerWorld world, BlockPos spawn) {
		for (int r = 1; r <= 4; r++) {
			for (BlockPos pos : BlockPos.iterateOutwards(spawn, r, 2, r)) {
				BlockState state = world.getBlockState(pos);
				BlockPos below = pos.down();
				if (state.isAir() && world.getBlockState(below).isSideSolidFullSquare(world, below, Direction.UP)
					&& !world.getBlockState(pos).isOf(Blocks.CHEST)) {
					return pos.toImmutable();
				}
			}
		}
		return null;
	}

	private List<ItemStack> rewardStacks() {
		List<ItemStack> loot = new ArrayList<>();
		loot.add(new ItemStack(Items.IRON_INGOT, 4 + this.random.nextInt(4) + this.intensity * 2));
		loot.add(new ItemStack(Items.GOLD_INGOT, 2 + this.random.nextInt(3) + this.intensity));
		loot.add(new ItemStack(Items.EMERALD, 1 + this.random.nextInt(2) + this.intensity));
		loot.add(new ItemStack(Items.COOKED_BEEF, 8));
		loot.add(new ItemStack(Items.ARROW, 16 + this.intensity * 8));
		if (this.intensity >= 3) {
			loot.add(new ItemStack(Items.DIAMOND, 1 + this.random.nextInt(this.intensity - 1)));
		}
		if (this.intensity >= 4) {
			loot.add(new ItemStack(Items.GOLDEN_APPLE, 1 + this.random.nextInt(2)));
		}
		if (this.intensity >= 5 && this.random.nextInt(3) == 0) {
			loot.add(new ItemStack(Items.ENCHANTED_GOLDEN_APPLE));
		}
		return loot;
	}
}
