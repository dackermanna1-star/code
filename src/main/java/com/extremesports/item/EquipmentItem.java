package com.extremesports.item;

import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.registry.ModDataComponents;
import com.extremesports.registry.ModEntities;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.sport.EquipmentStats;
import com.extremesports.sport.PartCatalog;
import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Using the item drops the equipment under the rider's feet and mounts it immediately.
 */
public class EquipmentItem extends Item {
	private final EquipmentKind kind;

	public EquipmentItem(EquipmentKind kind, Properties properties) {
		super(properties);
		this.kind = kind;
	}

	public EquipmentKind kind() {
		return kind;
	}

	public static EquipmentConfig config(ItemStack stack) {
		EquipmentConfig config = stack.get(ModDataComponents.EQUIPMENT_CONFIG);
		return config == null ? EquipmentConfig.EMPTY : config;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (player.isPassenger()) {
			return InteractionResult.FAIL;
		}
		if (level instanceof ServerLevel serverLevel) {
			SportEquipmentEntity entity = ModEntities.forSport(kind.sport()).create(serverLevel, net.minecraft.world.entity.EntitySpawnReason.SPAWN_ITEM_USE);
			if (entity == null) {
				return InteractionResult.FAIL;
			}
			Vec3 pos = player.position();
			ItemStack placed = stack.copyWithCount(1);
			placed.set(com.extremesports.registry.ModDataComponents.EQUIPMENT_CONFIG, config(stack).sanitized(kind));
			entity.setItem(placed);
			entity.snapTo(pos.x, pos.y, pos.z, player.getYRot(), 0.0F);
			entity.setOwner(player.getUUID());
			Vec3 motion = player.getDeltaMovement();
			entity.setDeltaMovement(motion.x * 0.8, 0.0, motion.z * 0.8);
			if (!serverLevel.noCollision(entity, entity.getBoundingBox())) {
				return InteractionResult.FAIL;
			}
			serverLevel.addFreshEntity(entity);
			player.startRiding(entity);
			level.playSound(null, pos.x, pos.y, pos.z, SoundEvents.ARMOR_EQUIP_LEATHER.value(), SoundSource.PLAYERS, 0.6F, 1.3F);
			stack.consume(1, player);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> tooltip, TooltipFlag flag) {
		EquipmentConfig config = config(stack);
		EquipmentStats stats = EquipmentStats.compute(kind, config);
		for (int i = 0; i < 5; i++) {
			int value = stats.get(i);
			StringBuilder bar = new StringBuilder();
			for (int j = 0; j < 10; j++) {
				bar.append(j < value ? '|' : '.');
			}
			tooltip.accept(Component.translatable("stat.extremesports." + PartCatalog.STAT_KEYS[i])
				.append(": ")
				.append(Component.literal(bar.toString()).withStyle(ChatFormatting.AQUA))
				.withStyle(ChatFormatting.GRAY));
		}
		tooltip.accept(Component.translatable("tooltip.extremesports.use_to_ride").withStyle(ChatFormatting.DARK_GRAY));
	}
}
