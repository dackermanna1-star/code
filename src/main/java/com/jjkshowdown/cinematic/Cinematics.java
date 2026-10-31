package com.jjkshowdown.cinematic;

import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Server side of cinematics: picks viewers, freezes participants for the duration, and ends sessions early when every
 * viewer skipped. The on-end callback is how gameplay continues (e.g. Hollow Purple is fired when its cinematic ends,
 * or immediately on skip).
 */
public final class Cinematics {
	private static final List<Session> SESSIONS = new ArrayList<>();
	private static int nextId = 1;

	private static final class Session {
		final int id;
		final CinematicType type;
		final LivingEntity anchor;
		@Nullable
		final LivingEntity target;
		final Set<UUID> pending = new HashSet<>();
		final List<ServerPlayer> viewers = new ArrayList<>();
		@Nullable
		final Runnable onEnd;
		int remaining;
		boolean ended;

		Session(int id, CinematicType type, LivingEntity anchor, @Nullable LivingEntity target, @Nullable Runnable onEnd, int duration) {
			this.id = id;
			this.type = type;
			this.anchor = anchor;
			this.target = target;
			this.onEnd = onEnd;
			this.remaining = duration;
		}
	}

	private Cinematics() {
	}

	public static int duration(CinematicType type) {
		return Math.max(10, Math.round(type.baseDuration * JjkConfig.get().cinematics.lengthMultiplier));
	}

	/**
	 * Play a cinematic. Returns the session id, or -1 if cinematics are off (then {@code onEnd} runs immediately).
	 */
	public static int play(ServerLevel level, CinematicType type, LivingEntity anchor, @Nullable LivingEntity target, @Nullable Runnable onEnd) {
		JjkConfig.Cinematics cfg = JjkConfig.get().cinematics;
		if (!cfg.enabled) {
			if (onEnd != null) onEnd.run();
			return -1;
		}
		int duration = duration(type);
		Session s = new Session(nextId++, type, anchor, target, onEnd, duration);
		for (ServerPlayer p : PlayerLookup.around(level, anchor.position(), 72)) {
			Payloads.ClientSettings cs = JjkNetwork.settings(p);
			if (!cs.cinematicsEnabled() || cs.autoSkipCinematics()) continue;
			// spectators far away only see big set pieces
			boolean participant = p == anchor || p == target;
			if (!participant && p.distanceTo(anchor) > 40 && type != CinematicType.UNLIMITED_VOID && type != CinematicType.MALEVOLENT_SHRINE
					&& type != CinematicType.DOMAIN_CLASH && type != CinematicType.HOLLOW_PURPLE && type != CinematicType.HOLLOW_PURPLE_200) {
				continue;
			}
			s.viewers.add(p);
			s.pending.add(p.getUUID());
			JjkNetwork.send(p, new Payloads.Cinematic(s.id, type.ordinal(), anchor.getId(), target != null ? target.getId() : -1, duration,
					com.jjkshowdown.sorcerer.Sorcerers.character(anchor).ordinal()));
		}
		if (s.viewers.isEmpty()) {
			if (onEnd != null) onEnd.run();
			return -1;
		}
		if (cfg.freezeParticipants) {
			lock(anchor, duration);
			if (target != null) lock(target, duration);
		}
		SESSIONS.add(s);
		return s.id;
	}

	private static void lock(LivingEntity e, int ticks) {
		SorcererState st = Sorcerers.state(e);
		st.cinematicLock = Math.max(st.cinematicLock, ticks);
		st.dirty = true;
	}

	private static void unlock(LivingEntity e) {
		SorcererState st = Sorcerers.state(e);
		st.cinematicLock = 0;
		st.dirty = true;
	}

	public static void handleSkip(ServerPlayer player, int sessionId) {
		if (!JjkConfig.get().cinematics.allowSkip) return;
		for (Session s : SESSIONS) {
			if (s.id == sessionId && !s.ended) {
				s.pending.remove(player.getUUID());
				if (s.pending.isEmpty()) end(s, true);
				return;
			}
		}
	}

	public static boolean isPlaying(LivingEntity e) {
		for (Session s : SESSIONS) {
			if (!s.ended && (s.anchor == e || s.target == e)) return true;
		}
		return false;
	}

	public static void tick(MinecraftServer server) {
		Iterator<Session> it = SESSIONS.iterator();
		List<Session> toEnd = new ArrayList<>();
		while (it.hasNext()) {
			Session s = it.next();
			if (s.ended) {
				it.remove();
				continue;
			}
			s.viewers.removeIf(p -> p.isRemoved() || p.hasDisconnected());
			s.pending.removeIf(id -> s.viewers.stream().noneMatch(p -> p.getUUID().equals(id)));
			if (--s.remaining <= 0 || !s.anchor.isAlive() || s.pending.isEmpty()) toEnd.add(s);
		}
		for (Session s : toEnd) end(s, false);
	}

	private static void end(Session s, boolean skipped) {
		if (s.ended) return;
		s.ended = true;
		unlock(s.anchor);
		if (s.target != null) unlock(s.target);
		for (ServerPlayer p : s.viewers) JjkNetwork.send(p, new Payloads.CinematicEnd(s.id));
		if (s.onEnd != null) {
			try {
				s.onEnd.run();
			} catch (Exception e) {
				com.jjkshowdown.JjkShowdown.LOGGER.error("Cinematic end callback failed", e);
			}
		}
	}

	public static void clear() {
		SESSIONS.clear();
	}
}
