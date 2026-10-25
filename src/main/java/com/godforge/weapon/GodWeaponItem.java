package com.godforge.weapon;

import com.godforge.config.GodforgeConfig;
import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModComponents;
import com.godforge.registry.ModParticles;
import java.util.List;
import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.CustomModelData;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Base class for the ten god weapons. Handles permissions, cooldowns, mode/settings bookkeeping and the
 * charge-then-release flow; subclasses implement the actual abilities on the server.
 */
public abstract class GodWeaponItem extends Item {
	public static final int USE_DURATION = 72000;
	protected final WeaponType type;

	protected GodWeaponItem(WeaponType type, Properties properties) {
		super(properties.component(ModComponents.SETTINGS, type.defaultSettings()));
		this.type = type;
	}

	public WeaponType type() {
		return this.type;
	}

	public static WeaponSettings settings(ItemStack stack) {
		if (stack.getItem() instanceof GodWeaponItem weapon) {
			return weapon.type.sanitize(stack.getOrDefault(ModComponents.SETTINGS, weapon.type.defaultSettings()));
		}
		return WeaponSettings.EMPTY;
	}

	public WeaponMode mode(ItemStack stack) {
		return this.type.mode(settings(stack).mode());
	}

	protected GodforgeConfig.WeaponTuning tuning() {
		return GodforgeConfig.get().tuning(this.type);
	}

	/** Writes settings and refreshes the model data the item renderer uses for tints/variants. */
	public static void applySettings(ItemStack stack, WeaponSettings settings) {
		if (!(stack.getItem() instanceof GodWeaponItem weapon)) {
			return;
		}
		WeaponSettings clean = weapon.type.sanitize(settings);
		stack.set(ModComponents.SETTINGS, clean);
		int tint = weapon.type == WeaponType.LASER_BEAM ? BeamColors.rgb(clean.color(), 0) : weapon.type.color();
		stack.set(
			DataComponents.CUSTOM_MODEL_DATA,
			new CustomModelData(List.of(), List.of(), List.of(weapon.type.mode(clean.mode()).key()), List.of(tint))
		);
	}

	// ------------------------------------------------------------------ use flow

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		WeaponMode mode = this.mode(stack);
		if (player.getCooldowns().isOnCooldown(stack)) {
			return InteractionResult.FAIL;
		}
		if (player instanceof ServerPlayer serverPlayer) {
			Component deny = WeaponAccess.denyReason(serverPlayer, this.type, mode);
			if (deny != null) {
				serverPlayer.displayClientMessage(deny.copy().withStyle(ChatFormatting.RED), true);
				return InteractionResult.FAIL;
			}
		}
		if (this.firesInstantly(stack, mode)) {
			if (level instanceof ServerLevel serverLevel && player instanceof ServerPlayer serverPlayer) {
				if (this.fireInstant(serverLevel, serverPlayer, hand, stack, mode)) {
					this.applyCooldown(serverPlayer, stack, mode);
				}
			}
			return InteractionResult.SUCCESS;
		}
		player.startUsingItem(hand);
		if (level instanceof ServerLevel serverLevel && player instanceof ServerPlayer serverPlayer) {
			this.onStartCharging(serverLevel, serverPlayer, stack, mode);
		}
		return InteractionResult.CONSUME;
	}

	/** Modes that act on click instead of on release. */
	protected boolean firesInstantly(ItemStack stack, WeaponMode mode) {
		return mode.chargeTicks() == 0 && !this.isChanneled(mode);
	}

	/** Channeled modes act every tick while use is held (e.g. the laser). */
	protected boolean isChanneled(WeaponMode mode) {
		return false;
	}

	@Override
	public int getUseDuration(ItemStack stack, LivingEntity entity) {
		return USE_DURATION;
	}

	@Override
	public ItemUseAnimation getUseAnimation(ItemStack stack) {
		return ItemUseAnimation.TRIDENT;
	}

	public static int usedTicks(ItemStack stack, LivingEntity entity, int remaining) {
		return USE_DURATION - remaining;
	}

	/** 0..1 charge progress for the current mode. */
	public float chargeFraction(ItemStack stack, int usedTicks) {
		WeaponMode mode = this.mode(stack);
		if (mode.chargeTicks() <= 0) {
			return 1.0F;
		}
		return Mth.clamp(usedTicks / (float) mode.chargeTicks(), 0.0F, 1.0F);
	}

	@Override
	public void onUseTick(Level level, LivingEntity entity, ItemStack stack, int remaining) {
		int used = usedTicks(stack, entity, remaining);
		WeaponMode mode = this.mode(stack);
		if (level instanceof ServerLevel serverLevel) {
			if (entity instanceof ServerPlayer player) {
				this.onChargeTick(serverLevel, player, stack, mode, used);
			}
		} else {
			this.clientChargeVisuals(level, entity, stack, mode, used);
		}
	}

	@Override
	public boolean releaseUsing(ItemStack stack, Level level, LivingEntity entity, int remaining) {
		if (level instanceof ServerLevel serverLevel && entity instanceof ServerPlayer player) {
			int used = usedTicks(stack, entity, remaining);
			WeaponMode mode = this.mode(stack);
			Component deny = WeaponAccess.denyReason(player, this.type, mode, !this.isChanneled(mode));
			if (deny != null) {
				player.displayClientMessage(deny.copy().withStyle(ChatFormatting.RED), true);
				this.onCancelled(serverLevel, player, stack, mode);
				return false;
			}
			if (this.onRelease(serverLevel, player, stack, mode, used)) {
				this.applyCooldown(player, stack, mode);
				return true;
			}
			return false;
		}
		return true;
	}

	protected void applyCooldown(ServerPlayer player, ItemStack stack, WeaponMode mode) {
		if (mode.ultimate()) {
			UltimateCooldowns.start(player, this.type, this.tuning().ultimateCooldownTicks);
		}
		int ticks = this.tuning().cooldownTicks;
		if (ticks > 0 && !UltimateCooldowns.bypass(player)) {
			player.getCooldowns().addCooldown(stack, mode.ultimate() ? Math.max(ticks, 40) : ticks);
		}
	}

	// ------------------------------------------------------------------ hooks

	/** Fire an instant mode. Return true if something happened (cooldown is then applied). */
	protected boolean fireInstant(ServerLevel level, ServerPlayer player, InteractionHand hand, ItemStack stack, WeaponMode mode) {
		return false;
	}

	protected void onStartCharging(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
	}

	/** Called every tick while use is held. */
	protected void onChargeTick(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int usedTicks) {
	}

	/** Called when use is released. Return true if the ability fired (cooldown is then applied). */
	protected boolean onRelease(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode, int usedTicks) {
		return false;
	}

	protected void onCancelled(ServerLevel level, ServerPlayer player, ItemStack stack, WeaponMode mode) {
	}

	/** Client-side charging sparkle; runs for every player that is charging (including remote ones). */
	protected void clientChargeVisuals(Level level, LivingEntity entity, ItemStack stack, WeaponMode mode, int usedTicks) {
		if (mode.chargeTicks() <= 0) {
			return;
		}
		float charge = this.chargeFraction(stack, usedTicks);
		RandomSource random = level.getRandom();
		Vec3 hand = handPosition(entity, 1.0F);
		int count = 1 + (int) (charge * 3);
		for (int i = 0; i < count; i++) {
			double angle = random.nextDouble() * Math.PI * 2;
			double r = 0.6 + random.nextDouble() * 0.9 * (1.0 - charge * 0.5);
			double ox = Math.cos(angle) * r;
			double oz = Math.sin(angle) * r;
			double oy = (random.nextDouble() - 0.5) * r;
			int color = mode.ultimate() ? this.type.accent() : this.type.color();
			level.addParticle(
				FxParticleOptions.of(ModParticles.GLOW, color, this.type.accent(), 0.08F + charge * 0.1F, 10, 0.0F,
					FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_ATTRACT | FxParticleOptions.F_NO_PHYSICS),
				hand.x + ox, hand.y + oy, hand.z + oz, hand.x, hand.y, hand.z
			);
		}
		if (charge >= 1.0F && usedTicks % 4 == 0) {
			level.addParticle(
				FxParticleOptions.of(ModParticles.STAR, 0xFFFFFF, this.type.color(), 0.35F, 8, 0.0F, FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_NO_PHYSICS),
				hand.x, hand.y, hand.z, 0, 0, 0
			);
		}
	}

	/** Approximate world position of the wielder's weapon hand. */
	public static Vec3 handPosition(LivingEntity entity, float partialTick) {
		Vec3 eye = entity.getEyePosition(partialTick);
		Vec3 look = entity.getViewVector(partialTick);
		float yaw = entity.getViewYRot(partialTick) * Mth.DEG_TO_RAD;
		Vec3 right = new Vec3(-Math.cos(yaw), 0, -Math.sin(yaw));
		return eye.add(look.scale(0.9)).add(right.scale(0.35)).add(0, -0.25, 0);
	}

	// ------------------------------------------------------------------ presentation

	@Override
	public boolean isFoil(ItemStack stack) {
		return false;
	}

	@Override
	@SuppressWarnings("deprecation")
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip, TooltipFlag flag) {
		tooltip.accept(Component.translatable(this.type.translationKey() + ".title").withStyle(style -> style.withColor(this.type.color()).withItalic(true)));
		WeaponMode mode = this.mode(stack);
		tooltip.accept(
			Component.translatable("tooltip.godforge.mode", Component.translatable(mode.translationKey()).withStyle(mode.ultimate() ? ChatFormatting.GOLD : ChatFormatting.AQUA))
				.withStyle(ChatFormatting.GRAY)
		);
		for (int i = 1; i <= 3; i++) {
			String key = this.type.translationKey() + ".lore" + i;
			tooltip.accept(Component.translatable(key).withStyle(ChatFormatting.DARK_GRAY));
		}
		tooltip.accept(Component.translatable("tooltip.godforge.controls").withStyle(ChatFormatting.DARK_AQUA));
	}
}
