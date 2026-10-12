package com.chaosunleashed.core;

import com.mojang.authlib.GameProfile;
import net.minecraft.command.permission.Permission;
import net.minecraft.command.permission.PermissionLevel;
import net.minecraft.command.permission.PermissionPredicate;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;

/**
 * Who may change Chaos settings.
 * <ul>
 *     <li>Commands: permission level {@link ChaosConfig#commandPermissionLevel} (2 = op by default).</li>
 *     <li>Control Panel: same, unless {@link ChaosConfig#allowAllPlayersUseControlPanel} is on.</li>
 *     <li>The owner of a singleplayer world can always change settings, even with cheats off.</li>
 * </ul>
 */
public final class ChaosPermissions {
	private ChaosPermissions() {
	}

	public static boolean hasLevel(PermissionPredicate permissions, int level) {
		if (level <= 0) {
			return true;
		}
		return permissions.hasPermission(new Permission.Level(PermissionLevel.fromLevel(level)));
	}

	public static boolean isSingleplayerOwner(ServerPlayerEntity player) {
		MinecraftServer server = player.getEntityWorld().getServer();
		GameProfile host = server.getHostProfile();
		return !server.isDedicated() && host != null && host.name().equalsIgnoreCase(player.getGameProfile().name());
	}

	public static boolean canUseCommands(ServerCommandSource source) {
		if (hasLevel(source.getPermissions(), ChaosConfig.get().commandPermissionLevel)) {
			return true;
		}
		ServerPlayerEntity player = source.getPlayer();
		return player != null && isSingleplayerOwner(player);
	}

	public static boolean canUseCommands(ServerPlayerEntity player) {
		return hasLevel(player.getPermissions(), ChaosConfig.get().commandPermissionLevel) || isSingleplayerOwner(player);
	}

	public static boolean canUsePanel(ServerPlayerEntity player) {
		return ChaosConfig.get().allowAllPlayersUseControlPanel || canUseCommands(player);
	}
}
