package com.jjkshowdown.qte;

import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModSounds;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.function.Consumer;

/**
 * Server-authoritative quick-time events. The client shows the prompt and reports presses/timing; the server
 * validates against its own clock (with latency grace) and decides the outcome. Disabled QTEs resolve
 * instantly with the configured automatic outcome.
 */
public final class QteManager {
	public enum Kind { PRESS, MASH, TIMING }

	public enum Key { DODGE, ATTACK, DOMAIN, ULTIMATE, JUMP }

	public enum Outcome { SUCCESS, PARTIAL, FAIL }

	private static final int GRACE = 6;
	private static final List<Session> SESSIONS = new ArrayList<>();
	private static int nextId = 1;

	private record Session(int id, ServerPlayer player, Kind kind, Key key, long start, int duration, int presses, int sweetStart,
			int sweetEnd, Consumer<Outcome> callback, boolean[] done) {
	}

	private QteManager() {
	}

	public static boolean enabledFor(ServerPlayer player) {
		return JjkConfig.get().qte.enabled && JjkNetwork.settings(player).qteEnabled();
	}

	public static Outcome autoOutcome() {
		return switch (JjkConfig.get().qte.autoOutcome) {
			case "SUCCESS" -> Outcome.SUCCESS;
			case "FAIL" -> Outcome.FAIL;
			default -> Outcome.PARTIAL;
		};
	}

	/** Window scaling from config and difficulty. */
	public static int scale(int ticks) {
		JjkConfig cfg = JjkConfig.get();
		return Math.max(4, Math.round(ticks * cfg.qte.timingMultiplier * cfg.difficultyPreset().qteWindow));
	}

	/**
	 * Start a QTE.
	 *
	 * @param duration   total window in ticks (before scaling)
	 * @param presses    required presses for MASH
	 * @param sweetStart TIMING: start of the perfect window (ticks after start, before scaling)
	 * @param sweetEnd   TIMING: end of the perfect window
	 */
	public static int start(ServerPlayer player, Kind kind, Key key, int duration, int presses, int sweetStart, int sweetEnd, String label,
			Consumer<Outcome> callback) {
		if (!enabledFor(player)) {
			callback.accept(autoOutcome());
			return -1;
		}
		cancelFor(player);
		int d = kind == Kind.TIMING ? duration : scale(duration);
		int ss = sweetStart, se = sweetEnd;
		if (kind == Kind.TIMING) {
			// widen the sweet spot instead of the whole window
			int widen = Math.round((scale(sweetEnd - sweetStart) - (sweetEnd - sweetStart)) / 2f);
			ss = Math.max(0, sweetStart - widen);
			se = Math.min(duration, sweetEnd + widen);
		}
		int id = nextId++;
		SESSIONS.add(new Session(id, player, kind, key, player.level().getGameTime(), d, presses, ss, se, callback, new boolean[1]));
		JjkNetwork.send(player, new Payloads.QteStart(id, kind.ordinal(), key.ordinal(), d, presses, ss, se, label));
		player.level().playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.QTE_PROMPT, SoundSource.PLAYERS, 1.0f, 1.0f);
		return id;
	}

	public static void handleResponse(ServerPlayer player, int id, int presses, int elapsed) {
		for (Session s : SESSIONS) {
			if (s.id == id && s.player == player && !s.done[0]) {
				long serverElapsed = player.level().getGameTime() - s.start;
				int el = (int) Math.min(elapsed, serverElapsed + GRACE); // never trust a client claiming it pressed "later" than possible
				Outcome o = switch (s.kind) {
					case PRESS -> presses > 0 && el <= s.duration + GRACE ? Outcome.SUCCESS : Outcome.FAIL;
					case MASH -> presses >= s.presses ? Outcome.SUCCESS : presses >= s.presses / 2 ? Outcome.PARTIAL : Outcome.FAIL;
					case TIMING -> presses <= 0 ? Outcome.FAIL
							: (el >= s.sweetStart && el <= s.sweetEnd) ? Outcome.SUCCESS
							: (el >= s.sweetStart - 4 && el <= s.sweetEnd + 4) ? Outcome.PARTIAL : Outcome.FAIL;
				};
				resolve(s, o);
				return;
			}
		}
	}

	private static void resolve(Session s, Outcome o) {
		if (s.done[0]) return;
		s.done[0] = true;
		JjkNetwork.send(s.player, new Payloads.QteEnd(s.id, o.ordinal()));
		s.player.level().playSound(null, s.player.getX(), s.player.getY(), s.player.getZ(),
				o == Outcome.FAIL ? ModSounds.QTE_FAIL : ModSounds.QTE_SUCCESS, SoundSource.PLAYERS, 1.0f, 1.0f);
		try {
			s.callback.accept(o);
		} catch (Exception e) {
			com.jjkshowdown.JjkShowdown.LOGGER.error("QTE callback failed", e);
		}
	}

	public static void cancelFor(ServerPlayer player) {
		for (Session s : SESSIONS) {
			if (s.player == player && !s.done[0]) {
				s.done[0] = true;
				JjkNetwork.send(player, new Payloads.QteEnd(s.id, 3));
			}
		}
	}

	public static boolean hasActive(ServerPlayer player) {
		for (Session s : SESSIONS) {
			if (s.player == player && !s.done[0]) return true;
		}
		return false;
	}

	public static void tick(MinecraftServer server) {
		Iterator<Session> it = SESSIONS.iterator();
		List<Session> timeouts = new ArrayList<>();
		while (it.hasNext()) {
			Session s = it.next();
			if (s.done[0] || s.player.hasDisconnected()) {
				it.remove();
				continue;
			}
			long el = s.player.level().getGameTime() - s.start;
			if (el > s.duration + GRACE) timeouts.add(s);
		}
		for (Session s : timeouts) resolve(s, s.kind == Kind.MASH ? Outcome.FAIL : Outcome.FAIL);
	}
}
