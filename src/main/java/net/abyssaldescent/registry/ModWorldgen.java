package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.world.gen.DungeonBiomeSource;
import net.abyssaldescent.world.gen.DungeonChunkGenerator;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.TicketType;

public final class ModWorldgen {
	/** Pre-generates the next floor's arrival area while the party explores (loads, does not simulate). */
	public static final TicketType PREFETCH = Registry.register(BuiltInRegistries.TICKET_TYPE, AbyssalDescent.id("prefetch"),
		new TicketType(1200L, TicketType.FLAG_LOADING));
	/** Keeps the arrival area of a floor loaded during a party teleport. */
	public static final TicketType ARRIVAL = Registry.register(BuiltInRegistries.TICKET_TYPE, AbyssalDescent.id("arrival"),
		new TicketType(100L, TicketType.FLAG_LOADING | TicketType.FLAG_SIMULATION));

	private ModWorldgen() {
	}

	public static void init() {
		Registry.register(BuiltInRegistries.CHUNK_GENERATOR, AbyssalDescent.id("dungeon"), DungeonChunkGenerator.CODEC);
		Registry.register(BuiltInRegistries.BIOME_SOURCE, AbyssalDescent.id("zones"), DungeonBiomeSource.CODEC);
	}
}
