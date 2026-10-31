package com.jjkshowdown.domain;

import com.jjkshowdown.cinematic.CinematicType;
import com.jjkshowdown.cinematic.Cinematics;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.world.TerrainJournal;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Tracks live domains on the server and resolves overlaps into clashes. */
public final class DomainManager {
	private static final List<DomainEntity> ACTIVE = new ArrayList<>();
	private static final List<DomainClash> CLASHES = new ArrayList<>();
	private static int orphanTimer;

	private DomainManager() {
	}

	public static void register(DomainEntity d) {
		if (!ACTIVE.contains(d)) ACTIVE.add(d);
	}

	static void onCollapse(DomainEntity d) {
		ACTIVE.remove(d);
		for (DomainClash c : new ArrayList<>(CLASHES)) {
			if (c.done) continue;
			if (c.a == d || c.b == d) {
				DomainEntity other = c.a == d ? c.b : c.a;
				c.done = true;
				CLASHES.remove(c);
				if (other.isAlive() && other.phase() != DomainEntity.PHASE_COLLAPSING) other.leaveClash(true);
			}
		}
	}

	@Nullable
	public static DomainEntity ownedBy(LivingEntity e) {
		for (DomainEntity d : ACTIVE) {
			if (d.isAlive() && d.ownerId() == e.getId() && d.level() == e.level()) return d;
		}
		return null;
	}

	/** The strongest live enemy domain containing {@code e}, if any. */
	@Nullable
	public static DomainEntity enemyDomainAt(LivingEntity e) {
		for (DomainEntity d : ACTIVE) {
			if (d.isAlive() && d.isLive() && d.ownerId() != e.getId() && d.level() == e.level() && d.contains(e)) return d;
		}
		return null;
	}

	public static boolean isInsideAnyDomain(LivingEntity e) {
		for (DomainEntity d : ACTIVE) {
			if (d.isAlive() && d.level() == e.level() && d.contains(e)) return true;
		}
		return false;
	}

	public static boolean inClash(LivingEntity e) {
		for (DomainClash c : CLASHES) {
			if (!c.done && c.involves(e)) return true;
		}
		return false;
	}

	/** Route a domain-key press during a clash. Returns true if consumed. */
	public static boolean clashInput(LivingEntity e) {
		for (DomainClash c : CLASHES) {
			if (!c.done && c.involves(e)) {
				c.input(e);
				return true;
			}
		}
		return false;
	}

	public static boolean isActiveHolder(UUID id) {
		for (DomainEntity d : ACTIVE) {
			if (d.getUUID().equals(id)) return true;
		}
		return false;
	}

	public static void tick(MinecraftServer server) {
		ACTIVE.removeIf(d -> d.isRemoved());
		// start clashes for overlapping live domains
		if (JjkConfig.get().domains.clashes) {
			for (int i = 0; i < ACTIVE.size(); i++) {
				DomainEntity a = ACTIVE.get(i);
				if (!a.isLive() || a.clashWith() >= 0) continue;
				for (int j = i + 1; j < ACTIVE.size(); j++) {
					DomainEntity b = ACTIVE.get(j);
					if (!b.isLive() || b.clashWith() >= 0 || a.level() != b.level()) continue;
					LivingEntity oa = a.owner(), ob = b.owner();
					if (oa == null || ob == null || oa == ob) continue;
					if (b.contains(oa) || a.contains(ob)) startClash((ServerLevel) a.level(), a, b);
				}
			}
		}
		for (DomainClash c : new ArrayList<>(CLASHES)) {
			if (c.a.isRemoved() || c.b.isRemoved()) {
				c.done = true;
			}
			if (!c.done) c.tick((ServerLevel) c.a.level());
			if (c.done) CLASHES.remove(c);
		}
		if (++orphanTimer >= 100) {
			orphanTimer = 0;
			Set<UUID> live = new HashSet<>();
			for (DomainEntity d : ACTIVE) live.add(d.getUUID());
			for (ServerLevel level : server.getAllLevels()) {
				TerrainJournal.get(level).releaseOrphans(level, live::contains);
			}
		}
	}

	private static void startClash(ServerLevel level, DomainEntity a, DomainEntity b) {
		DomainClash c = new DomainClash(a, b);
		a.enterClash(b);
		b.enterClash(a);
		CLASHES.add(c);
		LivingEntity oa = a.owner(), ob = b.owner();
		if (oa != null && ob != null) {
			Cinematics.play(level, CinematicType.DOMAIN_CLASH, oa, ob, null);
			JjkNetwork.voice(oa, Sorcerers.character(oa) == CharacterType.GOJO ? VoiceLine.GOJO_CLASH : VoiceLine.SUKUNA_CLASH);
		}
		c.sync(level, true);
	}

	/** Server stopping: collapse everything and restore all arenas immediately. */
	public static void shutdown(MinecraftServer server) {
		for (DomainEntity d : new ArrayList<>(ACTIVE)) {
			if (!d.isRemoved()) d.discard();
		}
		ACTIVE.clear();
		CLASHES.clear();
		for (ServerLevel level : server.getAllLevels()) {
			TerrainJournal.get(level).releaseOrphans(level, id -> false);
		}
	}

	public static List<DomainEntity> active() {
		return ACTIVE;
	}

	public static Vec3 center(DomainEntity d) {
		return d.position();
	}
}
