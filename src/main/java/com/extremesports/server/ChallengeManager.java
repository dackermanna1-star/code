package com.extremesports.server;

import com.extremesports.block.GateBlock;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.network.Payloads;
import com.extremesports.registry.ModCriteria;
import com.extremesports.registry.ModSounds;
import com.extremesports.sport.SportType;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.ComboScorer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Relative;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Server-authoritative challenges. Timed modes run on a countdown; races use start, checkpoint and finish gates.
 */
public final class ChallengeManager {
	public enum Type {
		SCORE_ATTACK("score_attack", 2400, 5000, 15000, 30000),
		BEST_TRICK("best_trick", 1800, 1500, 4000, 8000),
		GRIND("grind", 1800, 80, 160, 300),
		BMX("bmx", 3600, 3, 4, 5),
		TIME_TRIAL("time_trial", 0, 0, 0, 0),
		DOWNHILL("downhill", 0, 0, 0, 0),
		PRACTICE("practice", 0, 0, 0, 0);

		public final String id;
		public final int duration;
		public final int[] medals;

		Type(String id, int duration, int bronze, int silver, int gold) {
			this.id = id;
			this.duration = duration;
			this.medals = new int[]{bronze, silver, gold};
		}

		public boolean timed() {
			return duration > 0;
		}

		public static @Nullable Type byId(String id) {
			for (Type type : values()) {
				if (type.id.equals(id)) {
					return type;
				}
			}
			return null;
		}
	}

	public static final int PHASE_NONE = 0;
	public static final int PHASE_COUNTDOWN = 1;
	public static final int PHASE_RUNNING = 2;
	public static final int PHASE_FINISHED = 3;
	private static final int COUNTDOWN = 60;
	private static final int RESULTS = 120;
	/** Gates are posts beside the track; this radius reaches the middle of a 5-wide lane flanked by two posts. */
	private static final double GATE_RADIUS = 3.5;

	/** BMX stunt objectives in display order. */
	public static final List<String> BMX_OBJECTIVES = List.of("tailwhip", "barspin", "backflip", "manual", "grind");

	static final class Session {
		final Type type;
		int phase = PHASE_COUNTDOWN;
		int ticks = COUNTDOWN;
		int progress;
		int medal;
		final Map<String, Boolean> objectives = new LinkedHashMap<>();
		// Races
		int course;
		final List<BlockPos> checkpoints = new ArrayList<>();
		int nextCheckpoint;
		int missed;
		@Nullable BlockPos startGate;
		int offBoardTicks;
		// Practice
		@Nullable Vec3 practiceSpot;
		float practiceYaw;

		Session(Type type) {
			this.type = type;
		}
	}

	private static final Map<UUID, Session> SESSIONS = new ConcurrentHashMap<>();
	private static final Map<UUID, Long> RACE_COOLDOWN = new ConcurrentHashMap<>();

	private ChallengeManager() {
	}

	public static @Nullable Session session(ServerPlayer player) {
		return SESSIONS.get(player.getUUID());
	}

	// ------------------------------------------------------------------ control

	public static void start(ServerPlayer player, Type type) {
		if (type == Type.TIME_TRIAL || type == Type.DOWNHILL) {
			player.displayClientMessage(Component.translatable("message.extremesports.race_hint"), false);
			return;
		}
		if (type == Type.BMX && !(player.getVehicle() instanceof SportEquipmentEntity entity && entity.sport() == SportType.BMX)) {
			player.displayClientMessage(Component.translatable("message.extremesports.need_bmx"), false);
			return;
		}
		Session session = new Session(type);
		if (type == Type.BMX) {
			for (String objective : BMX_OBJECTIVES) {
				session.objectives.put(objective, false);
			}
		}
		if (type == Type.PRACTICE) {
			session.phase = PHASE_RUNNING;
			session.ticks = 0;
			setPracticeSpot(player, session);
		}
		SESSIONS.put(player.getUUID(), session);
		send(player, session);
	}

	public static void stop(ServerPlayer player) {
		Session session = SESSIONS.remove(player.getUUID());
		if (session != null) {
			ServerPlayNetworking.send(player, new Payloads.ChallengeState("", PHASE_NONE, 0, 0, 0, 0, ""));
		}
	}

	public static void handleAction(ServerPlayer player, Payloads.ChallengeAction action) {
		switch (action.action()) {
			case "start" -> {
				Type type = Type.byId(action.argument());
				if (type != null) {
					start(player, type);
				}
			}
			case "stop" -> stop(player);
			case "practice_spot" -> {
				Session session = SESSIONS.get(player.getUUID());
				if (session == null || session.type != Type.PRACTICE) {
					start(player, Type.PRACTICE);
				} else {
					setPracticeSpot(player, session);
				}
			}
			case "practice_return" -> returnToSpot(player);
			default -> {
			}
		}
	}

	private static void setPracticeSpot(ServerPlayer player, Session session) {
		Entity root = player.getRootVehicle();
		session.practiceSpot = root.position();
		session.practiceYaw = root.getYRot();
		player.displayClientMessage(Component.translatable("message.extremesports.practice_spot_set"), true);
	}

	private static void returnToSpot(ServerPlayer player) {
		Session session = SESSIONS.get(player.getUUID());
		if (session == null || session.type != Type.PRACTICE || session.practiceSpot == null) {
			player.displayClientMessage(Component.translatable("message.extremesports.no_practice_spot"), true);
			return;
		}
		Vec3 spot = session.practiceSpot;
		Entity root = player.getRootVehicle();
		if (root instanceof SportEquipmentEntity entity) {
			entity.setDeltaMovement(Vec3.ZERO);
			entity.teleportTo(player.level(), spot.x, spot.y, spot.z, Set.of(), session.practiceYaw, 0.0F, false);
		} else {
			player.teleportTo(player.level(), spot.x, spot.y, spot.z, Set.<Relative>of(), session.practiceYaw, player.getXRot(), false);
		}
	}

	// ------------------------------------------------------------------ ticking

	public static void tick(MinecraftServer server) {
		for (ServerPlayer player : server.getPlayerList().getPlayers()) {
			Session session = SESSIONS.get(player.getUUID());
			if (session == null) {
				checkRaceStart(player);
				continue;
			}
			tickSession(player, session);
		}
	}

	private static void tickSession(ServerPlayer player, Session session) {
		switch (session.phase) {
			case PHASE_COUNTDOWN -> {
				if (session.ticks % 20 == 0 && session.ticks > 0) {
					sound(player, ModSounds.UI_COUNTDOWN, 1.0F);
				}
				session.ticks--;
				if (session.ticks <= 0) {
					session.phase = PHASE_RUNNING;
					session.ticks = session.type.timed() ? session.type.duration : 0;
					sound(player, ModSounds.UI_GO, 1.0F);
					ServerRideTracker.get(player).resetCounters();
				}
				if (session.ticks % 5 == 0) {
					send(player, session);
				}
			}
			case PHASE_RUNNING -> {
				if (session.type.timed()) {
					session.ticks--;
					if (session.ticks <= 0) {
						finish(player, session);
						return;
					}
				} else if (session.type == Type.TIME_TRIAL || session.type == Type.DOWNHILL) {
					session.ticks++;
					tickRace(player, session);
					if (SESSIONS.get(player.getUUID()) != session) {
						return;
					}
				}
				if (session.ticks % 10 == 0) {
					send(player, session);
				}
			}
			case PHASE_FINISHED -> {
				session.ticks--;
				if (session.ticks <= 0) {
					SESSIONS.remove(player.getUUID());
					ServerPlayNetworking.send(player, new Payloads.ChallengeState("", PHASE_NONE, 0, 0, 0, 0, ""));
				}
			}
			default -> {
			}
		}
	}

	private static void finish(ServerPlayer player, Session session) {
		session.phase = PHASE_FINISHED;
		session.ticks = RESULTS;
		Type type = session.type;
		if (type.timed()) {
			int medal = 0;
			for (int i = 0; i < 3; i++) {
				if (session.progress >= type.medals[i]) {
					medal = i + 1;
				}
			}
			session.medal = medal;
			PlayerSportData data = PlayerSportData.get(player);
			data.challengeBest.merge(type.id, session.progress, Math::max);
			data.medals.merge(type.id, medal, Math::max);
			ModCriteria.SPORT.trigger(player, "medal:" + type.id, medal);
			ModCriteria.SPORT.trigger(player, "medal", medal);
			ScoreService.saveAndAnnounce(player, data);
		}
		sound(player, ModSounds.UI_FINISH, 1.0F);
		send(player, session);
	}

	// ------------------------------------------------------------------ events from scoring

	public static void onCombo(ServerPlayer player, List<ComboEntry> entries, ComboScorer.@Nullable Result result) {
		Session session = SESSIONS.get(player.getUUID());
		if (session == null || session.phase != PHASE_RUNNING || result == null) {
			return;
		}
		switch (session.type) {
			case SCORE_ATTACK -> session.progress += result.total();
			case BEST_TRICK -> session.progress = Math.max(session.progress, result.total());
			case GRIND -> {
				float linked = 0.0F;
				for (ComboEntry entry : entries) {
					if (entry.kind() == ComboEntry.Kind.GRIND) {
						linked += entry.distance();
					}
				}
				session.progress = Math.max(session.progress, Math.round(linked * 10.0F));
			}
			case BMX -> {
				for (ComboEntry entry : entries) {
					for (String trick : entry.tricks()) {
						switch (trick) {
							case "bmx.tailwhip", "bmx.bar_whip", "bmx.opposite_whip" -> session.objectives.put("tailwhip", true);
							case "bmx.barspin" -> session.objectives.put("barspin", true);
							case "bmx.backflip", "bmx.flair" -> session.objectives.put("backflip", true);
							default -> {
							}
						}
						if (trick.startsWith("bmx.") && entry.kind() == ComboEntry.Kind.MANUAL && entry.ticks() >= 60) {
							session.objectives.put("manual", true);
						}
						if (entry.kind() == ComboEntry.Kind.GRIND && entry.distance() >= 4.0F) {
							session.objectives.put("grind", true);
						}
					}
				}
				session.progress = (int) session.objectives.values().stream().filter(done -> done).count();
				if (session.progress >= BMX_OBJECTIVES.size()) {
					finish(player, session);
					return;
				}
			}
			default -> {
			}
		}
		send(player, session);
	}

	public static void onBail(ServerPlayer player) {
		Session session = SESSIONS.get(player.getUUID());
		if (session != null && session.phase == PHASE_RUNNING) {
			send(player, session);
		}
	}

	// ------------------------------------------------------------------ races

	private static void checkRaceStart(ServerPlayer player) {
		if (!(player.getVehicle() instanceof SportEquipmentEntity) || !(player.level() instanceof ServerLevel level)) {
			return;
		}
		Long cooldown = RACE_COOLDOWN.get(player.getUUID());
		if (cooldown != null && level.getGameTime() < cooldown) {
			return;
		}
		Vec3 pos = player.position();
		if (((SportEquipmentEntity) player.getVehicle()).observedSpeed < 0.12F) {
			return;
		}
		for (CourseRegistry.Gate gate : CourseRegistry.get(level).all()) {
			if (gate.type() != GateBlock.Type.START || !near(pos, gate.pos(), GATE_RADIUS)) {
				continue;
			}
			var state = level.getBlockState(gate.pos());
			if (!(state.getBlock() instanceof GateBlock)) {
				CourseRegistry.get(level).remove(gate.pos());
				continue;
			}
			boolean downhill = state.getValue(GateBlock.DOWNHILL);
			Session session = new Session(downhill ? Type.DOWNHILL : Type.TIME_TRIAL);
			session.phase = PHASE_RUNNING;
			session.ticks = 0;
			session.course = gate.course();
			session.startGate = gate.pos();
			for (CourseRegistry.Gate checkpoint : CourseRegistry.get(level).course(gate.course(), GateBlock.Type.CHECKPOINT)) {
				session.checkpoints.add(checkpoint.pos());
			}
			if (CourseRegistry.get(level).course(gate.course(), GateBlock.Type.FINISH).isEmpty()) {
				player.displayClientMessage(Component.translatable("message.extremesports.no_finish", gate.course() + 1), true);
				RACE_COOLDOWN.put(player.getUUID(), level.getGameTime() + 60);
				return;
			}
			SESSIONS.put(player.getUUID(), session);
			sound(player, ModSounds.UI_GO, 1.0F);
			send(player, session);
			return;
		}
	}

	private static void tickRace(ServerPlayer player, Session session) {
		if (!(player.level() instanceof ServerLevel level)) {
			return;
		}
		if (!(player.getVehicle() instanceof SportEquipmentEntity)) {
			if (++session.offBoardTicks > 100) {
				player.displayClientMessage(Component.translatable("message.extremesports.race_cancelled"), true);
				stop(player);
			}
			return;
		}
		session.offBoardTicks = 0;
		Vec3 pos = player.position();
		// Checkpoints in order; downhill lets you skip with a time penalty
		for (int i = session.nextCheckpoint; i < session.checkpoints.size(); i++) {
			if (near(pos, session.checkpoints.get(i), GATE_RADIUS)) {
				if (i > session.nextCheckpoint) {
					if (session.type == Type.TIME_TRIAL) {
						break;
					}
					session.missed += i - session.nextCheckpoint;
				}
				session.nextCheckpoint = i + 1;
				sound(player, ModSounds.UI_CHECKPOINT, 1.0F);
				send(player, session);
				break;
			}
		}
		for (CourseRegistry.Gate finish : CourseRegistry.get(level).course(session.course, GateBlock.Type.FINISH)) {
			if (!near(pos, finish.pos(), GATE_RADIUS)) {
				continue;
			}
			if (session.type == Type.TIME_TRIAL && session.nextCheckpoint < session.checkpoints.size()) {
				player.displayClientMessage(Component.translatable("message.extremesports.missed_checkpoint", session.nextCheckpoint + 1), true);
				continue;
			}
			if (session.type == Type.DOWNHILL) {
				session.missed += session.checkpoints.size() - session.nextCheckpoint;
			}
			int time = session.ticks + session.missed * 60;
			session.progress = time;
			PlayerSportData data = PlayerSportData.get(player);
			String key = "course" + (session.course + 1) + ":" + session.type.id;
			Integer previous = data.courseTimes.get(key);
			if (previous == null || time < previous) {
				data.courseTimes.put(key, time);
				session.medal = 3;
			}
			ModCriteria.SPORT.trigger(player, "race:" + session.type.id, 1);
			ScoreService.saveAndAnnounce(player, data);
			RACE_COOLDOWN.put(player.getUUID(), level.getGameTime() + 100);
			session.phase = PHASE_FINISHED;
			session.ticks = RESULTS;
			sound(player, ModSounds.UI_FINISH, 1.0F);
			send(player, session);
			return;
		}
	}

	private static boolean near(Vec3 pos, BlockPos gate, double radius) {
		double dx = pos.x - (gate.getX() + 0.5);
		double dz = pos.z - (gate.getZ() + 0.5);
		double dy = pos.y - gate.getY();
		return dx * dx + dz * dz <= radius * radius && dy > -2.0 && dy < 3.5;
	}

	// ------------------------------------------------------------------ sync

	private static void send(ServerPlayer player, Session session) {
		int target = 0;
		String detail = "";
		switch (session.type) {
			case SCORE_ATTACK, BEST_TRICK, GRIND, BMX -> {
				target = session.type.medals[2];
				for (int medalTarget : session.type.medals) {
					if (session.progress < medalTarget) {
						target = medalTarget;
						break;
					}
				}
				if (session.type == Type.BMX) {
					StringBuilder builder = new StringBuilder();
					session.objectives.forEach((id, done) -> builder.append(id).append(':').append(done ? '1' : '0').append(','));
					detail = builder.toString();
				}
			}
			case TIME_TRIAL, DOWNHILL -> {
				target = session.checkpoints.size();
				detail = "course:" + (session.course + 1) + ",checkpoint:" + session.nextCheckpoint + ",missed:" + session.missed;
				if (session.phase == PHASE_FINISHED) {
					PlayerSportData data = PlayerSportData.get(player);
					Integer best = data.courseTimes.get("course" + (session.course + 1) + ":" + session.type.id);
					detail += ",best:" + (best == null ? -1 : best);
				}
			}
			default -> {
			}
		}
		int ticks = session.ticks;
		ServerPlayNetworking.send(player, new Payloads.ChallengeState(session.type.id, session.phase, ticks, session.progress, target, session.medal, detail));
	}

	private static void sound(ServerPlayer player, SoundEvent sound, float pitch) {
		player.connection.send(new net.minecraft.network.protocol.game.ClientboundSoundPacket(
			net.minecraft.core.registries.BuiltInRegistries.SOUND_EVENT.wrapAsHolder(sound), SoundSource.PLAYERS,
			player.getX(), player.getY(), player.getZ(), 0.8F, pitch, player.getRandom().nextLong()));
	}

	public static void remove(UUID uuid) {
		SESSIONS.remove(uuid);
		RACE_COOLDOWN.remove(uuid);
	}
}
