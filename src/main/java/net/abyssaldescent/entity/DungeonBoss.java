package net.abyssaldescent.entity;

import java.util.List;
import net.abyssaldescent.dungeon.layout.Box;
import net.minecraft.core.BlockPos;

/** Implemented by boss entities so the run manager can hand them their arena and start the fight. */
public interface DungeonBoss {
	void configureArena(int runSlot, int floor, Box arena, List<BlockPos> minionSpawns);

	void beginEncounter(int partySize);
}
