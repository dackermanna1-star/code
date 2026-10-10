package dev.overkill.registry;

import dev.overkill.OverkillArsenal;
import net.fabricmc.fabric.api.gamerule.v1.GameRuleBuilder;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.gamerules.GameRule;
import net.minecraft.world.level.gamerules.GameRuleCategory;

/**
 * Server owners can tame the arsenal:
 * {@code /gamerule overkill:terrain_destruction false} keeps every block intact (damage still applies),
 * {@code /gamerule overkill:weapon_fire false} stops the weapons from starting fires.
 */
public final class ModGameRules {
	public static final GameRule<Boolean> TERRAIN_DESTRUCTION = GameRuleBuilder.forBoolean(true)
		.category(GameRuleCategory.MISC)
		.buildAndRegister(OverkillArsenal.id("terrain_destruction"));

	public static final GameRule<Boolean> WEAPON_FIRE = GameRuleBuilder.forBoolean(true)
		.category(GameRuleCategory.MISC)
		.buildAndRegister(OverkillArsenal.id("weapon_fire"));

	private ModGameRules() {
	}

	public static boolean terrain(ServerLevel level) {
		return level.getGameRules().get(TERRAIN_DESTRUCTION);
	}

	public static boolean fire(ServerLevel level) {
		return level.getGameRules().get(WEAPON_FIRE);
	}

	public static void init() {
	}
}
