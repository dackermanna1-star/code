package net.abyssaldescent.dungeon.loot;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.item.GearItem;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.network.chat.TextColor;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.Nullable;

/** Five loot tiers. Higher tiers add mechanics and presentation (sparkles, sounds), not just numbers. */
public enum Rarity {
	COMMON(0xD8D8D8),
	UNCOMMON(0x62D957),
	RARE(0x4FA6FF),
	EPIC(0xB76BFF),
	LEGENDARY(0xFFB43A);

	private final int color;

	Rarity(int color) {
		this.color = color;
	}

	public int color() {
		return color;
	}

	public Style style() {
		return Style.EMPTY.withColor(TextColor.fromRgb(color));
	}

	public MutableComponent displayName() {
		return Component.translatable("rarity." + AbyssalDescent.MOD_ID + "." + name().toLowerCase()).withStyle(style());
	}

	@Nullable
	public SimpleParticleType sparkle() {
		return switch (this) {
			case COMMON -> null;
			case UNCOMMON -> ModParticles.SPARK_UNCOMMON;
			case RARE -> ModParticles.SPARK_RARE;
			case EPIC -> ModParticles.SPARK_EPIC;
			case LEGENDARY -> ModParticles.SPARK_LEGENDARY;
		};
	}

	@Nullable
	public SoundEvent dropSound() {
		return switch (this) {
			case COMMON -> null;
			case UNCOMMON -> ModSounds.LOOT_UNCOMMON;
			case RARE -> ModSounds.LOOT_RARE;
			case EPIC -> ModSounds.LOOT_EPIC;
			case LEGENDARY -> ModSounds.LOOT_LEGENDARY;
		};
	}

	public static Rarity of(ItemStack stack) {
		return stack.getItem() instanceof GearItem gear ? gear.spec().rarity() : COMMON;
	}

	public static Rarity byIndex(int i) {
		Rarity[] values = values();
		return values[Math.max(0, Math.min(values.length - 1, i))];
	}
}
