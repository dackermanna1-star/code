package dev.portalgun.registry;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.item.Item;

/** Registers the creatures described in the content spec (filled in by the creature module). */
public final class ModCreatures {
	public static final List<Item> SPAWN_EGGS = new ArrayList<>();

	private ModCreatures() {
	}

	public static void init() {
	}
}
