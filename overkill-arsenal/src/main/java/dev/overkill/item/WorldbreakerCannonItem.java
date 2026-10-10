package dev.overkill.item;

import dev.overkill.entity.WorldbreakerOrbEntity;
import dev.overkill.network.Fx;
import dev.overkill.network.FxKind;
import dev.overkill.registry.ModDamageTypes;
import dev.overkill.registry.ModEffects;
import dev.overkill.registry.ModGameRules;
import dev.overkill.registry.ModParticles;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Worldbreaker Orb Cannon: hold right-click to charge for up to 20 seconds, release to fire an orb
 * that tears through hundreds of blocks per second and detonates into a crater. The longer the
 * charge, the faster, wider, deeper and deadlier the shot. Holding a full charge for more than
 * 3 seconds overloads the cannon and it backfires.
 */
public class WorldbreakerCannonItem extends Item {
	/** The shortest charge that fires anything (1 s). */
	public static final int MIN_CHARGE = 20;
	/** Full power (20 s). */
	public static final int FULL_CHARGE = 400;
	/** How long a full charge can be held before it backfires (3 s). */
	public static final int OVERLOAD_GRACE = 60;
	/** Charge stages I to V, for sounds, flashes and the barrel glow. */
	private static final int[] STAGES = {MIN_CHARGE, 100, 200, 300, FULL_CHARGE};
	private static final int METER_SEGMENTS = 20;
	private static final int USE_DURATION = 72000;

	public WorldbreakerCannonItem(Item.Properties properties) {
		super(properties);
	}

	/** Shot power: 0 for a 1 second charge, 1 for a full 20 second charge. */
	public static float powerFor(int chargeTicks) {
		return Mth.clamp((chargeTicks - MIN_CHARGE) / (float) (FULL_CHARGE - MIN_CHARGE), 0.0F, 1.0F);
	}

	/** 0 (not ready) to 5 (full). */
	public static int stageFor(int chargeTicks) {
		int stage = 0;
		for (int threshold : STAGES) {
			if (chargeTicks >= threshold) {
				stage++;
			}
		}
		return stage;
	}

	public static Vec3 muzzle(LivingEntity user) {
		Vec3 look = user.getViewVector(1.0F);
		Vec3 right = look.cross(new Vec3(0.0, 1.0, 0.0));
		right = right.lengthSqr() < 1.0E-4 ? new Vec3(1.0, 0.0, 0.0) : right.normalize();
		HumanoidArm arm = user.getUsedItemHand() == InteractionHand.MAIN_HAND ? user.getMainArm() : user.getMainArm().getOpposite();
		double side = arm == HumanoidArm.RIGHT ? 0.35 : -0.35;
		return user.getEyePosition().add(look.scale(1.3)).add(right.scale(side)).add(0.0, -0.3, 0.0);
	}

	@Override
	public int getUseDuration(ItemStack stack, LivingEntity user) {
		return USE_DURATION;
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.BOW;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		player.startUsingItem(hand);
		if (!level.isClientSide()) {
			level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.BEACON_ACTIVATE, SoundSource.PLAYERS, 0.8F, 0.6F);
		}
		return InteractionResult.CONSUME;
	}

	@Override
	public void onUseTick(Level level, LivingEntity user, ItemStack stack, int remaining) {
		int charge = this.getUseDuration(stack, user) - remaining;
		if (user instanceof Player player && player.getCooldowns().isOnCooldown(stack)) {
			user.stopUsingItem();
			return;
		}
		if (level.isClientSide()) {
			this.chargeParticles(level, user, charge);
			return;
		}
		ServerLevel serverLevel = (ServerLevel) level;
		Vec3 muzzle = muzzle(user);
		int stage = stageFor(charge);
		float progress = Math.min(charge, FULL_CHARGE) / (float) FULL_CHARGE;
		for (int threshold : STAGES) {
			if (charge == threshold) {
				level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.RESPAWN_ANCHOR_CHARGE, SoundSource.PLAYERS, 1.2F + stage * 0.3F, 0.4F + stage * 0.2F);
				level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.BEACON_POWER_SELECT, SoundSource.PLAYERS, 1.0F + stage * 0.2F, 0.5F + stage * 0.25F);
				if (stage == STAGES.length) {
					level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 1.5F, 0.5F);
					level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.END_PORTAL_SPAWN, SoundSource.PLAYERS, 1.0F, 1.6F);
				}
				Fx.send(serverLevel, muzzle, 64.0 + stage * 16.0, FxKind.CHARGE_STAGE, muzzle, Vec3.ZERO, stage, 0);
				if (user instanceof ServerPlayer serverPlayer) {
					Fx.shake(serverPlayer, 0.4F + stage * 0.3F, 6 + stage);
				}
			}
		}
		if (charge % 5 == 0) {
			level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.BEACON_AMBIENT, SoundSource.PLAYERS, 0.6F + progress * 1.6F, 0.5F + progress * 1.4F);
		}
		if (charge > 100 && charge % 3 == 0) {
			// The air around the barrel starts to crackle.
			level.playSound(null, muzzle.x, muzzle.y, muzzle.z, SoundEvents.AMETHYST_BLOCK_CHIME, SoundSource.PLAYERS, 0.4F + progress, 0.5F + progress);
		}
		if (charge % 10 == 0 && charge > MIN_CHARGE && user instanceof ServerPlayer serverPlayer) {
			Fx.shake(serverPlayer, 0.1F + progress * 0.5F, 10);
		}
		if (charge % 2 == 0 && user instanceof ServerPlayer serverPlayer) {
			serverPlayer.displayClientMessage(meter(charge), true);
		}
		if (charge > FULL_CHARGE) {
			int overload = charge - FULL_CHARGE;
			int beat = Math.max(3, 12 - overload / 6);
			if (overload % beat == 0) {
				level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.WARDEN_HEARTBEAT, SoundSource.PLAYERS, 1.5F, 1.0F + overload / 50.0F);
				level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.LIGHTNING_BOLT_IMPACT, SoundSource.PLAYERS, 0.35F, 1.8F);
				if (user instanceof ServerPlayer serverPlayer) {
					Fx.shake(serverPlayer, 0.3F + overload / 40.0F, 4);
				}
			}
			if (overload >= OVERLOAD_GRACE) {
				this.backfire(serverLevel, user, stack, muzzle);
			}
		}
	}

	/** Action bar charge meter: twenty pips, gold while charging, white when full, flashing red when overloading. */
	private static Component meter(int charge) {
		float progress = Math.min(charge, FULL_CHARGE) / (float) FULL_CHARGE;
		int filled = Math.round(progress * METER_SEGMENTS);
		boolean full = charge >= FULL_CHARGE;
		boolean overload = charge > FULL_CHARGE;
		ChatFormatting fill = overload ? (charge / 3 % 2 == 0 ? ChatFormatting.RED : ChatFormatting.DARK_RED)
			: full ? ChatFormatting.WHITE
			: charge >= MIN_CHARGE ? ChatFormatting.GOLD : ChatFormatting.GRAY;
		MutableComponent bar = Component.literal("|".repeat(filled)).withStyle(fill, ChatFormatting.BOLD)
			.append(Component.literal("|".repeat(METER_SEGMENTS - filled)).withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.BOLD));
		String key = overload ? "message.overkill.worldbreaker.unstable" : full ? "message.overkill.worldbreaker.full" : "message.overkill.worldbreaker.charge";
		Component label = Component.translatable(key, Math.round(progress * 100.0F)).withStyle(overload ? ChatFormatting.RED : ChatFormatting.AQUA, ChatFormatting.BOLD);
		return Component.empty().append(label).append(" ").append(bar);
	}

	private void chargeParticles(Level level, LivingEntity user, int charge) {
		RandomSource random = user.getRandom();
		Vec3 muzzle = muzzle(user);
		int stage = stageFor(charge);
		float progress = Math.min(charge, FULL_CHARGE) / (float) FULL_CHARGE;
		float size = 0.35F + (float) Math.sqrt(progress) * 2.2F;
		level.addParticle(ModParticles.ORB_CORE, true, true, muzzle.x, muzzle.y, muzzle.z, size, 0.0, 0.0);
		int streaks = 1 + stage * 2;
		for (int i = 0; i < streaks; i++) {
			Vec3 offset = new Vec3(random.nextGaussian(), random.nextGaussian(), random.nextGaussian()).normalize().scale(1.2 + random.nextDouble() * (1.4 + stage * 0.5));
			Vec3 from = muzzle.add(offset);
			Vec3 velocity = offset.scale(-0.16);
			level.addParticle(ModParticles.STATIC_SPARK, true, true, from.x, from.y, from.z, velocity.x, velocity.y, velocity.z);
		}
		if (stage >= 3) {
			// Energy gets dragged in from the air in front of the barrel.
			Vec3 look = user.getViewVector(1.0F);
			for (int i = 0; i < (stage - 2) * 2; i++) {
				Vec3 offset = look.scale(2.5 + random.nextDouble() * 3.5)
					.add(random.nextGaussian() * 1.6, random.nextGaussian() * 1.2, random.nextGaussian() * 1.6);
				Vec3 from = muzzle.add(offset);
				Vec3 velocity = offset.scale(-0.14);
				level.addParticle(ModParticles.STATIC_SPARK, true, true, from.x, from.y, from.z, velocity.x, velocity.y, velocity.z);
			}
			if (random.nextInt(6 - Math.min(stage, 5)) == 0) {
				level.addParticle(ModParticles.ARC, true, true, muzzle.x + random.nextGaussian() * size * 0.5, muzzle.y + random.nextGaussian() * size * 0.5,
					muzzle.z + random.nextGaussian() * size * 0.5, 0.8, 0.8, 3.0);
			}
		}
		if (charge >= FULL_CHARGE && random.nextInt(2) == 0) {
			level.addParticle(ModParticles.EMBER, true, true, muzzle.x + random.nextGaussian() * 0.3, muzzle.y + random.nextGaussian() * 0.3,
				muzzle.z + random.nextGaussian() * 0.3, random.nextGaussian() * 0.08, 0.08, random.nextGaussian() * 0.08);
			if (random.nextInt(3) == 0) {
				level.addParticle(ModParticles.HEAVY_SMOKE, true, true, muzzle.x, muzzle.y, muzzle.z, 0.0, 0.05, 0.0);
			}
		}
	}

	@Override
	public boolean releaseUsing(ItemStack stack, Level level, LivingEntity user, int remaining) {
		int charge = this.getUseDuration(stack, user) - remaining;
		if (charge < MIN_CHARGE) {
			if (!level.isClientSide()) {
				level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.BEACON_DEACTIVATE, SoundSource.PLAYERS, 0.8F, 1.4F);
			}
			return false;
		}
		if (level instanceof ServerLevel serverLevel) {
			float power = powerFor(charge);
			float fx = WorldbreakerOrbEntity.fxScale(power);
			Vec3 muzzle = muzzle(user);
			Vec3 look = user.getViewVector(1.0F);
			serverLevel.addFreshEntity(new WorldbreakerOrbEntity(serverLevel, user, power, muzzle, look));

			Vec3 kick = look.scale(-(0.25 + 0.6 * power));
			user.push(kick.x, kick.y * 0.5 + 0.1 * power, kick.z);
			user.hurtMarked = true;
			level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 1.6F + power * 4.0F, 1.1F - power * 0.6F);
			level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.GENERIC_EXPLODE, SoundSource.PLAYERS, 1.2F + power * 3.0F, 1.3F - power * 0.6F);
			if (power > 0.5F) {
				level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.PLAYERS, 2.0F + power * 3.0F, 0.6F);
			}
			Fx.send(serverLevel, muzzle, 128.0, FxKind.MUZZLE_FLASH, muzzle, look, fx, FxKind.WEAPON_WORLDBREAKER);
			Fx.send(serverLevel, muzzle, 128.0, FxKind.ORB_LAUNCH, muzzle, look, fx, 0);
			Fx.shake(serverLevel, muzzle, 32.0 + 64.0 * power, 1.0F + 3.0F * power, 10 + (int) (10 * power));
			if (user instanceof ServerPlayer serverPlayer) {
				Fx.shake(serverPlayer, 1.5F + 4.5F * power, 10 + (int) (20 * power));
			}
			if (user instanceof Player player) {
				player.getCooldowns().addCooldown(stack, 40 + (int) (200 * power));
			}
		}
		return true;
	}

	private void backfire(ServerLevel level, LivingEntity user, ItemStack stack, Vec3 muzzle) {
		user.stopUsingItem();
		if (user instanceof Player player) {
			player.getCooldowns().addCooldown(stack, 300);
		}
		level.explode(null, ModDamageTypes.source(level, ModDamageTypes.BACKFIRE, null), null, muzzle.x, muzzle.y, muzzle.z, 5.0F,
			ModGameRules.fire(level), ModGameRules.terrain(level) ? Level.ExplosionInteraction.BLOCK : Level.ExplosionInteraction.NONE);
		user.invulnerableTime = 0;
		user.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.BACKFIRE, null), 16.0F);
		user.addEffect(new MobEffectInstance(ModEffects.SEARING, 160, 1));
		user.igniteForSeconds(6.0F);
		Vec3 back = user.getViewVector(1.0F).scale(-2.0);
		user.push(back.x, 0.8, back.z);
		user.hurtMarked = true;
		level.playSound(null, muzzle.x, muzzle.y, muzzle.z, SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 2.5F, 0.5F);
		Fx.send(level, muzzle, 96.0, FxKind.BACKFIRE, muzzle, Vec3.ZERO, 1.0F, level.random.nextInt());
		Fx.shake(level, muzzle, 40.0, 6.0F, 22);
		if (user instanceof ServerPlayer serverPlayer) {
			serverPlayer.displayClientMessage(Component.translatable("message.overkill.worldbreaker.backfire").withStyle(ChatFormatting.DARK_RED, ChatFormatting.BOLD), true);
		}
	}
}
