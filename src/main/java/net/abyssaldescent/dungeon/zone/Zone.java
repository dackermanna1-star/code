package net.abyssaldescent.dungeon.zone;

import net.abyssaldescent.AbyssalDescent;
import net.minecraft.ChatFormatting;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.BossEvent;
import net.minecraft.world.level.biome.Biome;

/**
 * The six themed zones of the descent, five floors each. Floor {@code n} belongs to zone {@code (n - 1) / 5}.
 */
public enum Zone {
	FORGOTTEN_HALLS("forgotten_halls", 0x9FB7C9, ChatFormatting.GRAY, BossEvent.BossBarColor.WHITE, true),
	ASHEN_FORGE("ashen_forge", 0xFF7A2E, ChatFormatting.GOLD, BossEvent.BossBarColor.RED, false),
	CRYSTAL_DEPTHS("crystal_depths", 0xB98CFF, ChatFormatting.LIGHT_PURPLE, BossEvent.BossBarColor.PURPLE, false),
	DROWNED_KINGDOM("drowned_kingdom", 0x3FD1C4, ChatFormatting.DARK_AQUA, BossEvent.BossBarColor.BLUE, false),
	BLOOD_CITADEL("blood_citadel", 0xD8263A, ChatFormatting.DARK_RED, BossEvent.BossBarColor.RED, false),
	ABYSSAL_THRONE("abyssal_throne", 0x7B5CFF, ChatFormatting.DARK_PURPLE, BossEvent.BossBarColor.PURPLE, false);

	public static final int FLOORS_PER_ZONE = 5;
	public static final int MAX_FLOOR = values().length * FLOORS_PER_ZONE;

	private final String id;
	private final int accentColor;
	private final ChatFormatting chatColor;
	private final BossEvent.BossBarColor bossBarColor;
	private final boolean implemented;
	private final ResourceKey<Biome> biome;

	Zone(String id, int accentColor, ChatFormatting chatColor, BossEvent.BossBarColor bossBarColor, boolean implemented) {
		this.id = id;
		this.accentColor = accentColor;
		this.chatColor = chatColor;
		this.bossBarColor = bossBarColor;
		this.implemented = implemented;
		this.biome = ResourceKey.create(Registries.BIOME, AbyssalDescent.id(id));
	}

	public static Zone forFloor(int floor) {
		int index = Math.max(0, Math.min(values().length - 1, (floor - 1) / FLOORS_PER_ZONE));
		return values()[index];
	}

	public static boolean isBossFloor(int floor) {
		return floor % FLOORS_PER_ZONE == 0;
	}

	/** Floors 10, 20 and 30 chain a mini-boss into a major boss. */
	public static boolean isMajorBossFloor(int floor) {
		return floor % (FLOORS_PER_ZONE * 2) == 0;
	}

	public String id() {
		return id;
	}

	public int firstFloor() {
		return ordinal() * FLOORS_PER_ZONE + 1;
	}

	public int lastFloor() {
		return firstFloor() + FLOORS_PER_ZONE - 1;
	}

	/** Floor index inside the zone, 1..5. */
	public int localFloor(int floor) {
		return floor - firstFloor() + 1;
	}

	public int accentColor() {
		return accentColor;
	}

	public ChatFormatting chatColor() {
		return chatColor;
	}

	public BossEvent.BossBarColor bossBarColor() {
		return bossBarColor;
	}

	public boolean implemented() {
		return implemented;
	}

	public ResourceKey<Biome> biome() {
		return biome;
	}

	public Component displayName() {
		return Component.translatable("zone." + AbyssalDescent.MOD_ID + "." + id);
	}

	public Component tagline() {
		return Component.translatable("zone." + AbyssalDescent.MOD_ID + "." + id + ".tagline");
	}

	/** The deepest floor whose zone is implemented. Deeper floors are sealed instead of generated with filler. */
	public static int deepestImplementedFloor() {
		int deepest = 0;
		for (Zone zone : values()) {
			if (zone.implemented) {
				deepest = zone.lastFloor();
			} else {
				break;
			}
		}
		return deepest;
	}
}
