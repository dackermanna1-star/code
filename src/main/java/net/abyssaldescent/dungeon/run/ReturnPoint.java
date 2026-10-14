package net.abyssaldescent.dungeon.run;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;

/** Where a player goes when they leave the dungeon (the gate they entered through). */
public record ReturnPoint(ResourceKey<Level> dimension, BlockPos pos, float yaw) {
	public static final Codec<ReturnPoint> CODEC = RecordCodecBuilder.create(i -> i.group(
		Level.RESOURCE_KEY_CODEC.fieldOf("dimension").forGetter(ReturnPoint::dimension),
		BlockPos.CODEC.fieldOf("pos").forGetter(ReturnPoint::pos),
		Codec.FLOAT.optionalFieldOf("yaw", 0.0F).forGetter(ReturnPoint::yaw)
	).apply(i, ReturnPoint::new));
}
