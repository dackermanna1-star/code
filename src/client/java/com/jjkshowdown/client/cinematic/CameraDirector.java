package com.jjkshowdown.client.cinematic;

import com.jjkshowdown.cinematic.CinematicType;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.ScreenFx;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.mixin.client.CameraAccessor;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CharacterType;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.List;

/** Drives the camera during cinematics: Catmull-Rom camera paths, look targets, FOV, collision, titles. */
public final class CameraDirector {
	private CameraDirector() {
	}

	public static final class Active {
		public final int session;
		public final CinematicType type;
		public final int anchorId;
		public final int targetId;
		public final long start;
		public final int duration;
		public final Shots.Sequence seq;
		public final float anchorYaw;
		public final float targetYaw;
		public final CharacterType character;
		boolean flashed;
		int titlesShown;

		Active(Payloads.Cinematic p, long start, float anchorYaw, float targetYaw, CharacterType character) {
			this.session = p.sessionId();
			this.type = CinematicType.byOrdinal(p.cinematic());
			this.anchorId = p.anchorId();
			this.targetId = p.targetId();
			this.start = start;
			this.duration = Math.max(1, p.duration());
			this.seq = Shots.get(type);
			this.anchorYaw = anchorYaw;
			this.targetYaw = targetYaw;
			this.character = character;
		}
	}

	@Nullable
	private static Active active;
	private static float fov = 70;

	@Nullable
	public static Active active() {
		return active;
	}

	public static boolean isActive() {
		return active != null;
	}

	public static void start(Payloads.Cinematic p) {
		Minecraft mc = Minecraft.getInstance();
		ClientConfig cfg = ClientConfig.get();
		if (mc.level == null) return;
		if (!cfg.cinematics || cfg.autoSkipCinematics) {
			ClientPlayNetworking.send(new Payloads.CinematicSkip(p.sessionId()));
			return;
		}
		Entity anchor = mc.level.getEntity(p.anchorId());
		Entity target = p.targetId() >= 0 ? mc.level.getEntity(p.targetId()) : null;
		float ay = anchor instanceof LivingEntity le ? le.yBodyRot : anchor != null ? anchor.getYRot() : 0;
		float ty = target instanceof LivingEntity le2 ? le2.yBodyRot : target != null ? target.getYRot() : 0;
		// the packet names the anchor's character: visual sync for a freshly chosen character may not have arrived yet
		CharacterType c = CharacterType.byOrdinal(p.variant());
		if (!c.isSorcerer() && anchor != null) c = ClientState.characterOf(anchor);
		active = new Active(p, mc.level.getGameTime(), ay, ty, c);
	}

	public static void end(int session) {
		if (active != null && active.session == session) active = null;
	}

	public static void skip() {
		if (active == null) return;
		ClientPlayNetworking.send(new Payloads.CinematicSkip(active.session));
		active = null;
	}

	public static void reset() {
		active = null;
	}

	public static float progress(float partial) {
		if (active == null) return 0;
		Minecraft mc = Minecraft.getInstance();
		long now = mc.level == null ? active.start : mc.level.getGameTime();
		return Mth.clamp((now - active.start + partial) / active.duration, 0f, 1f);
	}

	public static void tick() {
		if (active == null) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null || mc.level.getGameTime() - active.start > active.duration + 10) {
			active = null;
			return;
		}
		float t = progress(0);
		List<Shots.Title> titles = active.seq.titles();
		while (active.titlesShown < titles.size() && t >= titles.get(active.titlesShown).start()) {
			active.titlesShown++;
			mc.getSoundManager().play(SimpleSoundInstance.forUI(ModSounds.CINEMATIC_HIT, 1.0f, 0.8f));
		}
		if (!active.flashed && active.seq.flashAt() >= 0 && t >= active.seq.flashAt()) {
			active.flashed = true;
			ScreenFx.flash(active.seq.flashColor(), 0.85f, 10);
			ScreenFx.shake(0.5f);
		}
	}

	/** Called at the end of {@code Camera.setup}. Returns true when the camera was overridden. */
	public static boolean apply(Camera camera, float partial) {
		if (active == null) return false;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return false;
		Entity anchor = mc.level.getEntity(active.anchorId);
		if (anchor == null) return false;
		Entity target = active.targetId >= 0 ? mc.level.getEntity(active.targetId) : null;
		List<Shots.Key> keys = active.seq.keys();
		float t = progress(partial);
		int i = 0;
		while (i < keys.size() - 2 && t > keys.get(i + 1).t()) i++;
		Shots.Key k1 = keys.get(i);
		Shots.Key k2 = keys.get(Math.min(i + 1, keys.size() - 1));
		Shots.Key k0 = keys.get(Math.max(i - 1, 0));
		Shots.Key k3 = keys.get(Math.min(i + 2, keys.size() - 1));
		float span = Math.max(1.0E-4f, k2.t() - k1.t());
		float u = Mth.clamp((t - k1.t()) / span, 0f, 1f);
		float eased = u * u * (3 - 2 * u);
		Vec3 p0 = keyPos(k0, anchor, target, partial), p1 = keyPos(k1, anchor, target, partial);
		Vec3 p2 = keyPos(k2, anchor, target, partial), p3 = keyPos(k3, anchor, target, partial);
		Vec3 pos = catmull(p0, p1, p2, p3, eased);
		Vec3 look = lookPos(k1.look(), anchor, target, partial).lerp(lookPos(k2.look(), anchor, target, partial), eased);
		fov = Mth.lerp(eased, k1.fov(), k2.fov());
		// keep the camera out of walls
		BlockHitResult hit = mc.level.clip(new ClipContext(look, pos, ClipContext.Block.VISUAL, ClipContext.Fluid.NONE, anchor));
		if (hit.getType() != HitResult.Type.MISS) {
			Vec3 dir = pos.subtract(look);
			double len = dir.length();
			if (len > 1.0E-3) pos = hit.getLocation().subtract(dir.scale(0.3 / len));
		}
		Vec3 d = look.subtract(pos);
		float yaw = (float) Math.toDegrees(Math.atan2(-d.x, d.z));
		float pitch = (float) -Math.toDegrees(Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z)));
		CameraAccessor acc = (CameraAccessor) camera;
		acc.jjk$setDetached(true);
		acc.jjk$setRotation(yaw, pitch);
		acc.jjk$setPosition(pos);
		return true;
	}

	public static float fov() {
		return fov;
	}

	private static Vec3 lerpPos(Entity e, float partial) {
		return new Vec3(Mth.lerp(partial, e.xo, e.getX()), Mth.lerp(partial, e.yo, e.getY()), Mth.lerp(partial, e.zo, e.getZ()));
	}

	private static Vec3 keyPos(Shots.Key k, Entity anchor, @Nullable Entity target, float partial) {
		Shots.Frame frame = k.frame();
		if (target == null && frame != Shots.Frame.ANCHOR) frame = Shots.Frame.ANCHOR;
		Vec3 base;
		Vec3 fwd;
		switch (frame) {
			case TARGET -> {
				base = lerpPos(target, partial);
				fwd = yawVec(active.targetYaw);
			}
			case PAIR -> {
				Vec3 a = lerpPos(anchor, partial), b = lerpPos(target, partial);
				base = a.lerp(b, 0.5);
				Vec3 axis = new Vec3(b.x - a.x, 0, b.z - a.z);
				fwd = axis.lengthSqr() < 1.0E-4 ? yawVec(active.anchorYaw) : axis.normalize();
			}
			default -> {
				base = lerpPos(anchor, partial);
				fwd = yawVec(active.anchorYaw);
			}
		}
		Vec3 right = new Vec3(-fwd.z, 0, fwd.x).scale(-1);
		return base.add(right.scale(k.x())).add(0, k.y(), 0).add(fwd.scale(k.z()));
	}

	private static Vec3 lookPos(Shots.Look look, Entity anchor, @Nullable Entity target, float partial) {
		Vec3 a = lerpPos(anchor, partial);
		Vec3 aEye = a.add(0, anchor.getEyeHeight(), 0);
		Vec3 aChest = a.add(0, anchor.getBbHeight() * 0.62, 0);
		Vec3 fwd = yawVec(active.anchorYaw);
		return switch (look) {
			case ANCHOR_EYE -> aEye;
			case ANCHOR_CHEST -> aChest;
			case ANCHOR_HANDS -> a.add(0, anchor.getBbHeight() * 0.66, 0).add(fwd.scale(0.45));
			case TARGET_EYE -> target != null ? lerpPos(target, partial).add(0, target.getEyeHeight(), 0) : aEye;
			case MID -> target != null ? aChest.lerp(lerpPos(target, partial).add(0, target.getBbHeight() * 0.62, 0), 0.5) : aChest;
			case AHEAD -> aEye.add(anchor.getViewVector(partial).scale(24));
		};
	}

	private static Vec3 yawVec(float yawDeg) {
		double y = Math.toRadians(yawDeg);
		return new Vec3(-Math.sin(y), 0, Math.cos(y));
	}

	private static Vec3 catmull(Vec3 p0, Vec3 p1, Vec3 p2, Vec3 p3, double t) {
		double t2 = t * t, t3 = t2 * t;
		return new Vec3(
				0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
				0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
				0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
	}
}
