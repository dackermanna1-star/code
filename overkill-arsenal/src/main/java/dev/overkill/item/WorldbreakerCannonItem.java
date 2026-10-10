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
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
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
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import java.util.function.Consumer;

/**
 * Worldbreaker Orb Cannon: hold right-click to charge (stages at 1 s, 3 s and 6 s), release to fire a
 * slow orb that drills through anything and detonates into a crater. Holding a full charge for more
 * than 2.5 seconds overloads the cannon and it backfires.
 */
public class WorldbreakerCannonItem extends Item {
	public static final int STAGE_1 = 20;
	public static final int STAGE_2 = 60;
	public static final int STAGE_3 = 120;
	public static final int BACKFIRE = 170;
	private static final int[] COOLDOWNS = {0, 50, 120, 260};
	private static final int USE_DURATION = 72000;

	public WorldbreakerCannonItem(Item.Properties properties) {
		super(properties);
	}

	public static int stageFor(int chargeTicks) {
		if (chargeTicks >= STAGE_3) {
			return 3;
		}
		if (chargeTicks >= STAGE_2) {
			return 2;
		}
		return chargeTicks >= STAGE_1 ? 1 : 0;
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
		if (charge == STAGE_1 || charge == STAGE_2 || charge == STAGE_3) {
			level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.RESPAWN_ANCHOR_CHARGE, SoundSource.PLAYERS, 1.2F, 0.5F + stage * 0.25F);
			level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.BEACON_POWER_SELECT, SoundSource.PLAYERS, 1.0F, 0.6F + stage * 0.3F);
			Fx.send(serverLevel, muzzle, 64.0, FxKind.CHARGE_STAGE, muzzle, Vec3.ZERO, stage, 0);
			if (user instanceof ServerPlayer serverPlayer) {
				Fx.shake(serverPlayer, 0.4F + stage * 0.35F, 6);
			}
		}
		if (charge % 5 == 0) {
			float progress = Math.min(charge, STAGE_3) / (float) STAGE_3;
			level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.BEACON_AMBIENT, SoundSource.PLAYERS, 0.6F + progress, 0.5F + progress * 1.3F);
		}
		if (charge > STAGE_3) {
			int overload = charge - STAGE_3;
			int beat = Math.max(3, 12 - overload / 6);
			if (overload % beat == 0) {
				level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.WARDEN_HEARTBEAT, SoundSource.PLAYERS, 1.5F, 1.0F + overload / 50.0F);
				level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.LIGHTNING_BOLT_IMPACT, SoundSource.PLAYERS, 0.35F, 1.8F);
				if (user instanceof ServerPlayer serverPlayer) {
					Fx.shake(serverPlayer, 0.3F + overload / 40.0F, 4);
					if (overload == beat) {
						serverPlayer.displayClientMessage(Component.translatable("message.overkill.worldbreaker.unstable").withStyle(ChatFormatting.RED, ChatFormatting.BOLD), true);
					}
				}
			}
			if (charge >= BACKFIRE) {
				this.backfire(serverLevel, user, stack, muzzle);
			}
		}
	}

	private void chargeParticles(Level level, LivingEntity user, int charge) {
		RandomSource random = user.getRandom();
		Vec3 muzzle = muzzle(user);
		int stage = stageFor(charge);
		float progress = Math.min(charge, STAGE_3) / (float) STAGE_3;
		float size = 0.35F + progress * 1.25F;
		level.addParticle(ModParticles.ORB_CORE, true, true, muzzle.x, muzzle.y, muzzle.z, size, 0.0, 0.0);
		int streaks = 1 + stage * 2;
		for (int i = 0; i < streaks; i++) {
			Vec3 offset = new Vec3(random.nextGaussian(), random.nextGaussian(), random.nextGaussian()).normalize().scale(1.2 + random.nextDouble() * 1.4);
			Vec3 from = muzzle.add(offset);
			Vec3 velocity = offset.scale(-0.16);
			level.addParticle(ModParticles.STATIC_SPARK, true, true, from.x, from.y, from.z, velocity.x, velocity.y, velocity.z);
		}
		if (charge > STAGE_3) {
			for (int i = 0; i < 3; i++) {
				level.addParticle(ModParticles.EMBER, true, true, muzzle.x + random.nextGaussian() * 0.3, muzzle.y + random.nextGaussian() * 0.3,
					muzzle.z + random.nextGaussian() * 0.3, random.nextGaussian() * 0.08, 0.08, random.nextGaussian() * 0.08);
			}
			if (random.nextInt(3) == 0) {
				level.addParticle(ModParticles.HEAVY_SMOKE, true, true, muzzle.x, muzzle.y, muzzle.z, 0.0, 0.05, 0.0);
			}
		}
	}

	@Override
	public boolean releaseUsing(ItemStack stack, Level level, LivingEntity user, int remaining) {
		int charge = this.getUseDuration(stack, user) - remaining;
		int stage = stageFor(charge);
		if (stage == 0) {
			if (!level.isClientSide()) {
				level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.BEACON_DEACTIVATE, SoundSource.PLAYERS, 0.8F, 1.4F);
			}
			return false;
		}
		if (level instanceof ServerLevel serverLevel) {
			Vec3 muzzle = muzzle(user);
			Vec3 look = user.getViewVector(1.0F);
			serverLevel.addFreshEntity(new WorldbreakerOrbEntity(serverLevel, user, stage, muzzle, look));

			user.push(look.scale(-0.3 * stage));
			user.hurtMarked = true;
			level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 1.0F + stage * 0.6F, 1.1F - stage * 0.17F);
			level.playSound(null, user.getX(), user.getY(), user.getZ(), SoundEvents.GENERIC_EXPLODE, SoundSource.PLAYERS, 0.8F + stage * 0.4F, 1.5F - stage * 0.2F);
			Fx.send(serverLevel, muzzle, 96.0, FxKind.MUZZLE_FLASH, muzzle, look, stage, FxKind.WEAPON_WORLDBREAKER);
			Fx.send(serverLevel, muzzle, 96.0, FxKind.ORB_LAUNCH, muzzle, look, stage, 0);
			if (user instanceof ServerPlayer serverPlayer) {
				Fx.shake(serverPlayer, 1.2F + stage * 1.1F, 8 + stage * 4);
			}
			if (user instanceof Player player) {
				player.getCooldowns().addCooldown(stack, COOLDOWNS[stage]);
			}
		}
		return true;
	}

	private void backfire(ServerLevel level, LivingEntity user, ItemStack stack, Vec3 muzzle) {
		user.stopUsingItem();
		if (user instanceof Player player) {
			player.getCooldowns().addCooldown(stack, 200);
		}
		level.explode(null, ModDamageTypes.source(level, ModDamageTypes.BACKFIRE, null), null, muzzle.x, muzzle.y, muzzle.z, 3.5F,
			ModGameRules.fire(level), ModGameRules.terrain(level) ? Level.ExplosionInteraction.TNT : Level.ExplosionInteraction.NONE);
		user.invulnerableTime = 0;
		user.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.BACKFIRE, null), 10.0F);
		user.addEffect(new MobEffectInstance(ModEffects.SEARING, 120, 1));
		user.igniteForSeconds(5.0F);
		Vec3 back = user.getViewVector(1.0F).scale(-1.6);
		user.push(back.x, 0.7, back.z);
		user.hurtMarked = true;
		level.playSound(null, muzzle.x, muzzle.y, muzzle.z, SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 2.0F, 0.5F);
		Fx.send(level, muzzle, 96.0, FxKind.BACKFIRE, muzzle, Vec3.ZERO, 1.0F, level.random.nextInt());
		Fx.shake(level, muzzle, 32.0, 6.0F, 20);
		if (user instanceof ServerPlayer serverPlayer) {
			serverPlayer.displayClientMessage(Component.translatable("message.overkill.worldbreaker.backfire").withStyle(ChatFormatting.DARK_RED, ChatFormatting.BOLD), true);
		}
	}

	@Override
	public void appendHoverText(ItemStack stack, Item.TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip, TooltipFlag flag) {
		WeaponTooltips.add(tooltip, "item.overkill.worldbreaker_cannon", 4);
	}
}
