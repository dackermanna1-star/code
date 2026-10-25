package com.godforge.command;

import com.godforge.destruction.DestructionManager;
import com.godforge.mixin.MinecraftServerAccessor;
import com.godforge.registry.ModItems;
import com.godforge.util.EffectEntity;
import com.godforge.util.Scheduler;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.UltimateCooldowns;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import com.mojang.authlib.GameProfile;
import com.mojang.brigadier.context.CommandContext;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import net.fabricmc.fabric.api.entity.FakePlayer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * {@code /godforge selftest}: fires every mode of every weapon with a fake player at separate test sites
 * (chunks are force-loaded only while their test runs) and reports progress. Intended for server owners
 * to verify the mod on their machine, and used during development as an integration test.
 */
final class SelfTest {
	private record Case(WeaponType type, int mode) {
	}

	/** Slowest server tick (nanoseconds) since the current case fired. */
	private static final int SETTLE_LIMIT_TICKS = 20 * 60;
	private static long peakTickNanos;
	private static boolean measuring;
	private static boolean running;

	private SelfTest() {
	}

	static void init() {
		// a self-test is usually started from the console of an empty server: keep it from pausing meanwhile
		ServerTickEvents.START_SERVER_TICK.register(server -> {
			if (running) {
				((MinecraftServerAccessor) server).godforge$setEmptyTicks(0);
			}
		});
		ServerTickEvents.END_SERVER_TICK.register(server -> {
			if (measuring) {
				peakTickNanos = Math.max(peakTickNanos, server.getTickTimesNanos()[server.getTickCount() % 100]);
			}
		});
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
			running = false;
			measuring = false;
		});
	}

	static int run(CommandContext<CommandSourceStack> context, @Nullable WeaponType only) {
		CommandSourceStack source = context.getSource();
		if (running) {
			source.sendFailure(Component.literal("A Godforge self-test is already running"));
			return 0;
		}
		running = true;
		ServerLevel level = source.getLevel();
		Vec3 origin = source.getPosition();
		List<Case> cases = new ArrayList<>();
		for (WeaponType type : WeaponType.values()) {
			if (only != null && type != only) {
				continue;
			}
			for (int m = 0; m < type.modes().size(); m++) {
				cases.add(new Case(type, m));
			}
		}
		source.sendSuccess(() -> Component.literal("Godforge self-test: " + cases.size() + " abilities queued").withStyle(ChatFormatting.GOLD), true);
		GodforgeCommand.log("starting {} cases at {}", cases.size(), origin);
		next(source, level, origin, cases, 0);
		return cases.size();
	}

	private static void next(CommandSourceStack source, ServerLevel level, Vec3 origin, List<Case> cases, int index) {
		if (index >= cases.size()) {
			measuring = false;
			running = false;
			GodforgeCommand.log("all cases finished; active jobs={}", DestructionManager.activeJobs());
			source.sendSuccess(() -> Component.literal("Godforge self-test complete").withStyle(ChatFormatting.GREEN), true);
			return;
		}
		Case c = cases.get(index);
		// each case gets its own site, far enough apart that effects never overlap
		int siteX = (int) origin.x + 200 + index * 180;
		int siteZ = (int) origin.z + 200;
		List<long[]> forced = new ArrayList<>();
		for (int dx = -5; dx <= 5; dx++) {
			for (int dz = -5; dz <= 5; dz++) {
				int cx = (siteX >> 4) + dx;
				int cz = (siteZ >> 4) + dz;
				level.setChunkForced(cx, cz, true);
				forced.add(new long[]{cx, cz});
			}
		}
		Scheduler.later(level, 60, () -> {
			try {
				peakTickNanos = 0;
				measuring = true;
				int duration = fire(level, c, siteX, siteZ);
				Scheduler.later(level, duration, () -> settle(source, level, origin, cases, index, forced, duration));
			} catch (RuntimeException e) {
				GodforgeCommand.log("{} / {} FAILED: {}", c.type.id(), c.mode, e.toString());
				logFailure(e);
				for (long[] chunk : forced) {
					level.setChunkForced((int) chunk[0], (int) chunk[1], false);
				}
				next(source, level, origin, cases, index + 1);
			}
		});
	}

	/** Waits (up to 30 s) for the ability's effects and terrain work to finish before reporting and moving on. */
	private static void settle(CommandSourceStack source, ServerLevel level, Vec3 origin, List<Case> cases, int index, List<long[]> forced, int elapsed) {
		Map<String, Integer> effects = new TreeMap<>();
		for (Entity e : level.getAllEntities()) {
			if (e instanceof EffectEntity) {
				effects.merge(BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).getPath(), 1, Integer::sum);
			}
		}
		int jobs = DestructionManager.activeJobs();
		if ((!effects.isEmpty() || jobs > 0) && elapsed < SETTLE_LIMIT_TICKS) {
			Scheduler.later(level, 20, () -> settle(source, level, origin, cases, index, forced, elapsed + 20));
			return;
		}
		Case c = cases.get(index);
		GodforgeCommand.log("{} / {} done after {} ticks (still active: effects {}, jobs {}; slowest tick: {} ms)", c.type.id(), c.type.mode(c.mode).key(),
			elapsed, effects, DestructionManager.describe(), String.format(Locale.ROOT, "%.1f", peakTickNanos / 1.0E6));
		for (long[] chunk : forced) {
			level.setChunkForced((int) chunk[0], (int) chunk[1], false);
		}
		next(source, level, origin, cases, index + 1);
	}

	private static void logFailure(RuntimeException e) {
		com.godforge.Godforge.LOGGER.error("Self-test case failed", e);
	}

	/** Fires one ability and returns how many ticks to wait for it to play out. */
	private static int fire(ServerLevel level, Case c, int siteX, int siteZ) {
		int groundY = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, siteX, siteZ);
		FakePlayer player = FakePlayer.get(level, new GameProfile(UUID.nameUUIDFromBytes(("godforge-test-" + c.type.id()).getBytes()), "GodforgeTest"));
		player.snapTo(siteX + 0.5, groundY + 1.0, siteZ + 0.5, -90.0F, 25.0F);
		player.setDeltaMovement(Vec3.ZERO);
		UltimateCooldowns.reset(player);
		ItemStack stack = new ItemStack(ModItems.WEAPONS.get(c.type.ordinal()));
		GodWeaponItem weapon = (GodWeaponItem) stack.getItem();
		WeaponSettings settings = GodWeaponItem.settings(stack).with(WeaponSettings.Field.MODE, c.mode);
		GodWeaponItem.applySettings(stack, settings);
		player.getCooldowns().removeCooldown(player.getCooldowns().getCooldownGroup(stack));
		player.setItemInHand(InteractionHand.MAIN_HAND, stack);
		WeaponMode mode = c.type.mode(c.mode);
		GodforgeCommand.log("firing {} / {} at {}", c.type.id(), mode.key(), new BlockPos(siteX, groundY, siteZ));

		stack.use(level, player, InteractionHand.MAIN_HAND);
		if (!player.isUsingItem()) {
			return mode.ultimate() ? 240 : 80;
		}
		int hold = c.type == WeaponType.LASER_BEAM ? (mode.ultimate() ? 90 : 60) : mode.chargeTicks() + 8;
		if (c.type == WeaponType.ASTEROID_GUN) {
			hold += 6;
		}
		final int holdTicks = hold;
		for (int t = 1; t <= holdTicks; t++) {
			int tick = t;
			Scheduler.later(level, t, () -> {
				if (player.getMainHandItem() == stack) {
					weapon.onUseTick(level, player, stack, GodWeaponItem.USE_DURATION - tick);
				}
			});
		}
		Scheduler.later(level, holdTicks + 1, () -> {
			stack.releaseUsing(level, player, GodWeaponItem.USE_DURATION - holdTicks);
			player.stopUsingItem();
		});
		return holdTicks + (mode.ultimate() ? 400 : 140);
	}
}
