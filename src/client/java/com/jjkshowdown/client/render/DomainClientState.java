package com.jjkshowdown.client.render;

import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.domain.DomainType;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;

/** Client-side view of nearby domains (for atmosphere, fog, music and overlays). Refreshed once per tick. */
public final class DomainClientState {
	private static final List<DomainEntity> DOMAINS = new ArrayList<>();

	private DomainClientState() {
	}

	public static void tick() {
		DOMAINS.clear();
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return;
		for (Entity e : mc.level.entitiesForRendering()) {
			if (e instanceof DomainEntity d && d.isAlive()) DOMAINS.add(d);
		}
	}

	public static List<DomainEntity> domains() {
		return DOMAINS;
	}

	/** Domain containing {@code pos} (only once it has formed past half its expansion). */
	@Nullable
	public static DomainEntity inside(Vec3 pos) {
		DomainEntity best = null;
		for (DomainEntity d : DOMAINS) {
			if (d.phase() == DomainEntity.PHASE_COLLAPSING) continue;
			float r = d.radius() * d.formProgress(0);
			if (pos.distanceToSqr(d.position()) <= r * r && (best == null || d.radius() < best.radius())) best = d;
		}
		return best;
	}

	@Nullable
	public static DomainType insideType(Vec3 pos) {
		DomainEntity d = inside(pos);
		return d == null ? null : d.domainType();
	}

	/** 0..1 strength of the domain atmosphere at pos (fades with expansion). */
	public static float atmosphere(Vec3 pos) {
		DomainEntity d = inside(pos);
		if (d == null) return 0f;
		return Math.min(1f, d.formProgress(0) * 1.4f);
	}
}
