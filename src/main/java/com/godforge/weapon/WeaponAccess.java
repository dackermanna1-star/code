package com.godforge.weapon;

import com.godforge.config.GodforgeConfig;
import com.godforge.registry.ModComponents;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.Permission;
import net.minecraft.server.permissions.PermissionLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.gamerules.GameRules;
import org.jspecify.annotations.Nullable;

/** Permission and protection rules for using weapons and altering terrain. */
public final class WeaponAccess {
	private WeaponAccess() {
	}

	public static boolean hasLevel(ServerPlayer player, int level) {
		return level <= 0 || player.permissions().hasPermission(new Permission.HasCommandLevel(PermissionLevel.byId(level)));
	}

	/** @return a reason the player may not use this mode right now, or null if allowed */
	public static @Nullable Component denyReason(ServerPlayer player, WeaponType type, WeaponMode mode) {
		return denyReason(player, type, mode, true);
	}

	public static @Nullable Component denyReason(ServerPlayer player, WeaponType type, WeaponMode mode, boolean checkCooldown) {
		GodforgeConfig.Permissions perms = GodforgeConfig.get().permissions;
		if (!perms.isEnabled(type)) {
			return Component.translatable("message.godforge.disabled", Component.translatable(type.translationKey()));
		}
		if (!hasLevel(player, perms.useLevel)) {
			return Component.translatable("message.godforge.no_permission");
		}
		if (mode.ultimate() && !hasLevel(player, perms.ultimateLevel)) {
			return Component.translatable("message.godforge.no_ultimate_permission");
		}
		if (checkCooldown && mode.ultimate() && !UltimateCooldowns.isReady(player, type)) {
			int seconds = (UltimateCooldowns.remaining(player, type) + 19) / 20;
			return Component.translatable("message.godforge.ultimate_cooldown", seconds);
		}
		return null;
	}

	/** Whether an effect originating at {@code where} may destroy or reshape terrain. */
	public static boolean terrainAllowed(ServerLevel level, @Nullable Entity owner, @Nullable ItemStack stack, BlockPos where) {
		GodforgeConfig.General general = GodforgeConfig.get().general;
		if (!general.terrainDestruction) {
			return false;
		}
		if (stack != null) {
			WeaponSettings settings = stack.get(ModComponents.SETTINGS);
			if (settings != null && settings.terrainDisabled()) {
				return false;
			}
		}
		if (general.followMobGriefingRule && !level.getGameRules().get(GameRules.MOB_GRIEFING)) {
			return false;
		}
		if (general.respectSpawnProtection && owner instanceof Player player && !level.mayInteract(player, where)) {
			return false;
		}
		return level.getWorldBorder().isWithinBounds(where);
	}

	/** Variant for effects whose settings were captured at launch time. */
	public static boolean terrainAllowed(ServerLevel level, @Nullable Entity owner, boolean stackAllows, BlockPos where) {
		return stackAllows && terrainAllowed(level, owner, (ItemStack) null, where);
	}
}
