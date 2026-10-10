package dev.overkill.item;

import dev.overkill.OverkillArsenal;
import dev.overkill.entity.RiftEntity;
import dev.overkill.network.Fx;
import dev.overkill.network.FxKind;
import dev.overkill.registry.ModComponents;
import dev.overkill.util.Targeting;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.npc.Npc;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.ItemAttributeModifiers;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import java.util.Comparator;
import java.util.List;

/**
 * Riftfang Scythe: every hit slices space and leaves a tear that swallows enemies and drops them
 * from the sky. Right-click hurls a travelling rift; sneak + right-click opens Void Harvest, a maw
 * under every enemy within 20 blocks that spits them out high in the sky.
 */
public class RiftfangScytheItem extends Item {
	public static final int REND_COOLDOWN = 50;
	public static final int ULTIMATE_COOLDOWN = 600;
	public static final double ULTIMATE_RANGE = 20.0;

	public RiftfangScytheItem(Item.Properties properties) {
		super(properties);
	}

	public static ItemAttributeModifiers createAttributes() {
		return ItemAttributeModifiers.builder()
			.add(Attributes.ATTACK_DAMAGE, new AttributeModifier(BASE_ATTACK_DAMAGE_ID, 15.0, AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND)
			.add(Attributes.ATTACK_SPEED, new AttributeModifier(BASE_ATTACK_SPEED_ID, -3.0, AttributeModifier.Operation.ADD_VALUE), EquipmentSlotGroup.MAINHAND)
			.add(Attributes.ENTITY_INTERACTION_RANGE, new AttributeModifier(OverkillArsenal.id("riftfang_reach"), 1.5, AttributeModifier.Operation.ADD_VALUE),
				EquipmentSlotGroup.MAINHAND)
			.build();
	}

	@Override
	public void hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
		if (attacker.level() instanceof ServerLevel level) {
			Vec3 center = target.getBoundingBox().getCenter();
			float roll = (attacker.getRandom().nextFloat() - 0.5F) * 1.2F;
			RiftEntity.slash(level, attacker, center, attacker.getYRot(), roll, 2.8F, 60);
			level.playSound(null, center.x, center.y, center.z, SoundEvents.ENDERMAN_TELEPORT, SoundSource.PLAYERS, 0.8F, 0.5F);
			level.playSound(null, center.x, center.y, center.z, SoundEvents.PLAYER_ATTACK_SWEEP, SoundSource.PLAYERS, 1.0F, 0.6F);
		}
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (player.isSecondaryUseActive()) {
			return this.voidHarvest(level, player, stack);
		}
		if (level instanceof ServerLevel serverLevel) {
			Vec3 look = player.getViewVector(1.0F);
			Vec3 start = player.getEyePosition().add(look.scale(1.6)).add(0.0, -0.3, 0.0);
			float roll = (player.getRandom().nextFloat() - 0.5F) * 0.5F;
			RiftEntity.wave(serverLevel, player, start, look.scale(1.25), player.getYRot(), roll, 3.4F, 24);
			level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.PLAYER_ATTACK_SWEEP, SoundSource.PLAYERS, 1.2F, 0.5F);
			level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.ILLUSIONER_MIRROR_MOVE, SoundSource.PLAYERS, 1.0F, 0.7F);
			level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.ENDERMAN_TELEPORT, SoundSource.PLAYERS, 0.8F, 0.6F);
			player.getCooldowns().addCooldown(stack, REND_COOLDOWN);
		}
		return InteractionResult.SUCCESS;
	}

	private InteractionResult voidHarvest(Level level, Player player, ItemStack stack) {
		int recharge = stack.getOrDefault(ModComponents.ULTIMATE_RECHARGE, 0);
		if (recharge > 0) {
			if (!level.isClientSide()) {
				int seconds = (recharge + 19) / 20;
				player.displayClientMessage(Component.translatable("message.overkill.riftfang.recharging", seconds).withStyle(ChatFormatting.DARK_PURPLE), true);
			}
			return InteractionResult.FAIL;
		}
		if (!(level instanceof ServerLevel serverLevel)) {
			return InteractionResult.SUCCESS;
		}
		List<LivingEntity> targets = serverLevel.getEntitiesOfClass(LivingEntity.class, player.getBoundingBox().inflate(ULTIMATE_RANGE),
			e -> e.distanceTo(player) <= ULTIMATE_RANGE && !(e instanceof Npc) && Targeting.canHurt(player, e));
		if (targets.isEmpty()) {
			player.displayClientMessage(Component.translatable("message.overkill.riftfang.no_targets").withStyle(ChatFormatting.GRAY), true);
			return InteractionResult.FAIL;
		}
		targets.sort(Comparator.comparingDouble(e -> e.distanceToSqr(player)));
		int count = Math.min(targets.size(), 40);
		for (int i = 0; i < count; i++) {
			RiftEntity.maw(serverLevel, player, targets.get(i), i * 2);
		}
		stack.set(ModComponents.ULTIMATE_RECHARGE, ULTIMATE_COOLDOWN);
		player.getCooldowns().addCooldown(stack, 40);

		Vec3 at = player.position();
		level.playSound(null, at.x, at.y, at.z, SoundEvents.ELDER_GUARDIAN_CURSE, SoundSource.PLAYERS, 1.5F, 0.5F);
		level.playSound(null, at.x, at.y, at.z, SoundEvents.END_PORTAL_SPAWN, SoundSource.PLAYERS, 0.8F, 1.5F);
		Fx.send(serverLevel, at, 96.0, FxKind.RIFT_OPEN, at.add(0.0, 1.0, 0.0), new Vec3(0.0, 1.0, 0.0), 6.0F, 0);
		Fx.shake(serverLevel, at, 40.0, 2.5F, 20);
		if (player instanceof ServerPlayer serverPlayer) {
			serverPlayer.displayClientMessage(Component.translatable("message.overkill.riftfang.harvest", count).withStyle(ChatFormatting.LIGHT_PURPLE, ChatFormatting.BOLD), true);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public boolean isBarVisible(ItemStack stack) {
		return stack.getOrDefault(ModComponents.ULTIMATE_RECHARGE, 0) > 0;
	}

	@Override
	public int getBarWidth(ItemStack stack) {
		int recharge = stack.getOrDefault(ModComponents.ULTIMATE_RECHARGE, 0);
		return Math.round(13.0F * (1.0F - recharge / (float) ULTIMATE_COOLDOWN));
	}

	@Override
	public int getBarColor(ItemStack stack) {
		return 0xB45CFF;
	}

	@Override
	public void inventoryTick(ItemStack stack, ServerLevel level, net.minecraft.world.entity.Entity entity, net.minecraft.world.entity.EquipmentSlot slot) {
		int recharge = stack.getOrDefault(ModComponents.ULTIMATE_RECHARGE, 0);
		if (recharge <= 0 || level.getGameTime() % 10 != 0) {
			return;
		}
		recharge -= 10;
		if (recharge > 0) {
			stack.set(ModComponents.ULTIMATE_RECHARGE, recharge);
		} else {
			stack.remove(ModComponents.ULTIMATE_RECHARGE);
			if (entity instanceof ServerPlayer player && (slot == net.minecraft.world.entity.EquipmentSlot.MAINHAND || slot == net.minecraft.world.entity.EquipmentSlot.OFFHAND)) {
				player.displayClientMessage(Component.translatable("message.overkill.riftfang.ready").withStyle(ChatFormatting.LIGHT_PURPLE), true);
				level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.AMETHYST_BLOCK_RESONATE, SoundSource.PLAYERS, 1.0F, 0.6F);
			}
		}
	}
}
