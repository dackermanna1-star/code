package com.laptopcraft.block;

import com.laptopcraft.registry.ModDataComponents;
import com.mojang.serialization.Codec;
import io.netty.buffer.ByteBuf;
import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.core.component.DataComponentGetter;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipProvider;

/**
 * Immutable item-component wrapper around a laptop's opaque OS data compound (settings, files, app state;
 * see {@link com.laptopcraft.network.ModPayloads}). Carried by the laptop item so a broken laptop keeps
 * everything, and renders a short summary in the item tooltip.
 *
 * <p>The wrapped tag is never exposed directly: {@link #copyTag()} returns a defensive copy, so the value
 * can safely be shared between item stacks.
 */
public final class LaptopData implements TooltipProvider {
	public static final LaptopData EMPTY = new LaptopData(new CompoundTag());
	public static final Codec<LaptopData> CODEC = CompoundTag.CODEC.xmap(LaptopData::new, d -> d.tag);
	public static final StreamCodec<ByteBuf, LaptopData> STREAM_CODEC = ByteBufCodecs.COMPOUND_TAG.map(LaptopData::new, d -> d.tag);

	private final CompoundTag tag;

	private LaptopData(CompoundTag tag) {
		this.tag = tag;
	}

	/** Wraps a copy of {@code tag}. */
	public static LaptopData of(CompoundTag tag) {
		return tag.isEmpty() ? EMPTY : new LaptopData(tag.copy());
	}

	public CompoundTag copyTag() {
		return tag.copy();
	}

	public boolean isEmpty() {
		return tag.isEmpty();
	}

	/** Number of files in the laptop's file system. */
	public int fileCount() {
		return tag.getCompoundOrEmpty("files").size();
	}

	/** Whether the OS has a login password set. */
	public boolean hasPassword() {
		return !tag.getCompoundOrEmpty("settings").getStringOr("password", "").isEmpty();
	}

	@Override
	public void addToTooltip(Item.TooltipContext context, Consumer<Component> tooltip, TooltipFlag flag, DataComponentGetter components) {
		String owner = components.get(ModDataComponents.OWNER_NAME);
		if (owner != null && !owner.isEmpty()) {
			tooltip.accept(Component.translatable("tooltip.laptopcraft.laptop.owner", owner).withStyle(ChatFormatting.GRAY));
		}
		if (tag.isEmpty()) {
			tooltip.accept(Component.translatable("tooltip.laptopcraft.laptop.fresh").withStyle(ChatFormatting.GRAY));
		} else {
			int files = fileCount();
			String key = files == 0 ? "tooltip.laptopcraft.laptop.no_files" : files == 1 ? "tooltip.laptopcraft.laptop.file" : "tooltip.laptopcraft.laptop.files";
			tooltip.accept(Component.translatable(key, files).withStyle(ChatFormatting.GRAY));
			if (hasPassword()) {
				tooltip.accept(Component.translatable("tooltip.laptopcraft.laptop.locked").withStyle(ChatFormatting.GOLD));
			}
		}
		if (flag.isAdvanced()) {
			tooltip.accept(Component.translatable("tooltip.laptopcraft.laptop.size", Math.max(1, tag.sizeInBytes() / 1024)).withStyle(ChatFormatting.DARK_GRAY));
		}
		tooltip.accept(Component.translatable("tooltip.laptopcraft.laptop.hint").withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.ITALIC));
	}

	@Override
	public boolean equals(Object o) {
		return this == o || o instanceof LaptopData other && tag.equals(other.tag);
	}

	@Override
	public int hashCode() {
		return tag.hashCode();
	}

	@Override
	public String toString() {
		return "LaptopData[" + tag.size() + " keys]";
	}
}
