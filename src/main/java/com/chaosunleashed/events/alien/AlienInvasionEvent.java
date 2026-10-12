package com.chaosunleashed.events.alien;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.EventContext;
import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModItems;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.ChestBlock;
import net.minecraft.block.entity.ChestBlockEntity;
import net.minecraft.entity.Entity;
import net.minecraft.entity.ExperienceOrbEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.entity.effect.StatusEffects;
import net.minecraft.entity.passive.AnimalEntity;
import net.minecraft.entity.passive.MerchantEntity;
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
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Alien Invasion: 3-8 UFOs descend and hover over the area, abduct animals and villagers with tractor beams and
 * drop Alien Soldiers. Shoot the UFOs down (arrows, tridents, plasma) to make them crash and leave a crash site
 * with alien tech: Plasma Pistols, Alien Alloy and Anti-Gravity Boots. Ends when every UFO is destroyed, or when
 * time runs out and they fly off.
 */
public class AlienInvasionEvent extends ChaosEvent {
	private final List<UfoEntity> ufos = new ArrayList<>();
	private final Map<UUID, Integer> nextDrop = new HashMap<>();
	private final int ufoCount;
	private Vec3d anchor;
	private int destroyed;

	public AlienInvasionEvent(EventContext context) {
		super(context);
		this.ufoCount = MathHelper.clamp(2 + this.intensity + this.random.nextInt(2), 3, 8);
		this.anchor = Vec3d.ofBottomCenter(this.origin);
	}

	@Override
	public Text warningTitle() {
		return Text.literal("⚠ Unidentified objects in the sky!").formatted(Formatting.GREEN, Formatting.BOLD);
	}

	@Override
	public Text warningSubtitle() {
		return Text.literal("They do not come in peace. Ready your bows.").formatted(Formatting.DARK_GREEN);
	}

	@Override
	protected SoundEvent warningSound() {
		return ModSounds.ALIEN_WARNING;
	}

	@Override
	public Text bossBarDetail() {
		return Text.literal("UFOs: " + (this.ufoCount - this.destroyed) + "/" + this.ufoCount).formatted(Formatting.GREEN);
	}

	private double hoverY(double x, double z) {
		int ground = this.world.getTopY(Heightmap.Type.MOTION_BLOCKING, MathHelper.floor(x), MathHelper.floor(z));
		return Math.min(this.world.getTopYInclusive() - 8, ground + 22 + this.random.nextInt(8));
	}

	private int soldierCap() {
		return Math.min(this.entityCap(), 4 + this.intensity * 3);
	}

	// ------------------------------------------------------------------------------------------ warning

	@Override
	protected void onWarningStart() {
		for (int i = 0; i < this.ufoCount; i++) {
			UfoEntity ufo = ModEntities.UFO.create(this.world, SpawnReason.EVENT);
			if (ufo == null) {
				continue;
			}
			double angle = (i / (double) this.ufoCount) * Math.PI * 2.0 + this.random.nextDouble() * 0.5;
			double distance = 18 + this.random.nextInt(24);
			double x = this.anchor.x + Math.cos(angle) * distance;
			double z = this.anchor.z + Math.sin(angle) * distance;
			double high = Math.min(this.world.getTopYInclusive() - 4, this.hoverY(x, z) + 50);
			ufo.refreshPositionAndAngles(x, high, z, this.random.nextFloat() * 360.0F, 0.0F);
			var health = ufo.getAttributeInstance(net.minecraft.entity.attribute.EntityAttributes.MAX_HEALTH);
			if (health != null) {
				health.setBaseValue(30.0 + this.intensity * 6.0);
				ufo.setHealth((float) health.getValue());
			}
			ufo.setMoveTarget(new Vec3d(x, this.hoverY(x, z), z), 0.25);
			if (this.spawnTracked(ufo)) {
				this.ufos.add(ufo);
				this.nextDrop.put(ufo.getUuid(), 200 + this.random.nextInt(200));
			}
		}
	}

	@Override
	protected void tickWarning() {
		if (this.phaseTicks() % 60 == 0) {
			this.playSoundToAll(ModSounds.ALIEN_WARNING, 0.8F, 0.8F + this.phaseProgress() * 0.4F);
		}
		if (this.phaseTicks() % 5 == 0) {
			for (UfoEntity ufo : this.liveUfos()) {
				this.farParticles(ParticleTypes.END_ROD, ufo.getEntityPos(), 2, 2.5, 0.3, 2.5, 0.01);
			}
		}
	}

	// ------------------------------------------------------------------------------------------ active

	@Override
	protected void onActiveStart() {
		this.actionBarAll(Text.literal("☄ ALIEN INVASION! Shoot the UFOs down!").formatted(Formatting.GREEN, Formatting.BOLD));
	}

	private List<UfoEntity> liveUfos() {
		List<UfoEntity> list = new ArrayList<>();
		for (UfoEntity ufo : this.ufos) {
			if (!ufo.isRemoved() && !ufo.isCrashing()) {
				list.add(ufo);
			}
		}
		return list;
	}

	@Override
	protected void tickActive() {
		int t = this.phaseTicks();
		List<UfoEntity> live = this.liveUfos();
		if (live.isEmpty() && this.destroyed >= this.ufoCount) {
			this.requestAftermath();
			return;
		}
		if (t % 100 == 0) {
			ServerPlayerEntity focus = this.focusPlayer();
			if (focus != null) {
				this.anchor = focus.getEntityPos();
			}
		}
		if (t % 20 != 0) {
			return;
		}
		int soldiers = this.countSoldiers();
		for (UfoEntity ufo : live) {
			if (ufo.getAbductee() == null) {
				LivingEntity prey = this.random.nextFloat() < 0.35F ? this.findPrey(ufo) : null;
				if (prey != null) {
					ufo.startAbduction(prey);
					ufo.setMoveTarget(new Vec3d(prey.getX(), this.hoverY(prey.getX(), prey.getZ()), prey.getZ()), 0.3);
				} else if (ufo.getMoveTarget() == null || ufo.getEntityPos().squaredDistanceTo(ufo.getMoveTarget()) < 4.0 || this.random.nextFloat() < 0.1F) {
					double x = this.anchor.x + (this.random.nextDouble() - 0.5) * 56.0;
					double z = this.anchor.z + (this.random.nextDouble() - 0.5) * 56.0;
					ufo.setMoveTarget(new Vec3d(x, this.hoverY(x, z), z), 0.18 + this.random.nextDouble() * 0.12);
				}
			} else if (ufo.getAbductee() != null) {
				LivingEntity prey = ufo.getAbductee();
				ufo.setMoveTarget(new Vec3d(prey.getX(), ufo.getY(), prey.getZ()), 0.3);
			}
			int drop = this.nextDrop.merge(ufo.getUuid(), -20, Integer::sum);
			if (drop <= 0 && soldiers < this.soldierCap()) {
				this.dropSoldier(ufo);
				soldiers++;
				this.nextDrop.put(ufo.getUuid(), Math.max(100, 400 - this.intensity * 50) + this.random.nextInt(100));
			}
		}
	}

	private int countSoldiers() {
		int count = 0;
		for (Entity entity : this.trackedEntities()) {
			if (entity instanceof AlienSoldierEntity) {
				count++;
			}
		}
		return count;
	}

	@Nullable
	private LivingEntity findPrey(UfoEntity ufo) {
		Box box = new Box(ufo.getX() - 28, ufo.getY() - 48, ufo.getZ() - 28, ufo.getX() + 28, ufo.getY(), ufo.getZ() + 28);
		LivingEntity best = null;
		double bestDistance = Double.MAX_VALUE;
		for (LivingEntity entity : this.world.getEntitiesByClass(LivingEntity.class, box,
			e -> (e instanceof AnimalEntity || e instanceof MerchantEntity) && e.isAlive() && !e.getCommandTags().contains(ENTITY_TAG))) {
			double distance = entity.squaredDistanceTo(ufo);
			if (distance < bestDistance && this.isTargetedByNobody(entity)) {
				best = entity;
				bestDistance = distance;
			}
		}
		return best;
	}

	private boolean isTargetedByNobody(LivingEntity entity) {
		for (UfoEntity ufo : this.ufos) {
			if (ufo.getAbductee() == entity) {
				return false;
			}
		}
		return true;
	}

	private void dropSoldier(UfoEntity ufo) {
		AlienSoldierEntity soldier = ModEntities.ALIEN_SOLDIER.create(this.world, SpawnReason.EVENT);
		if (soldier == null) {
			return;
		}
		soldier.refreshPositionAndAngles(ufo.getX(), ufo.getY() - 2.0, ufo.getZ(), this.random.nextFloat() * 360.0F, 0.0F);
		if (this.spawnTrackedMob(soldier)) {
			soldier.addStatusEffect(new StatusEffectInstance(StatusEffects.SLOW_FALLING, 400, 0, false, false));
			ufo.flashBeam(30, (float) (ufo.getY() - this.world.getTopY(Heightmap.Type.MOTION_BLOCKING, ufo.getBlockX(), ufo.getBlockZ())));
			this.world.spawnParticles(ModParticles.PLASMA, soldier.getX(), soldier.getY() + 1, soldier.getZ(), 20, 0.5, 0.5, 0.5, 0.1);
		}
	}

	/** Called by the UFO when it hits the ground after being shot down. */
	void onUfoCrashed(UfoEntity ufo) {
		this.destroyed++;
		BlockPos impact = ufo.getBlockPos();
		Vec3d pos = ufo.getEntityPos();
		this.farParticles(ParticleTypes.EXPLOSION_EMITTER, pos, 2, 1.5, 0.5, 1.5, 0.0);
		this.farParticles(ParticleTypes.LAVA, pos, 30, 2.0, 0.5, 2.0, 0.1);
		this.playSoundAt(pos, ModSounds.UFO_CRASH, 8.0F, 0.6F);
		this.shakeNear(pos, 64.0, 2.5F, 25);
		for (Entity entity : this.world.getOtherEntities(ufo, ufo.getBoundingBox().expand(4.0), e -> e instanceof LivingEntity)) {
			if (!(entity instanceof PlayerEntity player && (player.isCreative() || player.isSpectator()))) {
				entity.damage(this.world, this.world.getDamageSources().explosion(ufo, null), 6.0F);
			}
		}
		if (this.blockDamage()) {
			this.scorch(impact);
		}
		this.placeCrashSite(impact);
		ExperienceOrbEntity.spawn(this.world, pos, 30 + this.intensity * 10);
		this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.GREEN)
			.append(Text.literal("A UFO was shot down near " + impact.getX() + ", " + impact.getZ() + "! Loot the crash site!").formatted(Formatting.YELLOW)));
		if (this.destroyed >= this.ufoCount) {
			this.requestAftermath();
		}
	}

	/** Small scorched crater with some fire. */
	private void scorch(BlockPos center) {
		for (BlockPos pos : BlockPos.iterate(center.add(-3, -2, -3), center.add(3, 1, 3))) {
			BlockPos target = pos.toImmutable();
			double distance = Math.sqrt(target.getSquaredDistance(center));
			if (distance > 3.2) {
				continue;
			}
			this.blocks().enqueue(null, () -> {
				BlockState state = this.world.getBlockState(target);
				if (state.isAir() || !this.canModify(target, state)) {
					return 1;
				}
				if (distance < 2.2) {
					this.world.setBlockState(target, Blocks.AIR.getDefaultState(), Block.NOTIFY_ALL);
				} else if (this.random.nextInt(3) == 0) {
					this.world.setBlockState(target, Blocks.MAGMA_BLOCK.getDefaultState(), Block.NOTIFY_ALL);
				} else if (this.random.nextInt(4) == 0 && this.world.isAir(target.up())) {
					this.world.setBlockState(target.up(), Blocks.FIRE.getDefaultState(), Block.NOTIFY_ALL);
				}
				return 1;
			});
		}
	}

	/** A loot chest full of alien tech at the crash site (queued so it lands after the crater). */
	private void placeCrashSite(BlockPos impact) {
		this.blocks().enqueue(null, () -> {
			BlockPos ground = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, impact);
			BlockPos chestPos = ground;
			if (!this.world.isAir(chestPos) && !this.world.getBlockState(chestPos).isReplaceable()) {
				chestPos = chestPos.up();
			}
			this.world.setBlockState(chestPos, Blocks.CHEST.getDefaultState().with(ChestBlock.FACING, Direction.Type.HORIZONTAL.random(this.random)),
				Block.NOTIFY_ALL);
			if (this.world.getBlockEntity(chestPos) instanceof ChestBlockEntity chest) {
				List<ItemStack> loot = new ArrayList<>();
				loot.add(new ItemStack(ModItems.ALIEN_ALLOY, 3 + this.random.nextInt(4) + this.intensity));
				if (this.random.nextFloat() < 0.3F + 0.1F * this.intensity) {
					loot.add(new ItemStack(ModItems.PLASMA_PISTOL));
				}
				if (this.random.nextFloat() < 0.2F + 0.08F * this.intensity) {
					loot.add(new ItemStack(ModItems.ANTI_GRAVITY_BOOTS));
				}
				loot.add(new ItemStack(Items.GLOWSTONE_DUST, 4 + this.random.nextInt(8)));
				loot.add(new ItemStack(Items.REDSTONE, 4 + this.random.nextInt(8)));
				loot.add(new ItemStack(Items.IRON_INGOT, 2 + this.random.nextInt(5)));
				for (int i = 0; i < loot.size(); i++) {
					chest.setStack(i * 4 % chest.size(), loot.get(i));
				}
			}
			this.world.spawnParticles(ParticleTypes.LARGE_SMOKE, chestPos.getX() + 0.5, chestPos.getY() + 1, chestPos.getZ() + 0.5, 30, 1.0, 1.0, 1.0, 0.02);
			return 1;
		});
	}

	// ------------------------------------------------------------------------------------------ ending

	@Override
	protected void onAftermathStart() {
		if (this.destroyed >= this.ufoCount) {
			this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.GREEN)
				.append(Text.literal("☄ Victory! Every UFO was shot down. The invasion is over!").formatted(Formatting.GOLD, Formatting.BOLD)));
		} else {
			this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.GREEN)
				.append(Text.literal("☄ The UFOs are retreating to the stars...").formatted(Formatting.YELLOW)));
		}
		for (UfoEntity ufo : this.liveUfos()) {
			ufo.setMoveTarget(ufo.getEntityPos().add(this.random.nextDouble() * 40 - 20, 120.0, this.random.nextDouble() * 40 - 20), 1.2);
		}
		// Soldiers get beamed back up.
		for (Entity entity : this.trackedEntities()) {
			if (entity instanceof AlienSoldierEntity soldier) {
				soldier.addStatusEffect(new StatusEffectInstance(StatusEffects.LEVITATION, 200, 4, false, false));
				this.world.spawnParticles(ParticleTypes.END_ROD, soldier.getX(), soldier.getBodyY(0.5), soldier.getZ(), 20, 0.3, 1.0, 0.3, 0.05);
			}
		}
	}

	@Override
	protected void tickAftermath() {
		for (Entity entity : this.trackedEntities()) {
			if (entity instanceof UfoEntity ufo && !ufo.isCrashing() && ufo.getY() > this.anchor.y + 90) {
				ufo.discard();
			} else if (entity instanceof AlienSoldierEntity soldier && this.phaseTicks() > 60) {
				this.world.spawnParticles(ParticleTypes.END_ROD, soldier.getX(), soldier.getBodyY(0.5), soldier.getZ(), 15, 0.3, 0.5, 0.3, 0.1);
				soldier.discard();
			}
		}
	}

	@Override
	protected void onEnd(boolean forced) {
		this.ufos.clear();
	}
}
