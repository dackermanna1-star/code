package com.modernapartments.block;

import com.modernapartments.block.entity.ElevatorBlockEntity;
import com.modernapartments.network.ElevatorFloorsPayload;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/**
 * Teleport elevators. Standing on an {@link ElevatorBlock}: jump to go up a floor, sneak to go down.
 * Floor panels list every cab in the column. Arriving opens the cab's sliding doors with a chime.
 */
public final class ElevatorHandler {
	private static final int COOLDOWN = 8;
	private static final Map<UUID, Input> LAST_INPUT = new HashMap<>();
	private static final Map<UUID, Long> COOLDOWNS = new HashMap<>();

	private ElevatorHandler() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(ElevatorHandler::tick);
	}

	private static void tick(MinecraftServer server) {
		for (ServerPlayer player : server.getPlayerList().getPlayers()) {
			Input input = player.getLastClientInput();
			Input last = LAST_INPUT.put(player.getUUID(), input);
			if (last == null || player.isSpectator() || player.isPassenger()) {
				continue;
			}
			boolean jumped = input.jump() && !last.jump();
			boolean sneaked = input.shift() && !last.shift();
			if (!jumped && !sneaked) {
				continue;
			}
			ServerLevel level = player.level();
			BlockPos below = BlockPos.containing(player.getX(), player.getY() - 0.2, player.getZ());
			if (!(level.getBlockState(below).getBlock() instanceof ElevatorBlock)) {
				continue;
			}
			long now = level.getGameTime();
			Long until = COOLDOWNS.get(player.getUUID());
			if (until != null && now < until) {
				continue;
			}
			BlockPos target = jumped ? findNext(level, below, 1) : findNext(level, below, -1);
			if (target != null) {
				COOLDOWNS.put(player.getUUID(), now + COOLDOWN);
				travel(player, target);
			}
		}
		if (LAST_INPUT.size() > server.getPlayerList().getPlayerCount() * 2 + 16) {
			Set<UUID> online = new java.util.HashSet<>();
			server.getPlayerList().getPlayers().forEach(p -> online.add(p.getUUID()));
			LAST_INPUT.keySet().retainAll(online);
			COOLDOWNS.keySet().retainAll(online);
		}
	}

	/** Next usable cab floor above (dir = 1) or below (dir = -1) in the same column. */
	public static @Nullable BlockPos findNext(Level level, BlockPos from, int dir) {
		BlockPos.MutableBlockPos p = from.mutable();
		for (int y = from.getY() + dir; y >= level.getMinY() && y <= level.getMaxY(); y += dir) {
			p.setY(y);
			if (level.getBlockState(p).getBlock() instanceof ElevatorBlock && hasHeadroom(level, p)) {
				return p.immutable();
			}
		}
		return null;
	}

	private static boolean hasHeadroom(Level level, BlockPos floor) {
		BlockState a = level.getBlockState(floor.above());
		BlockState b = level.getBlockState(floor.above(2));
		return a.getCollisionShape(level, floor.above()).isEmpty() && b.getCollisionShape(level, floor.above(2)).isEmpty();
	}

	/** All cab floors in the column of {@code anyFloor}, bottom to top. */
	public static List<ElevatorFloorsPayload.Floor> floors(Level level, BlockPos anyFloor) {
		List<BlockPos> stops = new ArrayList<>();
		BlockPos.MutableBlockPos p = anyFloor.mutable();
		for (int y = level.getMinY(); y <= level.getMaxY(); y++) {
			p.setY(y);
			if (level.getBlockState(p).getBlock() instanceof ElevatorBlock && hasHeadroom(level, p)) {
				stops.add(p.immutable());
			}
		}
		List<ElevatorFloorsPayload.Floor> out = new ArrayList<>();
		for (int i = 0; i < stops.size(); i++) {
			BlockPos s = stops.get(i);
			String label = level.getBlockEntity(s) instanceof ElevatorBlockEntity e && !e.label().isEmpty() ? e.label() : String.valueOf(i + 1);
			out.add(new ElevatorFloorsPayload.Floor(s.getY(), label));
		}
		return out;
	}

	public static String label(Level level, BlockPos floor) {
		if (level.getBlockEntity(floor) instanceof ElevatorBlockEntity e && !e.label().isEmpty()) {
			return e.label();
		}
		for (ElevatorFloorsPayload.Floor f : floors(level, floor)) {
			if (f.y() == floor.getY()) {
				return f.label();
			}
		}
		return "?";
	}

	/** Nearest elevator floor block to a panel (inside or just outside the cab). */
	public static @Nullable BlockPos findCabNear(Level level, BlockPos pos, int radius) {
		BlockPos best = null;
		double bestDist = Double.MAX_VALUE;
		for (BlockPos p : BlockPos.betweenClosed(pos.offset(-radius, -4, -radius), pos.offset(radius, 0, radius))) {
			if (level.getBlockState(p).getBlock() instanceof ElevatorBlock) {
				double d = p.distSqr(pos);
				if (d < bestDist) {
					bestDist = d;
					best = p.immutable();
				}
			}
		}
		return best;
	}

	public static void openPanel(ServerPlayer player, BlockPos panel) {
		BlockPos cab = findCabNear(player.level(), panel, 4);
		if (cab == null) {
			player.displayClientMessage(Component.translatable("message.modernapartments.no_elevator"), true);
			return;
		}
		List<ElevatorFloorsPayload.Floor> floors = floors(player.level(), cab);
		ServerPlayNetworking.send(player, new ElevatorFloorsPayload(cab, cab.getY(), floors));
	}

	/** Validates a floor chosen on the panel screen and rides there. */
	public static void travelFromPanel(ServerPlayer player, BlockPos target) {
		ServerLevel level = player.level();
		BlockPos cab = findCabNear(level, player.blockPosition().above(), 5);
		if (cab == null || cab.getX() != target.getX() || cab.getZ() != target.getZ()
			|| !(level.getBlockState(target).getBlock() instanceof ElevatorBlock) || !hasHeadroom(level, target)) {
			return;
		}
		travel(player, target);
	}

	public static void travel(ServerPlayer player, BlockPos target) {
		ServerLevel level = player.level();
		player.teleportTo(level, target.getX() + 0.5, target.getY() + 1.0, target.getZ() + 0.5, Set.of(),
			player.getYRot(), player.getXRot(), false);
		player.resetFallDistance();
		level.playSound(null, target.above(), SoundEvents.NOTE_BLOCK_CHIME.value(), SoundSource.BLOCKS, 0.7F, 1.5F);
		player.displayClientMessage(Component.translatable("message.modernapartments.elevator_floor", label(level, target)), true);
		openDoorsNear(level, target.above());
	}

	private static void openDoorsNear(Level level, BlockPos center) {
		for (BlockPos p : BlockPos.betweenClosed(center.offset(-3, 0, -3), center.offset(3, 0, 3))) {
			BlockState s = level.getBlockState(p);
			if (s.getBlock() instanceof ElevatorDoorBlock door && !s.getValue(ElevatorDoorBlock.OPEN)) {
				door.setOpen(level, p.immutable(), s, true);
			}
		}
	}
}
