package com.jjkshowdown.ability;

import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.SorcererState;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Relative;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.Set;

/** Small helpers shared by techniques. */
public final class Casting {
	private Casting() {
	}

	/** Speak a voice line with a probability, respecting the speaker cooldown (high priority lines ignore it). */
	public static void voice(CastContext ctx, VoiceLine line, float chance) {
		voice(ctx.caster(), ctx.state(), line, chance);
	}

	public static void voice(LivingEntity speaker, SorcererState s, VoiceLine line, float chance) {
		if (speaker instanceof SorcererBoss && !JjkConfig.get().ai.bossVoiceLines) return;
		if (speaker.getRandom().nextFloat() > chance) return;
		if (s.voiceCooldown > 0 && line.priority < 3) return;
		s.voiceCooldown = 50 + line.priority * 20;
		JjkNetwork.voice(speaker, line);
	}

	public static void pose(CastContext ctx, CastPose pose, int ticks) {
		ctx.state().setPose(pose, ticks);
	}

	/** Hand position (approximate) for particle effects: right or left side of the chest, slightly forward. */
	public static Vec3 hand(LivingEntity e, boolean right) {
		float yaw = (float) Math.toRadians(e.yBodyRot);
		double side = right ? -0.38 : 0.38;
		Vec3 fwd = new Vec3(-Math.sin(yaw), 0, Math.cos(yaw));
		Vec3 sideV = new Vec3(Math.cos(yaw), 0, Math.sin(yaw)).scale(side);
		return e.position().add(0, e.getBbHeight() * 0.62, 0).add(fwd.scale(0.45)).add(sideV);
	}

	/** Find a collision-free spot for {@code e} near {@code target}, searching upward and back toward {@code from}. */
	@Nullable
	public static Vec3 safeSpot(ServerLevel level, Entity e, Vec3 target, Vec3 from) {
		Vec3 back = from.subtract(target);
		double len = back.length();
		Vec3 step = len > 1.0E-4 ? back.scale(0.5 / len) : Vec3.ZERO;
		Vec3 p = target;
		for (int i = 0; i < 12; i++) {
			for (int up = 0; up <= 3; up++) {
				Vec3 c = p.add(0, up * 0.5, 0);
				AABB box = e.getDimensions(e.getPose()).makeBoundingBox(c);
				if (level.noCollision(e, box) && level.getWorldBorder().isWithinBounds(c)) return c;
			}
			p = p.add(step);
		}
		return null;
	}

	public static void teleport(ServerLevel level, Entity e, Vec3 pos, float yaw, float pitch) {
		e.teleportTo(level, pos.x, pos.y, pos.z, Set.<Relative>of(), yaw, pitch, false);
		e.fallDistance = 0;
	}

	public static float yawTowards(Vec3 from, Vec3 to) {
		Vec3 d = to.subtract(from);
		return (float) (Math.toDegrees(Math.atan2(-d.x, d.z)));
	}

	public static float pitchTowards(Vec3 from, Vec3 to) {
		Vec3 d = to.subtract(from);
		double h = Math.sqrt(d.x * d.x + d.z * d.z);
		return (float) (-Math.toDegrees(Math.atan2(d.y, h)));
	}
}
