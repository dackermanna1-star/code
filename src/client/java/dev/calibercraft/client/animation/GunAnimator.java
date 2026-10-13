package dev.calibercraft.client.animation;

import dev.calibercraft.client.GunController;
import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.client.render.WeaponRenderData;
import dev.calibercraft.core.ActionType;
import dev.calibercraft.core.GunState;
import dev.calibercraft.core.ReloadRunner;
import dev.calibercraft.core.Stat;
import dev.calibercraft.core.Timeline;
import dev.calibercraft.core.WeaponCategory;
import dev.calibercraft.data.AttachmentSlot;
import dev.calibercraft.item.WeaponStacks;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Procedural, frame-rate independent first-person animation. Produces a base transform for the weapon (view
 * space) and local transforms for each mechanical part, all derived from the controller's state and the active
 * reload/cycle timeline, so animation and ammunition logic can never drift apart.
 */
public final class GunAnimator {
	public static final GunAnimator INSTANCE = new GunAnimator();

	/** Result of one frame. Part matrices act in model-block space (model px / 16 - 0.5). */
	public static final class Frame {
		public final Matrix4f gun = new Matrix4f();
		public final Map<String, Matrix4f> parts = new HashMap<>();
		public final Map<String, Boolean> hidden = new HashMap<>();
		public final Vector3f rightHand = new Vector3f();
		public final Vector3f leftHand = new Vector3f();
		public boolean leftHandFree;
		public float flash;
		public float flashRoll;
		public boolean hideForScope;
		public float scale;
	}

	private final Frame frame = new Frame();
	private float swayYaw;
	private float swayPitch;
	private float swayYawVel;
	private float swayPitchVel;
	private float lastViewYaw = Float.NaN;
	private float lastViewPitch;
	private final Vector3f leftHandSmooth = new Vector3f(Float.NaN, 0, 0);
	private float lastClock;
	private int lastShotsSeen;
	private float flashRoll;
	private float hammerShotClock = -100;

	private GunAnimator() {
	}

	static float smooth(float x) {
		x = Mth.clamp(x, 0, 1);
		return x * x * (3 - 2 * x);
	}

	static float easeOut(float x) {
		x = Mth.clamp(x, 0, 1);
		return 1 - (1 - x) * (1 - x);
	}

	static float easeIn(float x) {
		x = Mth.clamp(x, 0, 1);
		return x * x;
	}

	/** 0 → 1 between a and b. */
	static float ramp(float t, float a, float b) {
		return b <= a ? (t >= a ? 1 : 0) : Mth.clamp((t - a) / (b - a), 0, 1);
	}

	static Vector3f blocks(Vector3f px) {
		return new Vector3f(px.x / 16f - 0.5f, px.y / 16f - 0.5f, px.z / 16f - 0.5f);
	}

	private static float scaleFor(String category) {
		return switch (category) {
			case "pistol" -> 0.42f;
			case "revolver" -> 0.40f;
			case "smg" -> 0.32f;
			case "shotgun" -> 0.28f;
			case "sniper", "lmg" -> 0.27f;
			default -> 0.28f;
		};
	}

	public Frame compute(GunController c, WeaponRenderData d, LocalPlayer player, float partial) {
		Frame f = frame;
		f.parts.clear();
		f.hidden.clear();
		ClientConfig cfg = ClientConfig.get();
		boolean calm = cfg.reducedMotion;
		float clock = c.clock;
		float dt = Math.max(0, clock - lastClock);
		lastClock = clock;
		GunState state = c.predicted();
		WeaponCategory category = c.definition().category();
		boolean pistol = category.oneHandedPose();
		float k = scaleFor(d.category());
		f.scale = k;

		// ---------------------------------------------------------------- base: hip ↔ aim
		float ads = smooth(c.ads);
		Identifier optic = WeaponStacks.loadout(c.stack()).get(AttachmentSlot.OPTIC).orElse(null);
		WeaponRenderData.Sight sight = d.sight(optic);
		boolean overlayOptic = c.optic().flatMap(a -> a.optic()).map(o -> o.overlay()).orElse(false);
		f.hideForScope = overlayOptic && c.ads > 0.92f;

		Vector3f grip = d.point("grip");
		Vector3f sightPoint = new Vector3f(8, sight.y(), sight.z());
		Vector3f anchorPx = new Vector3f(grip).lerp(sightPoint, ads);
		Vector3f hipPos = pistol ? new Vector3f(0.20f, -0.22f, -0.40f) : new Vector3f(0.21f, -0.24f, -0.40f);
		float eyeRelief = optic == null ? 0.16f : 0.22f;
		Vector3f adsPos = new Vector3f(0, 0, -eyeRelief);
		Vector3f pos = new Vector3f(hipPos).lerp(adsPos, ads);
		Quaternionf rot = new Quaternionf().slerp(new Quaternionf(), 0); // identity
		Quaternionf hipRot = new Quaternionf().rotateY((float) Math.toRadians(4.0)).rotateX((float) Math.toRadians(1.5));
		rot.set(hipRot).slerp(new Quaternionf(), ads);

		// ---------------------------------------------------------------- layered offsets (view space)
		Vector3f off = new Vector3f();
		float pitch = 0;
		float yaw = 0;
		float roll = 0;

		// Equip / draw
		float eq = 1 - easeOut(c.equip);
		off.add(0.02f * eq, -0.32f * eq, 0.06f * eq);
		pitch -= 35 * eq;
		roll += 10 * eq;

		// Sprint
		float sp = smooth(c.sprint);
		off.add(-0.02f * sp, -0.06f * sp, 0.04f * sp);
		yaw += 28 * sp;
		pitch -= 18 * sp;
		roll -= 18 * sp;
		if (sp > 0.01f && !calm) {
			float run = player.avatarState().getInterpolatedWalkDistance(partial) * 3.0f;
			off.add(Mth.sin(run) * 0.012f * sp, Math.abs(Mth.cos(run)) * 0.012f * sp, 0);
		}

		// Idle breathing and aim drift (sway stat); bipod or crouching steadies the aim.
		if (!calm) {
			float steady = (c.bipodActive() ? 0.25f : player.isShiftKeyDown() ? 0.55f : 1f);
			float breath = Mth.sin(clock * 0.07f);
			off.y += breath * 0.0035f * (1 - ads * 0.85f);
			float drift = (float) c.stats().get(Stat.SWAY) * steady * ads;
			yaw += Mth.sin(clock * 0.045f) * 0.35f * drift;
			pitch += Mth.sin(clock * 0.09f + 1.3f) * 0.22f * drift;
		}

		// Look sway: the weapon lags slightly behind view rotation (spring-damped).
		float viewYaw = player.getViewYRot(partial);
		float viewPitch = player.getViewXRot(partial);
		if (Float.isNaN(lastViewYaw)) {
			lastViewYaw = viewYaw;
			lastViewPitch = viewPitch;
		}
		float dYaw = Mth.wrapDegrees(viewYaw - lastViewYaw);
		float dPitch = viewPitch - lastViewPitch;
		lastViewYaw = viewYaw;
		lastViewPitch = viewPitch;
		if (!calm && dt > 0) {
			float target = 1 - ads * 0.75f;
			float tx = Mth.clamp(-dYaw * 0.9f, -6, 6) * target;
			float ty = Mth.clamp(-dPitch * 0.9f, -5, 5) * target;
			float stiffness = 0.35f;
			float damping = 0.55f;
			for (int i = 0; i < Math.max(1, Math.round(dt * 2)); i++) {
				swayYawVel += (tx - swayYaw) * stiffness - swayYawVel * damping;
				swayPitchVel += (ty - swayPitch) * stiffness - swayPitchVel * damping;
				swayYaw += swayYawVel;
				swayPitch += swayPitchVel;
			}
			yaw += swayYaw;
			pitch += swayPitch;
		}

		// Recoil: kick back, muzzle rise, a little roll. Reduced while aimed so the sight stays readable.
		float kick = c.recoilKick;
		float adsK = 1 - ads * 0.55f;
		off.z += kick * 0.035f * adsK;
		pitch += kick * 3.2f * adsK;
		if (c.shotsFired != lastShotsSeen) {
			lastShotsSeen = c.shotsFired;
			flashRoll = (float) (Math.random() * 360);
			hammerShotClock = clock;
		}
		roll += (float) Math.sin(c.shotsFired * 1.7) * kick * 1.2f * adsK;

		// Melee bash
		if (c.melee >= 0) {
			float m = c.melee < 3 ? easeOut(c.melee / 3f) : 1 - smooth((c.melee - 3) / 7f);
			off.add(-0.05f * m, 0.02f * m, -0.16f * m);
			yaw -= 15 * m;
			roll += 25 * m;
		}

		// Dry fire / overheat
		if (c.dryFire >= 0) {
			pitch += Mth.sin(c.dryFire * 3) * 0.6f * (1 - c.dryFire / 6f);
		}
		if (c.overheatAnim >= 0) {
			float o = Mth.sin(Mth.PI * Mth.clamp(c.overheatAnim / 30f, 0, 1));
			pitch -= 8 * o;
			off.y -= 0.03f * o;
			if (!calm) {
				roll += Mth.sin(clock * 2.1f) * 0.6f * o;
			}
		}

		// Inspect: turn the weapon to show its left side, then the right, then back.
		if (c.inspect >= 0) {
			float t = c.inspect;
			float in = smooth(ramp(t, 0, 10)) * (1 - smooth(ramp(t, 50, 60)));
			float side = smooth(ramp(t, 22, 34));
			yaw += in * (55 - 95 * side);
			roll += in * (-20 + 35 * side);
			pitch += in * 12;
			off.add(-0.12f * in, 0.05f * in, -0.05f * in);
		}

		// Reload / cycle body motion
		ReloadRunner runner = c.runner();
		if (runner != null) {
			float t = runner.totalElapsed();
			float rIn = smooth(ramp(t, 0, 6));
			float rOut = runner.phase() == ReloadRunner.Phase.END || runner.phase() == ReloadRunner.Phase.MAIN
				? 1 - smooth(ramp(runner.phaseTime(), runner.phaseLength() - 7, runner.phaseLength())) : 1;
			float w = rIn * rOut;
			switch (runner.kind()) {
				case TACTICAL, EMPTY -> {
					if (d.part("cylinder") != null) {
						pitch += 28 * w;
						roll -= 25 * w;
						off.add(-0.06f * w, 0.02f * w, 0.02f * w);
					} else if (category == WeaponCategory.LMG) {
						roll -= 15 * w;
						pitch += 6 * w;
						off.add(-0.05f * w, -0.02f * w, 0.03f * w);
					} else {
						roll -= 28 * w;
						pitch += 10 * w;
						yaw += 6 * w;
						off.add(-0.06f * w, -0.03f * w, 0);
					}
				}
				case SINGLE -> {
					roll += 38 * w;
					pitch += 6 * w;
					off.add(-0.05f * w, -0.01f * w, 0.02f * w);
				}
				case CYCLE -> {
					float cw = Mth.sin(Mth.PI * Mth.clamp(t / Math.max(1, runner.phaseLength()), 0, 1));
					roll += (c.definition().action() == ActionType.BOLT ? 12 : 4) * cw;
					pitch += 3 * cw;
				}
			}
		}

		// ---------------------------------------------------------------- compose base matrix
		Quaternionf layered = new Quaternionf().rotateY((float) Math.toRadians(yaw)).rotateX((float) Math.toRadians(pitch))
			.rotateZ((float) Math.toRadians(roll));
		Vector3f anchor = blocks(anchorPx);
		f.gun.identity().translate(pos.x + off.x, pos.y + off.y, pos.z + off.z).rotate(layered).rotate(rot).scale(k)
			.translate(-anchor.x, -anchor.y, -anchor.z);

		// ---------------------------------------------------------------- parts
		computeParts(c, d, state, f, clock);

		// ---------------------------------------------------------------- hands
		f.rightHand.set(grip);
		Vector3f left = leftHandTarget(c, d, f);
		if (Float.isNaN(leftHandSmooth.x) || dt <= 0) {
			leftHandSmooth.set(left);
		} else {
			leftHandSmooth.lerp(left, 1 - (float) Math.exp(-dt * 0.9));
		}
		f.leftHand.set(leftHandSmooth);

		// ---------------------------------------------------------------- muzzle flash
		float since = clock - c.lastShotClock;
		f.flash = since < 1.6f ? 1 - since / 1.6f : 0;
		f.flashRoll = flashRoll;
		return f;
	}

	private Vector3f leftHandTarget(GunController c, WeaponRenderData d, Frame f) {
		Vector3f support = new Vector3f(d.point("support"));
		f.leftHandFree = false;
		ReloadRunner r = c.runner();
		if (r == null) {
			WeaponRenderData.PartAnim pump = d.part("pump");
			Matrix4f pm = f.parts.get("pump");
			if (pump != null && pm != null) {
				return transformPx(pm, support);
			}
			return support;
		}
		String follow = switch (r.kind()) {
			case TACTICAL, EMPTY -> d.part("magazine") != null ? "magazine" : d.part("cylinder") != null ? "cylinder" : null;
			case SINGLE -> d.part("shell") != null ? "shell" : null;
			case CYCLE -> d.part("pump") != null ? "pump" : null;
		};
		if (follow != null && f.parts.containsKey(follow)) {
			Vector3f p = switch (follow) {
				case "magazine" -> {
					Vector3f well = new Vector3f(d.point("mag_well"));
					yield new Vector3f(well.x, well.y - 4, well.z);
				}
				case "shell" -> d.part("shell").to() != null ? new Vector3f(d.part("shell").to()) : support;
				case "cylinder" -> d.part("cylinder").spinCenter() != null ? new Vector3f(d.part("cylinder").spinCenter()) : support;
				default -> support;
			};
			if (Boolean.TRUE.equals(f.hidden.get(follow))) {
				f.leftHandFree = true;
				return new Vector3f(support.x - 2, support.y - 10, support.z + 6);
			}
			return transformPx(f.parts.get(follow), p);
		}
		return support;
	}

	/** Applies a part matrix (model-block space) to a model-px point, returning model px. */
	static Vector3f transformPx(Matrix4f m, Vector3f px) {
		Vector3f b = blocks(px);
		m.transformPosition(b);
		return new Vector3f((b.x + 0.5f) * 16, (b.y + 0.5f) * 16, (b.z + 0.5f) * 16);
	}

	private void computeParts(GunController c, WeaponRenderData d, GunState s, Frame f, float clock) {
		ReloadRunner r = c.runner();
		Timeline tl = r != null && r.phase() != ReloadRunner.Phase.LOOP ? r.currentTimeline() : null;
		float t = r == null ? 0 : r.phaseTime();
		boolean emptyLock = c.definition().action() == ActionType.SELF_LOADING && !s.chambered();
		float sinceShot = clock - c.lastShotClock;
		float cycleSpeed = (float) Math.max(0.6, Math.min(2.5, 60.0 / c.stats().get(Stat.RPM) * 20 * 0.8));

		for (String name : d.animatedParts()) {
			WeaponRenderData.PartAnim a = d.part(name);
			Matrix4f m = new Matrix4f();
			switch (name) {
				case "magazine" -> magazine(m, f, a, r, tl, t);
				case "belt" -> {
					Matrix4f mag = f.parts.get("magazine");
					if (mag != null) {
						m.set(mag);
					}
					if (Boolean.TRUE.equals(f.hidden.get("magazine"))) {
						f.hidden.put(name, true);
					}
				}
				case "slide", "bolt" -> {
					// Locked back while the chamber is empty (after the last shot and until the release cue chambers a round).
					float p = emptyLock ? 1 : shotCycle(sinceShot, cycleSpeed);
					if (tl != null) {
						p = Math.max(p, held(tl, t, name.equals("slide") ? "slide_back" : "charge_back", "slide_release", 1.5f));
					}
					travel(m, a, p);
				}
				case "charging_handle" -> {
					float p = 0;
					if (tl != null) {
						p = Math.max(pulse(tl, t, "charge", 2.5f, 2.5f), held(tl, t, "charge_back", "charge_slap", 2.5f));
					}
					travel(m, a, p);
				}
				case "pump" -> {
					float p = 0;
					if (tl != null) {
						p = held(tl, t, "pump_back", "pump_forward", 3f);
					}
					travel(m, a, p);
				}
				case "bolt_handle" -> {
					float lift = 0;
					float back = 0;
					if (tl != null) {
						lift = held(tl, t, "bolt_up", "bolt_down", 2.5f);
						back = held(tl, t, "bolt_back", "bolt_forward", 3f);
					}
					if (a != null) {
						Vector3f piv = blocks(a.pivot());
						m.translate(a.travel().x / 16f * back, a.travel().y / 16f * back, a.travel().z / 16f * back);
						m.translate(piv.x, piv.y, piv.z).rotateZ((float) Math.toRadians(a.liftDeg() * smooth(lift))).translate(-piv.x, -piv.y, -piv.z);
					}
				}
				case "cylinder" -> {
					float swing = tl != null ? held(tl, t, "cylinder_open", "cylinder_close", 4f) : 0;
					if (a != null) {
						Vector3f piv = blocks(a.pivot());
						m.translate(piv.x, piv.y, piv.z).rotateZ((float) Math.toRadians(a.swingDeg() * smooth(swing))).translate(-piv.x, -piv.y, -piv.z);
						if (a.spinCenter() != null) {
							float step = 360f / Math.max(1, a.chambers());
							float spin = c.shotsFired * step - step * (1 - easeOut(Math.min(1, sinceShot / 2f)));
							Vector3f sc = blocks(a.spinCenter());
							m.translate(sc.x, sc.y, sc.z).rotateZ((float) Math.toRadians(-spin)).translate(-sc.x, -sc.y, -sc.z);
						}
					}
				}
				case "hammer" -> {
					float since = clock - hammerShotClock;
					float cock = since < 0.6f ? 1 : 1 - easeOut((since - 0.6f) / 0.8f);
					if (a != null) {
						Vector3f piv = blocks(a.pivot());
						m.translate(piv.x, piv.y, piv.z).rotateX((float) Math.toRadians(a.cockDeg() * cock)).translate(-piv.x, -piv.y, -piv.z);
					}
				}
				case "feed_cover" -> {
					float open = tl != null ? held(tl, t, "cover_open", "cover_close", 4f) : 0;
					if (a != null) {
						Vector3f piv = blocks(a.pivot());
						m.translate(piv.x, piv.y, piv.z).rotateX((float) Math.toRadians(a.openDeg() * smooth(open))).translate(-piv.x, -piv.y, -piv.z);
					}
				}
				case "shell" -> {
					boolean loop = r != null && r.kind() == ReloadRunner.Kind.SINGLE && r.phase() == ReloadRunner.Phase.LOOP;
					if (!loop || a == null || a.from() == null || a.to() == null) {
						f.hidden.put(name, true);
					} else {
						float len = r.phaseLength();
						float p = smooth(ramp(r.phaseTime(), len * 0.1f, len * 0.6f));
						if (r.phaseTime() > len * 0.62f) {
							f.hidden.put(name, true);
						}
						Vector3f off = new Vector3f(a.from()).sub(a.to()).mul((1 - p) / 16f);
						m.translate(off);
					}
				}
				default -> {
				}
			}
			f.parts.put(name, m);
		}
	}

	/** 0→1→0 action of a self-loading weapon after a shot. */
	private static float shotCycle(float sinceShot, float duration) {
		if (sinceShot < 0 || sinceShot > duration) {
			return 0;
		}
		float h = duration * 0.35f;
		return sinceShot < h ? easeOut(sinceShot / h) : 1 - smooth((sinceShot - h) / (duration - h));
	}

	/** Part pulled at cue {@code start} and released at cue {@code end} (1 while held). */
	private static float held(Timeline tl, float t, String start, String end, float speed) {
		float a = tl.cueTime(start);
		if (a < 0) {
			return 0;
		}
		float b = tl.cueTime(end);
		float in = easeOut(ramp(t, a - speed * 0.6f, a + speed * 0.4f));
		if (b < 0) {
			return in;
		}
		return in * (1 - easeIn(ramp(t, b - speed * 0.3f, b + speed * 0.3f)));
	}

	/** Quick back-and-forth around a cue. */
	private static float pulse(Timeline tl, float t, String cue, float back, float forward) {
		float a = tl.cueTime(cue);
		if (a < 0) {
			return 0;
		}
		if (t < a - back || t > a + forward) {
			return 0;
		}
		return t < a ? easeOut(ramp(t, a - back, a)) : 1 - easeIn(ramp(t, a, a + forward));
	}

	private static void travel(Matrix4f m, WeaponRenderData.PartAnim a, float p) {
		if (a != null && p > 0) {
			m.translate(a.travel().x / 16f * p, a.travel().y / 16f * p, a.travel().z / 16f * p);
		}
	}

	private static void magazine(Matrix4f m, Frame f, WeaponRenderData.PartAnim a, ReloadRunner r, Timeline tl, float t) {
		if (r == null || tl == null || (r.kind() != ReloadRunner.Kind.TACTICAL && r.kind() != ReloadRunner.Kind.EMPTY)) {
			return;
		}
		float out = tl.cueTime("mag_out") >= 0 ? tl.cueTime("mag_out") : tl.cueTime("box_out");
		float in = tl.cueTime("mag_in") >= 0 ? tl.cueTime("mag_in") : tl.cueTime("box_in");
		if (out < 0 || in < 0) {
			return;
		}
		boolean rock = a != null && "rock".equals(a.style());
		Vector3f pivot = a != null ? blocks(a.pivot()) : new Vector3f();
		float drop;
		float tilt;
		if (t < out - 3) {
			return;
		} else if (t < out + 6) {
			float p = ramp(t, out - 3, out + 6);
			drop = 16 * easeIn(p);
			tilt = rock ? 22 * easeOut(Math.min(1, p * 2)) : 4 * p;
			if (p > 0.85f) {
				f.hidden.put("magazine", true);
			}
		} else if (t < in - 9) {
			f.hidden.put("magazine", true);
			return;
		} else if (t < in) {
			float p = easeOut(ramp(t, in - 9, in));
			drop = 12 * (1 - p);
			tilt = rock ? 22 * (1 - smooth(ramp(t, in - 4, in))) : 6 * (1 - p);
		} else {
			return;
		}
		m.translate(0, -drop / 16f, 0);
		m.translate(pivot.x, pivot.y, pivot.z).rotateX((float) Math.toRadians(tilt)).translate(-pivot.x, -pivot.y, -pivot.z);
	}
}
