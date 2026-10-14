package net.abyssaldescent.dungeon.layout;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;

/** A gameplay-relevant block placed by the generator, recorded so server logic can find it again. */
public record Fixture(Type type, BlockPos pos, Direction facing, int data) {
	public enum Type {
		/** Centre of the 3x3 descent rift. */
		RIFT,
		/** Reliquary; data = loot tier ordinal. */
		RELIQUARY,
		URN,
		SPIKE_TRAP,
		DART_TRAP,
		CRUMBLING_WALL,
		MERCHANT,
		ALTAR_OF_TRIALS,
		CURSED_IDOL,
		/** Where the boss waits; facing = direction it looks. */
		BOSS_SPAWN,
		/** Where the rift/waystone appear after the boss falls. */
		BOSS_REWARD,
		/** Sarcophagus that releases minions in boss phases. */
		MINION_SPAWN
	}

	public static Fixture of(Type type, BlockPos pos) {
		return new Fixture(type, pos, Direction.NORTH, 0);
	}

	public static Fixture of(Type type, BlockPos pos, Direction facing) {
		return new Fixture(type, pos, facing, 0);
	}
}
