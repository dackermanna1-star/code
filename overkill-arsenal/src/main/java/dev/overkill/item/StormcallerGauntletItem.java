package dev.overkill.item;

import dev.overkill.network.Fx;
import dev.overkill.registry.ModComponents;
import dev.overkill.util.Targeting;
import dev.overkill.weapon.StormcallerLogic;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.CustomModelData;
import net.minecraft.world.item.component.ItemAttributeModifiers;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import java.util.List;
import java.util.function.Consumer;

/**
 * Stormcaller Gauntlet: every punch stores a charge (max 10) and arcs lightning to nearby enemies.
 * Right-click looking up: Thunder Call (lightning on everything you punched recently).
 * Right-click at 10 charge: Thunderfall Slam (leap, dive, lightning shockwave).
 * Right-click with 3+ charge: Static Burst (arcs to the 5 nearest enemies).
 */
public class StormcallerGauntletItem extends Item {
	public static final int MAX_CHARGE = 10;
	private static final float LOOK_UP_PITCH = -45.0F;

	public StormcallerGauntletItem(Item.Properties properties) {
		super(properties);
	}

	public static ItemAttributeModifiers createAttributes() {
		return ItemAttributeModifiers.builder()
			.add(Attributes.ATTACK_DAMAGE, new AttributeModifier(BASE_ATTACK_DAMAGE_ID, 8.0, AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND)
			.add(Attributes.ATTACK_SPEED, new AttributeModifier(BASE_ATTACK_SPEED_ID, -2.4, AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND)
			.build();
	}

	public static int getCharge(ItemStack stack) {
		return stack.getOrDefault(ModComponents.STORM_CHARGE, 0);
	}

	public static void setCharge(ItemStack stack, int charge) {
		int clamped = Math.max(0, Math.min(MAX_CHARGE, charge));
		stack.set(ModComponents.STORM_CHARGE, clamped);
		stack.set(DataComponents.CUSTOM_MODEL_DATA, new CustomModelData(List.of((float) clamped), List.of(), List.of(), List.of()));
	}

	private static Vec3 fist(LivingEntity user) {
		return user.getEyePosition().add(user.getViewVector(1.0F).scale(0.8)).add(0.0, -0.45, 0.0);
	}

	@Override
	public void hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
		if (!(attacker.level() instanceof ServerLevel level)) {
			return;
		}
		int previous = getCharge(stack);
		int charge = Math.min(MAX_CHARGE, previous + 1);
		setCharge(stack, charge);
		stack.set(ModComponents.STORM_LAST_HIT, level.getGameTime());
		if (attacker instanceof Player player) {
			StormcallerLogic.recordHit(player, target);
		}
		StormcallerLogic.chain(level, attacker, target, fist(attacker), charge / 3, 3.0F + charge * 0.6F);
		if (charge == MAX_CHARGE && previous < MAX_CHARGE) {
			level.playSound(null, attacker.getX(), attacker.getY(), attacker.getZ(), SoundEvents.BEACON_POWER_SELECT, SoundSource.PLAYERS, 1.0F, 1.6F);
			level.playSound(null, attacker.getX(), attacker.getY(), attacker.getZ(), SoundEvents.TRIDENT_THUNDER, SoundSource.PLAYERS, 0.6F, 1.6F);
			if (attacker instanceof ServerPlayer player) {
				player.displayClientMessage(Component.translatable("message.overkill.stormcaller.full").withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD), true);
			}
		}
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		int charge = getCharge(stack);

		if (player.getXRot() < LOOK_UP_PITCH) {
			if (charge < 1) {
				return this.fail(player, "message.overkill.stormcaller.no_charge");
			}
			if (level instanceof ServerLevel serverLevel) {
				int struck = StormcallerLogic.thunderCall(serverLevel, player, charge);
				if (struck == 0) {
					return this.fail(player, "message.overkill.stormcaller.no_targets");
				}
				setCharge(stack, 0);
				player.getCooldowns().addCooldown(stack, 30);
				Vec3 hand3 = fist(player);
				StormcallerLogic.arc(serverLevel, hand3, hand3.add(0.0, 12.0, 0.0), 1.4F);
				level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.TRIDENT_THUNDER, SoundSource.PLAYERS, 2.0F, 1.0F);
				if (player instanceof ServerPlayer serverPlayer) {
					Fx.shake(serverPlayer, 1.5F, 10);
				}
			}
			return InteractionResult.SUCCESS;
		}

		if (charge >= MAX_CHARGE) {
			if (player instanceof ServerPlayer serverPlayer) {
				StormcallerLogic.startSlam(serverPlayer);
				setCharge(stack, 0);
				player.getCooldowns().addCooldown(stack, 40);
			}
			return InteractionResult.SUCCESS;
		}

		if (charge >= 3) {
			if (level instanceof ServerLevel serverLevel) {
				List<LivingEntity> targets = serverLevel.getEntitiesOfClass(LivingEntity.class, player.getBoundingBox().inflate(10.0),
					e -> e.distanceTo(player) <= 10.0 && Targeting.canHurt(player, e));
				if (targets.isEmpty()) {
					return this.fail(player, "message.overkill.stormcaller.no_targets");
				}
				targets.sort((a, b) -> Double.compare(a.distanceToSqr(player), b.distanceToSqr(player)));
				Vec3 origin = fist(player);
				for (LivingEntity target : targets.subList(0, Math.min(5, targets.size()))) {
					StormcallerLogic.chain(serverLevel, player, target, origin, 0, 6.0F + charge);
				}
				setCharge(stack, charge - 3);
				player.getCooldowns().addCooldown(stack, 15);
				level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.LIGHTNING_BOLT_IMPACT, SoundSource.PLAYERS, 1.2F, 1.2F);
			}
			return InteractionResult.SUCCESS;
		}
		return this.fail(player, "message.overkill.stormcaller.low_charge");
	}

	private InteractionResult fail(Player player, String key) {
		if (!player.level().isClientSide()) {
			player.displayClientMessage(Component.translatable(key).withStyle(ChatFormatting.GRAY), true);
		}
		return InteractionResult.FAIL;
	}

	@Override
	public void inventoryTick(ItemStack stack, ServerLevel level, Entity entity, EquipmentSlot slot) {
		int charge = getCharge(stack);
		if (charge <= 0 || level.getGameTime() % 40 != 0) {
			return;
		}
		long lastHit = stack.getOrDefault(ModComponents.STORM_LAST_HIT, 0L);
		if (level.getGameTime() - lastHit > 300) {
			setCharge(stack, charge - 1);
		}
	}

	@Override
	public boolean isBarVisible(ItemStack stack) {
		return getCharge(stack) > 0;
	}

	@Override
	public int getBarWidth(ItemStack stack) {
		return Math.round(13.0F * getCharge(stack) / MAX_CHARGE);
	}

	@Override
	public int getBarColor(ItemStack stack) {
		return getCharge(stack) >= MAX_CHARGE ? 0xFFFFFF : 0x6FE3FF;
	}

	@Override
	public void appendHoverText(ItemStack stack, Item.TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip, TooltipFlag flag) {
		tooltip.accept(Component.translatable("item.overkill.stormcaller_gauntlet.charge", getCharge(stack), MAX_CHARGE).withStyle(ChatFormatting.AQUA));
		WeaponTooltips.add(tooltip, "item.overkill.stormcaller_gauntlet", 4);
	}
}
