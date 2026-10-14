package net.abyssaldescent.entity;

import net.abyssaldescent.AbyssalDescent;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

/**
 * Elite modifiers. Each one changes how the fight plays (not just numbers) and has a distinct colour and aura so it is
 * readable at a glance.
 */
public enum EliteAffix {
	/** Heavy armour and knockback immunity; slower. Rewards axes and armour-breaking. */
	BULWARK(0x9FB7C9, ChatFormatting.GRAY),
	/** Faster movement and attacks. Rewards shields and spacing. */
	FRENZIED(0xFF5A3C, ChatFormatting.RED),
	/** Heals from the damage it deals. Rewards burst and avoiding hits. */
	VAMPIRIC(0xB0123A, ChatFormatting.DARK_RED),
	/** Bursts into a ring of soul bolts on death. Rewards finishing from range or raising a shield. */
	SOULBOUND(0x56D8FF, ChatFormatting.AQUA),
	/** Periodically raises a ward that absorbs damage; the ward visibly shatters. Rewards timing. */
	WARDED(0xD9C46A, ChatFormatting.GOLD);

	private final int color;
	private final ChatFormatting chatColor;

	EliteAffix(int color, ChatFormatting chatColor) {
		this.color = color;
		this.chatColor = chatColor;
	}

	public int color() {
		return color;
	}

	public ChatFormatting chatColor() {
		return chatColor;
	}

	public Component displayName() {
		return Component.translatable("affix." + AbyssalDescent.MOD_ID + "." + name().toLowerCase());
	}

	public static EliteAffix byId(int id) {
		EliteAffix[] values = values();
		return values[Math.max(0, Math.min(values.length - 1, id))];
	}
}
