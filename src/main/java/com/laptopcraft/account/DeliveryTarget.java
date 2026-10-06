package com.laptopcraft.account;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;

/**
 * Server-only delivery address of a pending order (never sent to clients).
 *
 * @param orderId   the order this address belongs to
 * @param dimension dimension of the laptop the order was placed from
 * @param pos       position of that laptop
 * @param toPlayer  true = "follow me" delivery next to the player wherever they are
 */
public record DeliveryTarget(long orderId, ResourceKey<Level> dimension, BlockPos pos, boolean toPlayer) {
	public static final Codec<DeliveryTarget> CODEC = RecordCodecBuilder.create(i -> i.group(
			Codec.LONG.fieldOf("order").forGetter(DeliveryTarget::orderId),
			Level.RESOURCE_KEY_CODEC.fieldOf("dimension").forGetter(DeliveryTarget::dimension),
			BlockPos.CODEC.fieldOf("pos").forGetter(DeliveryTarget::pos),
			Codec.BOOL.optionalFieldOf("to_player", false).forGetter(DeliveryTarget::toPlayer)
	).apply(i, DeliveryTarget::new));
}
