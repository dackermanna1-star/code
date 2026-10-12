package com.extremesports.client.render;

import com.extremesports.ExtremeSports;
import com.extremesports.item.EquipmentItem;
import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import net.minecraft.client.color.item.ItemTintSource;
import net.minecraft.client.color.item.ItemTintSources;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.util.ARGB;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import org.jspecify.annotations.Nullable;

/** Item tint source that colours an icon layer with one of the equipment's customization colours. */
public record EquipmentColorTint(String slot) implements ItemTintSource {
	public static final MapCodec<EquipmentColorTint> MAP_CODEC = RecordCodecBuilder.mapCodec(instance -> instance.group(
		Codec.STRING.fieldOf("slot").forGetter(EquipmentColorTint::slot)
	).apply(instance, EquipmentColorTint::new));

	public static void register() {
		ItemTintSources.ID_MAPPER.put(ExtremeSports.id("equipment_color"), MAP_CODEC);
	}

	@Override
	public int calculate(ItemStack stack, @Nullable ClientLevel level, @Nullable LivingEntity entity) {
		if (stack.getItem() instanceof EquipmentItem item) {
			return ARGB.opaque(EquipmentItem.config(stack).color(item.kind(), slot));
		}
		return -1;
	}

	@Override
	public MapCodec<EquipmentColorTint> type() {
		return MAP_CODEC;
	}
}
