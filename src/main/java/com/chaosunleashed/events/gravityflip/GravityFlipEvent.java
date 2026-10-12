package com.chaosunleashed.events.gravityflip;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.EventContext;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import com.chaosunleashed.registry.ModTags;
import net.minecraft.block.BlockState;
import net.minecraft.entity.Entity;
import net.minecraft.entity.ExperienceOrbEntity;
import net.minecraft.entity.FallingBlockEntity;
import net.minecraft.entity.ItemEntity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.attribute.EntityAttributeInstance;
import net.minecraft.entity.attribute.EntityAttributeModifier;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundEvent;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.Heightmap;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;

/**
 * Gravity Flip: for 60 seconds every entity near a player (players, mobs, items, XP) slowly floats upward and
 * hovers, and loose blocks (sand, gravel, dirt, logs...) tear free and drift up. When it ends everything crashes
 * back down: fall damage applies and the blocks land wherever they fall.
 * <p>
 * Living entities use a <em>temporary</em> gravity attribute modifier (never saved, so a crash can't leave anyone
 * floating forever); items and floating blocks use no-gravity + velocity.
 */
public class GravityFlipEvent extends ChaosEvent {
	private static final Identifier MODIFIER_ID = ChaosUnleashed.id("gravity_flip");

	private record Floater(Entity entity, double startY) {
	}

	private final Map<UUID, Floater> living = new HashMap<>();
	private final Map<UUID, Boolean> livingRising = new HashMap<>();
	private final Map<UUID, Floater> loose = new HashMap<>();
	private boolean restored;

	public GravityFlipEvent(EventContext context) {
		super(context);
	}

	@Override
	public Text warningTitle() {
		return Text.literal("⚠ Gravity is failing...").formatted(Formatting.AQUA, Formatting.BOLD);
	}

	@Override
	public Text warningSubtitle() {
		return Text.literal("Hold on to something. Up is about to become... up.").formatted(Formatting.GRAY);
	}

	@Override
	protected SoundEvent warningSound() {
		return ModSounds.GRAVITY_FLIP_WARNING;
	}

	private int radius() {
		return this.radius(28, 6);
	}

	/** How high above their starting height things float before hovering. */
	private double ceiling() {
		return 4.0 + this.intensity * 3.0;
	}

	private float lift() {
		return 0.0020F + 0.0005F * this.intensity;
	}

	// ------------------------------------------------------------------------------------------ warning

	@Override
	protected void tickWarning() {
		int radius = this.radius();
		// Items start hovering and bouncing; motes rise from the ground.
		if (this.phaseTicks() % 4 == 0) {
			for (ServerPlayerEntity player : this.players()) {
				Box box = player.getBoundingBox().expand(radius, 8, radius);
				for (ItemEntity item : this.world.getEntitiesByClass(ItemEntity.class, box, Entity::isAlive)) {
					if (item.isOnGround()) {
						item.addVelocity((this.random.nextDouble() - 0.5) * 0.08, 0.2 + this.random.nextDouble() * 0.15 * (1 + this.phaseProgress()), (this.random.nextDouble() - 0.5) * 0.08);
						item.velocityDirty = true;
					}
				}
				this.world.spawnParticles(ModParticles.GRAVITY_MOTE, player.getX(), player.getY(), player.getZ(),
					4 + (int) (this.phaseProgress() * 12), radius * 0.4, 1.0, radius * 0.4, 0.02);
			}
		}
		int secondsLeft = this.remainingTicks() / 20;
		if (this.remainingTicks() % 20 == 0 && secondsLeft <= 5 && secondsLeft > 0) {
			this.actionBarAll(Text.literal("⇅ Gravity flips in " + secondsLeft + "...").formatted(Formatting.AQUA));
		}
	}

	// ------------------------------------------------------------------------------------------ active

	@Override
	protected void onActiveStart() {
		this.playSoundToAll(ModSounds.GRAVITY_FLIP_START, 1.0F, 0.8F);
		this.actionBarAll(Text.literal("⇅ GRAVITY HAS FLIPPED!").formatted(Formatting.AQUA, Formatting.BOLD));
		for (ServerPlayerEntity player : this.players()) {
			this.shake(player, 1.5F, 20);
		}
	}

	@Override
	protected void tickActive() {
		if (this.phaseTicks() % 5 == 1) {
			this.captureEntities();
		}
		this.updateLiving();
		this.updateLoose();
		if (this.phaseTicks() % 2 == 0) {
			this.detachLooseBlocks();
		}
		if (this.phaseTicks() % 6 == 0) {
			for (ServerPlayerEntity player : this.players()) {
				this.world.spawnParticles(ModParticles.GRAVITY_MOTE, player.getX(), player.getY(), player.getZ(), 8, 10, 4, 10, 0.02);
			}
		}
		int secondsLeft = this.remainingTicks() / 20;
		if (this.remainingTicks() % 20 == 0 && secondsLeft <= 5 && secondsLeft > 0) {
			this.actionBarAll(Text.literal("⚠ Gravity returns in " + secondsLeft + "... brace for impact!").formatted(Formatting.RED));
		}
	}

	/** Finds entities near players and makes them float. */
	private void captureEntities() {
		int radius = this.radius();
		for (ServerPlayerEntity player : this.players()) {
			Box box = player.getBoundingBox().expand(radius, 24, radius);
			for (Entity entity : this.world.getOtherEntities(null, box, Entity::isAlive)) {
				UUID uuid = entity.getUuid();
				if (entity instanceof LivingEntity livingEntity) {
					if (livingEntity instanceof PlayerEntity p && (p.isSpectator() || p.getAbilities().flying)) {
						continue;
					}
					if (!this.living.containsKey(uuid) && livingEntity.getAttributeInstance(EntityAttributes.GRAVITY) != null) {
						this.living.put(uuid, new Floater(livingEntity, livingEntity.getY()));
						this.setGravity(livingEntity, true);
					}
				} else if (entity instanceof ItemEntity || entity instanceof ExperienceOrbEntity || entity instanceof FallingBlockEntity) {
					if (!this.loose.containsKey(uuid)) {
						this.loose.put(uuid, new Floater(entity, entity.getY()));
						entity.setNoGravity(true);
					}
				}
			}
		}
	}

	private void setGravity(LivingEntity entity, boolean rising) {
		EntityAttributeInstance gravity = entity.getAttributeInstance(EntityAttributes.GRAVITY);
		if (gravity == null) {
			return;
		}
		double base = gravity.getBaseValue();
		// Rising: net gravity becomes a small upward pull. Hovering: a tiny downward pull so they bob gently.
		double target = rising ? -this.lift() : 0.0012;
		gravity.removeModifier(MODIFIER_ID);
		gravity.addTemporaryModifier(new EntityAttributeModifier(MODIFIER_ID, target - base, EntityAttributeModifier.Operation.ADD_VALUE));
		this.livingRising.put(entity.getUuid(), rising);
	}

	private void updateLiving() {
		double ceiling = this.ceiling();
		Iterator<Map.Entry<UUID, Floater>> iterator = this.living.entrySet().iterator();
		while (iterator.hasNext()) {
			Map.Entry<UUID, Floater> entry = iterator.next();
			Entity entity = entry.getValue().entity();
			if (!(entity instanceof LivingEntity livingEntity) || entity.isRemoved()) {
				if (entity instanceof LivingEntity livingEntity) {
					this.clearGravity(livingEntity);
				}
				iterator.remove();
				this.livingRising.remove(entry.getKey());
				continue;
			}
			double height = entity.getY() - entry.getValue().startY();
			boolean rising = this.livingRising.getOrDefault(entry.getKey(), true);
			if (rising && height > ceiling) {
				this.setGravity(livingEntity, false);
			} else if (!rising && height < ceiling - 1.0) {
				this.setGravity(livingEntity, true);
			}
			// Fall damage is only counted from the moment gravity returns.
			livingEntity.fallDistance = 0.0;
			if (entity.age % 10 == 0) {
				this.world.spawnParticles(ModParticles.GRAVITY_MOTE, entity.getX(), entity.getY(), entity.getZ(), 1, 0.2, 0.1, 0.2, 0.0);
			}
		}
	}

	private void updateLoose() {
		double ceiling = this.ceiling();
		Iterator<Map.Entry<UUID, Floater>> iterator = this.loose.entrySet().iterator();
		while (iterator.hasNext()) {
			Floater floater = iterator.next().getValue();
			Entity entity = floater.entity();
			if (entity.isRemoved()) {
				iterator.remove();
				continue;
			}
			if (entity instanceof FallingBlockEntity block) {
				block.timeFalling = 1;
			}
			double height = entity.getY() - floater.startY();
			Vec3d velocity = entity.getVelocity();
			double vy;
			if (height < ceiling) {
				vy = Math.min(velocity.y + 0.01, 0.12);
			} else {
				vy = velocity.y * 0.7 + MathHelper.sin((entity.age + entity.getId()) * 0.15F) * 0.01;
			}
			entity.setVelocity(velocity.x * 0.95, vy, velocity.z * 0.95);
			entity.velocityDirty = true;
		}
	}

	/** Loose surface blocks tear free and float up as falling blocks. */
	private void detachLooseBlocks() {
		if (!this.blockDamage() || this.blocks().pending(this) > 8) {
			return;
		}
		int cap = Math.min(this.entityCap(), 15 + this.intensity * 12);
		long floatingBlocks = this.loose.values().stream().filter(f -> f.entity() instanceof FallingBlockEntity).count();
		if (floatingBlocks >= cap) {
			return;
		}
		int radius = Math.min(this.radius(), 20);
		for (ServerPlayerEntity player : this.players()) {
			int x = player.getBlockX() + this.random.nextBetween(-radius, radius);
			int z = player.getBlockZ() + this.random.nextBetween(-radius, radius);
			BlockPos top = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, new BlockPos(x, 0, z)).down();
			if (!this.isChunkLoaded(top)) {
				continue;
			}
			BlockState state = this.world.getBlockState(top);
			if (!state.isIn(ModTags.LOOSE_BLOCKS) || !this.canModify(top, state) || !this.world.isAir(top.up())) {
				continue;
			}
			this.blocks().enqueue(this, () -> {
				BlockState current = this.world.getBlockState(top);
				if (current != state || this.restored) {
					return 1;
				}
				FallingBlockEntity falling = FallingBlockEntity.spawnFromBlock(this.world, top, current);
				falling.setNoGravity(true);
				falling.setVelocity(0.0, 0.08, 0.0);
				this.loose.put(falling.getUuid(), new Floater(falling, top.getY()));
				this.world.spawnParticles(ModParticles.GRAVITY_MOTE, top.getX() + 0.5, top.getY() + 0.5, top.getZ() + 0.5, 6, 0.4, 0.4, 0.4, 0.02);
				return 1;
			});
		}
	}

	// ------------------------------------------------------------------------------------------ crash down

	@Override
	protected void onAftermathStart() {
		this.restoreGravity();
		this.playSoundToAll(ModSounds.GRAVITY_FLIP_END, 1.0F, 0.6F);
		this.actionBarAll(Text.literal("⇅ Gravity restored! Everything comes crashing down!").formatted(Formatting.RED, Formatting.BOLD));
		for (ServerPlayerEntity player : this.players()) {
			this.shake(player, 2.0F, 25);
		}
	}

	@Override
	protected void onEnd(boolean forced) {
		this.restoreGravity();
	}

	private void restoreGravity() {
		if (this.restored) {
			return;
		}
		this.restored = true;
		for (Floater floater : this.living.values()) {
			if (floater.entity() instanceof LivingEntity livingEntity) {
				this.clearGravity(livingEntity);
			}
		}
		// Players may have been re-created (respawn / dimension change): clear by UUID as well.
		for (UUID uuid : this.living.keySet()) {
			ServerPlayerEntity player = this.world.getServer().getPlayerManager().getPlayer(uuid);
			if (player != null) {
				this.clearGravity(player);
			}
		}
		for (Floater floater : this.loose.values()) {
			Entity entity = floater.entity();
			if (!entity.isRemoved()) {
				entity.setNoGravity(false);
				entity.setVelocity(entity.getVelocity().multiply(0.3, 0.0, 0.3));
				entity.velocityDirty = true;
			}
		}
		this.living.clear();
		this.livingRising.clear();
		this.loose.clear();
	}

	private void clearGravity(LivingEntity entity) {
		EntityAttributeInstance gravity = entity.getAttributeInstance(EntityAttributes.GRAVITY);
		if (gravity != null) {
			gravity.removeModifier(MODIFIER_ID);
		}
		entity.fallDistance = 0.0;
	}
}
