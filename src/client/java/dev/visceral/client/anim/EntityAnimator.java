package dev.visceral.client.anim;

import dev.visceral.client.config.ClientConfig;
import dev.visceral.client.physics.HumanoidRagdoll;
import dev.visceral.client.physics.RagdollManager;
import dev.visceral.combat.AttackDef;
import dev.visceral.combat.Attacks;
import dev.visceral.entity.CombatState;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.net.Payloads;
import dev.visceral.registry.VisceralRegistry;
import dev.visceral.state.BodyRegion;
import dev.visceral.state.PhysState;
import dev.visceral.state.Wound;
import dev.visceral.state.WoundList;
import dev.visceral.state.WoundType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import org.joml.Quaterniond;
import org.joml.Quaternionf;
import org.joml.Vector3d;
import org.joml.Vector3f;
import org.jspecify.annotations.Nullable;

/**
 * Client-side animation brain for one living entity. Each frame it layers:
 * procedural locomotion, stagger, action clips (attacks, kicks, wind-ups), state clips
 * (get-up, crawl), spring-driven hit reactions and head stabilisation into an {@link AnimPose};
 * or, while knocked down or dead, hands the body to an active ragdoll and blends back out.
 */
public final class EntityAnimator implements PoseApplier.Sink {
	public final LivingEntity entity;
	public final AnimPose pose = new AnimPose();
	public @Nullable Rig rig;
	public boolean zombieArms;

	private long lastNanos = -1;
	private int lastFrame = -1;
	private final Vector3d lastPos = new Vector3d();
	private final Vector3d vel = new Vector3d();
	private float accelFwd;
	private float lastBodyRot;
	private float yawRate;
	private boolean wasOnGround = true;
	private float airTime;
	private float lastVy;
	private float time;
	private final Locomotion loco = new Locomotion();

	private final Spring3 rootSpring = new Spring3(130, 0.5f);
	private final Spring3 bodySpring = new Spring3(170, 0.45f);
	private final Spring3 headSpring = new Spring3(230, 0.4f);
	private final Spring3 rightArmSpring = new Spring3(140, 0.35f);
	private final Spring3 leftArmSpring = new Spring3(140, 0.35f);
	private final Spring3 landSpring = new Spring3(260, 0.55f);
	private final Spring3 legBuckle = new Spring3(180, 0.5f);

	private @Nullable ClipState action;
	private @Nullable ClipState stateClip;
	private @Nullable ClipState guard;
	private float combatReady;
	private long lastAttackMillis;
	private float hitStop;

	// Mirror of the server state.
	private PhysState phys = PhysState.STANDING;
	private float stateDirX, stateDirZ, stateForce;

	// Ragdoll and blends.
	public @Nullable HumanoidRagdoll ragdoll;
	private double ragdollAlpha;
	private final Vector3f[] snapPos = new Vector3f[Bone.COUNT];
	private final Quaternionf[] snapRot = new Quaternionf[Bone.COUNT];
	private float snapBlend;
	private float snapDuration = 0.35f;
	private float lieYaw;
	private final Vector3f getupOffset = new Vector3f();
	private boolean dead;
	private int deathFrames;
	public boolean severedHead, severedRightArm, severedLeftArm, severedRightLeg, severedLeftLeg;

	// Last rendered bone transforms (relative to the render origin) for ragdoll hand-off and blood.
	public final Vector3f[] bonePos = new Vector3f[Bone.COUNT];
	public final Quaternionf[] boneRot = new Quaternionf[Bone.COUNT];
	public float modelScale = 1f;
	public boolean haveBones;
	public long boneFrameTime;
	public final Vector3d renderOrigin = new Vector3d();

	// Last impact (for death ragdolls).
	private final Vector3d lastImpactDir = new Vector3d();
	private float lastImpactForce;
	private int lastImpactBone = Bone.BODY.ordinal();
	private long lastImpactTime;

	public EntityAnimator(LivingEntity entity) {
		this.entity = entity;
		for (int i = 0; i < Bone.COUNT; i++) {
			snapPos[i] = new Vector3f();
			snapRot[i] = new Quaternionf();
			bonePos[i] = new Vector3f();
			boneRot[i] = new Quaternionf();
		}
		lastBodyRot = entity.yBodyRot;
		lastPos.set(entity.getX(), entity.getY(), entity.getZ());
	}

	public static @Nullable EntityAnimator get(LivingEntity e) {
		Object data = ((VisceralEntity) e).visceral$clientData();
		return data instanceof EntityAnimator a ? a : null;
	}

	public static EntityAnimator getOrCreate(LivingEntity e) {
		EntityAnimator a = get(e);
		if (a == null) {
			a = new EntityAnimator(e);
			((VisceralEntity) e).visceral$setClientData(a);
		}
		return a;
	}

	public PhysState physState() {
		return phys;
	}

	public boolean isDead() {
		return dead;
	}

	// -------------------------------------------------------------------------------------------
	// Events
	// -------------------------------------------------------------------------------------------

	public void playAction(String clipName, float timeScale) {
		AnimClip clip = ClipLibrary.get(clipName);
		if (clip == null) return;
		if (action != null) action.stop();
		action = new ClipState(clip, 1f / Math.max(0.2f, timeScale));
	}

	public void playAttack(AttackDef def, float timeScale) {
		playAction(def.name, timeScale);
		lastAttackMillis = System.currentTimeMillis();
	}

	/** Debug: hold a clip at a fixed time (scripted pose inspection). */
	public void freezeAction(String clipName, float atTime) {
		AnimClip clip = ClipLibrary.get(clipName);
		if (clip == null) return;
		action = new ClipState(clip, 0f);
		action.time = Math.max(atTime, clip.blendIn + 1e-3f);
		action.endTime = Float.MAX_VALUE;
	}

	public void stopAction() {
		if (action != null) action.stop();
	}

	public boolean actionPlaying() {
		return action != null && !action.stopping && action.time < action.clip.length;
	}

	public void onPlayAnim(int id, float timeScale) {
		switch (id) {
			case Payloads.PlayAnim.MOB_WINDUP -> playAction(zombieArms ? "zombie_windup" : "mob_windup", timeScale);
			case Payloads.PlayAnim.MOB_STRIKE -> playAction(phys == PhysState.CRAWLING ? "crawl_grab" : (zombieArms ? "zombie_strike" : "mob_strike"), 1f);
			case Payloads.PlayAnim.MOB_WHIFF -> playAction(zombieArms ? "zombie_strike" : "mob_strike", 1.2f);
			case Payloads.PlayAnim.INTERRUPTED -> {
				stopAction();
				bodySpring.kick(-120, 0, 0);
				headSpring.kick(-160, 0, 0);
			}
			default -> {
				AttackDef def = Attacks.byId(id);
				if (def != null) playAttack(def, timeScale);
			}
		}
	}

	public void onImpact(Payloads.Impact p) {
		ClientConfig cfg = ClientConfig.get();
		float f = Math.min(p.force(), 4f);
		lastImpactDir.set(p.dx(), p.dy(), p.dz());
		lastImpactForce = p.force();
		lastImpactBone = Mth.clamp(p.region(), 0, Bone.COUNT - 1);
		lastImpactTime = System.currentTimeMillis();
		if (p.has(Payloads.Impact.FLAG_SEVER) && effectiveGore() >= 2) sever(lastImpactBone);
		if (p.has(Payloads.Impact.FLAG_MELEE) && cfg.hitStop) hitStop = p.has(Payloads.Impact.FLAG_HEAVY) ? 0.085f : 0.05f;
		if (ragdoll != null) {
			Vector3d imp = new Vector3d(p.dx(), Math.max(p.dy(), 0) + 0.25, p.dz()).normalize().mul(0.9 + f * 1.4);
			ragdoll.applyHit(lastImpactBone, imp);
		} else if (cfg.hitReactions) {
			float yaw = entity.yBodyRot * Mth.DEG_TO_RAD;
			float fx = -Mth.sin(yaw), fz = Mth.cos(yaw);
			float back = -(p.dx() * fx + p.dz() * fz);
			float right = -(p.dx() * -fz + p.dz() * fx) * -1f;
			float k = Math.min(f, 2.5f) * cfg.animationIntensity;
			BodyRegion region = BodyRegion.byId(p.region());
			rootSpring.kick(-back * 28 * k, right * 18 * k, right * 22 * k);
			bodySpring.kick(-back * 140 * k, right * 100 * k, -right * 45 * k);
			float headK = region == BodyRegion.HEAD ? 2.2f : 1f;
			headSpring.kick(-back * 200 * k * headK, right * 140 * k * headK, -right * 60 * k);
			rightArmSpring.kick(-back * 160 * k, 0, 60 * k);
			leftArmSpring.kick(-back * 160 * k, 0, -60 * k);
			if (region.isLeg()) {
				legBuckle.kick(region == BodyRegion.RIGHT_LEG ? 90 * k : 0, region == BodyRegion.LEFT_LEG ? 90 * k : 0, 0);
				landSpring.kick(25 * k, 0, 0);
			}
			if (region == BodyRegion.RIGHT_ARM) rightArmSpring.kick(-80 * k, 0, 80 * k);
			if (region == BodyRegion.LEFT_ARM) leftArmSpring.kick(-80 * k, 0, -80 * k);
			if (action != null && f > 0.6f) action.stop();
		}
		if (p.has(Payloads.Impact.FLAG_FATAL)) onDeath();
	}

	/** This entity's own attack connected: weapon recoil and hit-stop. */
	public void onOwnHitLanded(boolean heavy) {
		if (ClientConfig.get().hitStop) hitStop = heavy ? 0.085f : 0.05f;
		rightArmSpring.kick(50, 0, 0);
		bodySpring.kick(25, 0, 0);
	}

	public void onStateSync(Payloads.PhysStateSync p) {
		PhysState next = PhysState.byId(p.state());
		PhysState prev = phys;
		stateDirX = p.dirX();
		stateDirZ = p.dirZ();
		stateForce = p.force();
		phys = next;
		if (prev == next) {
			if (ragdoll != null && next == PhysState.DOWNED) ragdoll.wake();
			return;
		}
		ClientConfig cfg = ClientConfig.get();
		switch (next) {
			case FALLING -> {
				stopAction();
				if (cfg.ragdolls) startRagdoll(HumanoidRagdoll.Behaviour.PROTECTIVE_FALL, stateForce);
			}
			case DOWNED -> {
				stateClip = null;
				if (ragdoll == null && cfg.ragdolls) startRagdoll(HumanoidRagdoll.Behaviour.PROTECTIVE_FALL, 0.6f);
				else if (ragdoll != null && !dead && ragdoll.behaviour != HumanoidRagdoll.Behaviour.PROTECTIVE_FALL) {
					ragdoll.setBehaviour(HumanoidRagdoll.Behaviour.WRITHE);
				}
			}
			case RECOVERING -> beginGetUp();
			case CRAWLING -> beginCrawl();
			case STANDING -> {
				if (stateClip == null) dropRagdoll();
			}
			default -> {
			}
		}
	}

	private void onDeath() {
		if (dead) return;
		dead = true;
		ClientConfig cfg = ClientConfig.get();
		stopAction();
		stateClip = null;
		if (!cfg.ragdolls || !cfg.deathRagdolls) return;
		if (ragdoll == null) {
			Vector3d push = new Vector3d(lastImpactDir.x, 0, lastImpactDir.z);
			if (push.lengthSquared() < 1e-4) {
				float yaw = entity.yBodyRot * Mth.DEG_TO_RAD;
				push.set(Mth.sin(yaw), 0, -Mth.cos(yaw));
			}
			push.normalize();
			stateDirX = (float) push.x;
			stateDirZ = (float) push.z;
			startRagdoll(HumanoidRagdoll.Behaviour.DEATH_THROES, Math.max(1f, lastImpactForce));
		} else {
			ragdoll.setBehaviour(HumanoidRagdoll.Behaviour.DEATH_THROES);
			ragdoll.control = 0;
			ragdoll.wake();
		}
	}

	private int effectiveGore() {
		return Math.min(ClientConfig.get().goreLevel, dev.visceral.client.net.ClientNet.serverMaxGore);
	}

	private void sever(int bone) {
		if (bone == Bone.BODY.ordinal()) return;
		switch (Bone.ALL[bone]) {
			case HEAD -> severedHead = true;
			case RIGHT_ARM -> severedRightArm = true;
			case LEFT_ARM -> severedLeftArm = true;
			case RIGHT_LEG -> severedRightLeg = true;
			case LEFT_LEG -> severedLeftLeg = true;
			default -> {
			}
		}
		if (ragdoll != null) ragdoll.sever(bone);
	}

	public boolean isSevered(int bone) {
		return switch (Bone.ALL[bone]) {
			case HEAD -> severedHead;
			case RIGHT_ARM -> severedRightArm;
			case LEFT_ARM -> severedLeftArm;
			case RIGHT_LEG -> severedRightLeg;
			case LEFT_LEG -> severedLeftLeg;
			default -> false;
		};
	}

	// -------------------------------------------------------------------------------------------
	// Ragdoll lifecycle
	// -------------------------------------------------------------------------------------------

	private boolean startRagdoll(HumanoidRagdoll.Behaviour behaviour, float force) {
		if (rig == null || !haveBones || System.nanoTime() - boneFrameTime > 1_000_000_000L) return false;
		if (!RagdollManager.canAdd()) return false;
		Vector3d v = new Vector3d(entity.getDeltaMovement().x, entity.getDeltaMovement().y, entity.getDeltaMovement().z).mul(20);
		HumanoidRagdoll r = HumanoidRagdoll.build(rig, bonePos, boneRot, renderOrigin, modelScale, v);
		r.fallDir.set(stateDirX, 0, stateDirZ);
		r.control = Math.max(0, 1 - force * 0.18);
		r.setBehaviour(behaviour);
		r.tetherTarget.set(entity.getX(), entity.getY() + entity.getBbHeight() * 0.5, entity.getZ());
		// Kick the torso in the push direction so the fall starts with the blow, not just gravity.
		Vector3d push = new Vector3d(stateDirX, 0.15, stateDirZ).mul(1.2 + Math.min(force, 5) * 0.9);
		r.applyHit(lastImpactBone, push);
		r.control = Math.max(0, 1 - force * 0.18);
		for (int i = 0; i < Bone.COUNT; i++) if (isSevered(i)) r.sever(i);
		WoundList wounds = entity.getAttached(VisceralRegistry.WOUNDS);
		r.clutchBone = clutchBone(wounds);
		if (ragdoll != null) RagdollManager.remove(ragdoll);
		ragdoll = r;
		ragdollAlpha = 0;
		snapBlend = 0;
		stateClip = null;
		RagdollManager.add(r);
		return true;
	}

	private int clutchBone(@Nullable WoundList wounds) {
		if (wounds == null) return -1;
		Wound worst = null;
		for (Wound w : wounds.wounds()) {
			if (w.type() == WoundType.SEVERED) continue;
			if (worst == null || w.severity() > worst.severity()) worst = w;
		}
		return worst == null || worst.severity() < 0.3f ? -1 : worst.region().ordinal();
	}

	public void dropRagdoll() {
		if (ragdoll != null) {
			RagdollManager.remove(ragdoll);
			ragdoll = null;
		}
	}

	/** Snapshot the current (ragdoll) bone transforms so a clip can blend out of them. */
	private void snapshot(float duration) {
		for (int i = 0; i < Bone.COUNT; i++) {
			snapPos[i].set(bonePos[i]);
			snapRot[i].set(boneRot[i]);
		}
		snapBlend = 1f;
		snapDuration = duration;
	}

	private void beginGetUp() {
		boolean faceUp;
		Vector3d axis = new Vector3d(0, 0, 1);
		Vector3d waist = new Vector3d(entity.getX(), entity.getY(), entity.getZ());
		if (ragdoll != null) {
			faceUp = ragdoll.faceUp();
			ragdoll.bodyAxis(axis);
			var torso = ragdoll.torso();
			Vector3d down = torso.rot.transform(new Vector3d(0, torso.halfExtents.y, 0));
			waist.set(torso.pos).add(down);
		} else {
			faceUp = false;
			float yaw = entity.yBodyRot * Mth.DEG_TO_RAD;
			axis.set(Mth.sin(yaw), 0, -Mth.cos(yaw));
		}
		Vector3d forward = faceUp ? new Vector3d(axis) : new Vector3d(axis).negate();
		lieYaw = (float) (Mth.atan2(-forward.x, forward.z) * Mth.RAD_TO_DEG);
		float legLen = rig != null ? rig.legLength / 16f * modelScale : 0.75f;
		Vector3d feet = new Vector3d(waist).fma(legLen, axis);
		Vector3d off = feet.sub(entity.getX(), entity.getY(), entity.getZ());
		float yawR = lieYaw * Mth.DEG_TO_RAD;
		float fx = -Mth.sin(yawR), fz = Mth.cos(yawR);
		float rx = -fz, rz = fx;
		getupOffset.set((float) (off.x * rx + off.z * rz), 0, (float) (off.x * fx + off.z * fz));
		snapshot(0.3f);
		dropRagdoll();
		AnimClip clip = ClipLibrary.get(faceUp ? "getup_back" : "getup_front");
		stateClip = clip == null ? null : new ClipState(clip, clip.length / (getupTicks() / 20f));
	}

	private float getupTicks() {
		return entity instanceof Player ? 20f : 26f;
	}

	private void beginCrawl() {
		lieYaw = entity.yBodyRot;
		getupOffset.zero();
		snapshot(0.45f);
		dropRagdoll();
		AnimClip clip = ClipLibrary.get("crawl");
		stateClip = clip == null ? null : new ClipState(clip, 1f);
	}

	// -------------------------------------------------------------------------------------------
	// Per-frame
	// -------------------------------------------------------------------------------------------

	/** Advances simulation inputs; called once per rendered frame from render-state extraction. */
	public void frame(LivingEntityRenderState state, float partialTick, int frameId) {
		if (frameId == lastFrame) return;
		lastFrame = frameId;
		long now = System.nanoTime();
		float dt = lastNanos < 0 ? 0f : Math.min(0.1f, (now - lastNanos) / 1e9f);
		lastNanos = now;
		if (Minecraft.getInstance().isPaused()) dt = 0;
		float animDt = dt;
		if (hitStop > 0) {
			hitStop -= dt;
			animDt = dt * 0.08f;
		}
		time += animDt;
		ClientConfig cfg = ClientConfig.get();
		renderOrigin.set(state.x, state.y, state.z);
		pose.reset();

		CombatState cs = VisceralEntity.get(entity);
		if (cs != null && cs.state != phys) {
			// State set without a sync packet path (e.g. integrated server shares objects): adopt it.
			onStateSync(new Payloads.PhysStateSync(entity.getId(), cs.state.ordinal(), cs.stateTicks, cs.stateDuration, cs.dirX, cs.dirZ, cs.force, 0));
		}
		if (entity.isDeadOrDying() && !dead) onDeath();

		updateKinematics(state, dt);
		if (action != null) {
			action.advance(animDt);
			if (action.finished()) action = null;
		}
		if (stateClip != null) {
			stateClip.advance(animDt);
			if (stateClip.finished() && phys != PhysState.CRAWLING) stateClip = null;
		}
		if (snapBlend > 0) snapBlend = Math.max(0, snapBlend - dt / snapDuration);
		updateSprings(animDt);

		for (int i = 0; i < Bone.COUNT; i++) pose.hidden[i] = isSevered(i);

		if (ragdoll != null) {
			ragdoll.tetherTarget.set(entity.getX(), entity.getY() + entity.getBbHeight() * 0.5, entity.getZ());
			if (cs != null && cs.state == PhysState.DOWNED && cs.stateDuration > 0) {
				ragdoll.riseUrgency = Mth.clamp((cs.stateTicks - cs.stateDuration * 0.6) / (cs.stateDuration * 0.4 + 1), 0, 1);
			}
			ragdoll.tetherEnabled = !dead;
			ragdollAlpha = RagdollManager.alpha(ragdoll);
			fillFromRagdoll();
			pose.active = true;
			pose.worldWeight = 1f;
			pose.noRedOverlay = dead && entity.deathTime > 3;
			pose.suppressVanillaAttack = true;
			return;
		}

		boolean humanoid = rig != null && state instanceof HumanoidRenderState;
		if (!humanoid) {
			rigidBody(state, animDt, cfg);
			return;
		}
		boolean enabled = cfg.animationOverhaul && (entity instanceof Player ? cfg.animatePlayers : cfg.animateMobs)
			&& state.distanceToCameraSq < cfg.animationDistance * cfg.animationDistance;
		boolean vanillaOnly = !humanoid || !enabled || state.isAutoSpinAttack || state.hasPose(net.minecraft.world.entity.Pose.SLEEPING)
			|| (humanoid && (((HumanoidRenderState) state).isPassenger || ((HumanoidRenderState) state).isFallFlying
			|| ((HumanoidRenderState) state).swimAmount > 0.05f));
		if (vanillaOnly && stateClip == null) {
			pose.active = humanoid && (snapBlend > 0 || dead);
			if (snapBlend > 0) blendSnapshot();
			return;
		}
		pose.active = true;
		HumanoidRenderState hs = (HumanoidRenderState) state;
		float intensity = cfg.animationIntensity;

		locomotion(hs, dt, intensity);
		combatStance(hs, dt);
		if (phys == PhysState.STAGGERED) stagger(intensity);
		if (action != null) {
			boolean legs = action.clip.animatesLegs();
			float hip = rig.legLength / 16f * modelScale;
			action.applyTo(pose, 1f, legs, hip / 0.75f, hip);
			if (action.weight() > 0.01f) pose.suppressVanillaAttack = true;
		} else if (hs.attackTime > 0) {
			// Vanilla swing (mining, using items): let vanilla drive the swinging arm.
			int arm = (hs.attackArm == HumanoidArm.RIGHT ? Bone.RIGHT_ARM : Bone.LEFT_ARM).ordinal();
			pose.vanilla[arm] = 1f;
			pose.vanillaBase[arm] = false;
			float twist = Mth.sin(Mth.sqrt(hs.attackTime) * Mth.TWO_PI) * 11f * (hs.attackArm == HumanoidArm.LEFT ? -1 : 1);
			pose.local[Bone.BODY.ordinal()].rotateY(twist * AnimPose.DEG);
		}
		if (stateClip != null) applyStateClip(hs);
		if (phys == PhysState.STAGGERED) braceAgainstWall(intensity);
		if (cfg.footPlacement && stateClip == null && (action == null || !action.clip.animatesLegs())) footPlacement(dt);
		applySprings(intensity);
		headLook(hs);
		if (snapBlend > 0) blendSnapshot();
	}

	private float tumble;
	private float tumbleVel;
	private float tumbleSide = 1f;

	/**
	 * Non-humanoid bodies (quadrupeds, spiders, creepers...) have no articulated ragdoll; they
	 * tumble as one rigid body onto their side in the push direction and roll back up when
	 * they recover. Hit flinches still sway the whole body.
	 */
	private void rigidBody(LivingEntityRenderState state, float dt, ClientConfig cfg) {
		if (!cfg.ragdolls && phys == PhysState.STANDING && rootSpring.value.lengthSquared() < 0.01f) return;
		float target = switch (phys) {
			case FALLING, DOWNED, CRAWLING -> 1f;
			case RECOVERING -> {
				CombatState cs = VisceralEntity.get(entity);
				float p = cs != null && cs.stateDuration > 0 ? cs.stateTicks / (float) cs.stateDuration : 1f;
				yield p < 0.5f ? 1f : 0f;
			}
			default -> 0f;
		};
		if (dead) target = 0f;
		if (target > 0 && tumble < 0.05f) {
			float yaw = entity.yBodyRot * Mth.DEG_TO_RAD;
			float right = stateDirX * Mth.cos(yaw) + stateDirZ * Mth.sin(yaw);
			tumbleSide = right >= 0 ? -1f : 1f;
		}
		// Under-damped spring: the body thuds over and settles with a small bounce.
		float k = 90f, c = 11f;
		tumbleVel += ((target - tumble) * k - tumbleVel * c) * dt;
		tumble = Mth.clamp(tumble + tumbleVel * dt, -0.1f, 1.08f);
		float h = state.boundingBoxHeight, w = state.boundingBoxWidth;
		pose.active = true;
		pose.rootPivotY = h * 0.5f;
		pose.rootRoll = tumbleSide * 90f * tumble + rootSpring.value.z;
		pose.rootPitch = rootSpring.value.x;
		pose.rootY = -Math.max(0, h * 0.5f - w * 0.5f) * Math.max(0, tumble);
		if (phys == PhysState.STAGGERED) {
			float t = time * 9f;
			pose.rootRoll += Mth.sin(t) * 6f;
			pose.rootPitch += Mth.cos(t * 0.7f) * 4f;
		}
	}

	private void updateKinematics(LivingEntityRenderState state, float dt) {
		Vector3d pos = new Vector3d(state.x, state.y, state.z);
		if (dt > 0) {
			Vector3d d = new Vector3d(pos).sub(lastPos);
			if (d.lengthSquared() > 16) d.zero();
			Vector3d inst = d.div(dt);
			float k = Math.min(1f, dt / 0.07f);
			float prevFwd = forwardSpeed();
			vel.lerp(inst, k);
			float yaw = state.bodyRot;
			float dyaw = Mth.wrapDegrees(yaw - lastBodyRot);
			yawRate += (dyaw / dt - yawRate) * Math.min(1f, dt / 0.12f);
			lastBodyRot = yaw;
			float fwd = forwardSpeed();
			accelFwd += ((fwd - prevFwd) / dt - accelFwd) * Math.min(1f, dt / 0.15f);
		}
		lastPos.set(pos);
		boolean onGround = entity.onGround();
		float vy = (float) vel.y;
		if (!onGround) {
			airTime += dt;
		} else {
			if (!wasOnGround && airTime > 0.12f) {
				float impact = Mth.clamp(-lastVy - 3f, 0, 30);
				landSpring.kick(impact * 9f * ClientConfig.get().animationIntensity, 0, 0);
			}
			airTime = 0;
		}
		wasOnGround = onGround;
		lastVy = vy;
	}

	private float forwardSpeed() {
		float yaw = lastBodyRot * Mth.DEG_TO_RAD;
		return (float) (vel.x * -Mth.sin(yaw) + vel.z * Mth.cos(yaw));
	}

	private void updateSprings(float dt) {
		rootSpring.update(dt);
		bodySpring.update(dt);
		headSpring.update(dt);
		rightArmSpring.update(dt);
		leftArmSpring.update(dt);
		landSpring.update(dt);
		legBuckle.update(dt);
	}

	private void locomotion(HumanoidRenderState hs, float dt, float intensity) {
		float yaw = hs.bodyRot * Mth.DEG_TO_RAD;
		float fx = -Mth.sin(yaw), fz = Mth.cos(yaw);
		float rx = -fz, rz = fx;
		float vf = (float) (vel.x * fx + vel.z * fz);
		float vr = (float) (vel.x * rx + vel.z * rz);
		float speed = Mth.sqrt(vf * vf + vr * vr);
		boolean grounded = entity.onGround() || airTime < 0.1f;
		if (!grounded) speed = 0;
		float moveAngle = (float) (Mth.atan2(vr, vf) * Mth.RAD_TO_DEG);
		float legLen = rig.legLength / 16f * Math.max(0.2f, hs.scale) * (entity instanceof Player ? 0.9375f : 1f);
		WoundList wounds = entity.getAttached(VisceralRegistry.WOUNDS);
		float limp = 0;
		if (wounds != null) limp = Mth.clamp(wounds.severity(BodyRegion.RIGHT_LEG) - wounds.severity(BodyRegion.LEFT_LEG), -1, 1);
		loco.update(dt, speed, moveAngle, legLen, entity.isSprinting(), hs.isCrouching, limp);

		float swingRad = loco.swingDir * Mth.DEG_TO_RAD;
		float cs = Mth.cos(swingRad), sn = Mth.sin(swingRad);
		// Legs: swing along the travel direction (relative to the hips), never crossing inwards.
		float rSwing = loco.rightLegSwing, lSwing = loco.leftLegSwing;
		float rZ = Math.max(-6f, rSwing * sn);
		float lZ = Math.min(6f, lSwing * sn);
		float idle = 1f - Locomotion.smoothstep(0.05f, 0.6f, speed);
		pose.rot(Bone.RIGHT_LEG, -rSwing * cs, loco.hipYaw, rZ + 2.5f * idle);
		pose.rot(Bone.LEFT_LEG, -lSwing * cs, loco.hipYaw, lZ - 2.5f * idle);
		pose.off(Bone.RIGHT_LEG).y -= loco.rightLift;
		pose.off(Bone.LEFT_LEG).y -= loco.leftLift;

		// Torso: lean into speed and acceleration, counter-rotate against the hips, breathe.
		float accelLean = Mth.clamp(accelFwd * 1.1f, -12f, 12f);
		float breathe = Mth.sin(time * 1.8f) * 0.9f * idle;
		float bodyPitch = (loco.torsoLean + accelLean) * intensity + breathe;
		float bodyYaw = loco.torsoTwist * intensity - loco.hipYaw * 0.25f;
		pose.rot(Bone.BODY, bodyPitch, bodyYaw, loco.torsoRoll * intensity);

		// Arms swing opposite to the legs; vanilla keeps control of item-use poses.
		applyArm(hs, Bone.RIGHT_ARM, HumanoidArm.RIGHT, loco.armSwingRight, idle, intensity, 1f);
		applyArm(hs, Bone.LEFT_ARM, HumanoidArm.LEFT, loco.armSwingLeft, idle, intensity, -1f);

		// Root: pelvis bob, weight shift, banking into turns.
		float sizeK = legLen / 0.75f;
		pose.rootY += loco.pelvisBob * intensity;
		pose.rootX += (loco.pelvisSway + 0.012f * Mth.sin(time * 0.9f) * idle * sizeK) * intensity;
		float bank = Mth.clamp(yawRate * speed * 0.0035f, -11f, 11f);
		pose.rootRoll += bank * intensity;

		if (hs.isCrouching) {
			pose.rootY -= 0.12f * sizeK;
			pose.off(Bone.RIGHT_LEG).y -= 1.6f;
			pose.off(Bone.LEFT_LEG).y -= 1.6f;
			pose.local[Bone.RIGHT_LEG.ordinal()].rotateLocalX(-14f * AnimPose.DEG);
			pose.local[Bone.LEFT_LEG.ordinal()].rotateLocalX(-14f * AnimPose.DEG);
			pose.local[Bone.BODY.ordinal()].rotateLocalX(24f * AnimPose.DEG);
		}
		if (!grounded) {
			// Airborne: legs tuck, arms open for balance; long falls flail.
			float fall = Mth.clamp(airTime * 2f, 0, 1);
			float flail = Mth.clamp(-lastVy / 25f - 0.3f, 0, 1);
			pose.local[Bone.RIGHT_LEG.ordinal()].rotateLocalX((-22f + flail * 15f * Mth.sin(time * 9)) * fall * AnimPose.DEG);
			pose.local[Bone.LEFT_LEG.ordinal()].rotateLocalX((14f - flail * 15f * Mth.sin(time * 9)) * fall * AnimPose.DEG);
			pose.off(Bone.RIGHT_LEG).y -= 2.0f * fall;
			pose.off(Bone.LEFT_LEG).y -= 1.2f * fall;
			float open = (18f + 50f * flail) * fall;
			pose.local[Bone.RIGHT_ARM.ordinal()].rotateLocalZ((open + flail * 25f * Mth.sin(time * 11)) * AnimPose.DEG);
			pose.local[Bone.LEFT_ARM.ordinal()].rotateLocalZ(-(open + flail * 25f * Mth.cos(time * 10)) * AnimPose.DEG);
			pose.local[Bone.RIGHT_ARM.ordinal()].rotateLocalX(-flail * 70f * AnimPose.DEG);
			pose.local[Bone.LEFT_ARM.ordinal()].rotateLocalX(-flail * 60f * AnimPose.DEG);
		}
	}

	private void applyArm(HumanoidRenderState hs, Bone bone, HumanoidArm side, float swing, float idle, float intensity, float sign) {
		HumanoidModel.ArmPose armPose = side == HumanoidArm.RIGHT ? hs.rightArmPose : hs.leftArmPose;
		boolean holding = armPose == HumanoidModel.ArmPose.ITEM;
		boolean special = armPose != HumanoidModel.ArmPose.EMPTY && armPose != HumanoidModel.ArmPose.ITEM
			&& !(armPose == HumanoidModel.ArmPose.SPEAR && !hs.isUsingItem);
		int i = bone.ordinal();
		if (special) {
			pose.vanilla[i] = 1f;
			return;
		}
		if (zombieArms) {
			// Keep the classic raised arms, adding a heavy shamble.
			pose.vanillaBase[i] = true;
			pose.rot(bone, swing * 0.25f * intensity, 0, sign * 2f * Mth.sin(time * 1.3f + sign));
			return;
		}
		float ratio = holding ? 0.55f : 1f;
		float x = swing * ratio * intensity + loco.armBase + (holding ? -14f : 0f);
		float sway = Mth.sin(time * 1.1f + sign) * 1.2f * idle;
		pose.rot(bone, x - 2f * idle, 0, sign * (loco.armSpread + sway));
	}

	/** Weapon-specific guard, blended in while locked on, fighting, or (for mobs) aggressive. */
	private void combatStance(HumanoidRenderState hs, float dt) {
		boolean ready;
		if (entity == Minecraft.getInstance().player) {
			ready = dev.visceral.client.input.LockOn.active() || dev.visceral.client.input.CombatInput.attacking();
		} else if (entity instanceof net.minecraft.world.entity.Mob mob) {
			ready = mob.isAggressive() && !zombieArms && !mob.getMainHandItem().isEmpty();
		} else {
			ready = false;
		}
		ready |= System.currentTimeMillis() - lastAttackMillis < 2500;
		ready &= phys == PhysState.STANDING && !hs.isUsingItem;
		combatReady += ((ready ? 1f : 0f) - combatReady) * Math.min(1f, dt * (ready ? 6f : 2.5f));
		if (combatReady < 0.01f) return;
		String name = switch (dev.visceral.combat.Attacks.moveSet(dev.visceral.combat.WeaponClass.of(entity.getMainHandItem()))) {
			case AXE, MACE -> "guard_axe";
			case SPEAR -> "guard_spear";
			case FIST -> "guard_fist";
			default -> "guard_sword";
		};
		if (guard == null || !guard.clip.name.equals(name)) {
			AnimClip clip = ClipLibrary.get(name);
			if (clip == null) return;
			guard = new ClipState(clip, 1f);
			guard.time = clip.blendIn;
		}
		guard.advance(dt);
		boolean still = Mth.sqrt((float) (vel.x * vel.x + vel.z * vel.z)) < 0.4f;
		guard.applyTo(pose, combatReady, still);
		for (Bone arm : new Bone[] {Bone.RIGHT_ARM, Bone.LEFT_ARM}) {
			if (combatReady > 0.5f) pose.vanillaBase[arm.ordinal()] = false;
		}
	}

	private void stagger(float intensity) {
		CombatState cs = VisceralEntity.get(entity);
		float progress = cs != null && cs.stateDuration > 0 ? Mth.clamp(cs.stateTicks / (float) cs.stateDuration, 0, 1) : 0.5f;
		float k = (float) Math.pow(1 - progress, 0.7) * Math.min(1f, 0.4f + stateForce / 2f) * intensity;
		float yaw = entity.yBodyRot * Mth.DEG_TO_RAD;
		float fx = -Mth.sin(yaw), fz = Mth.cos(yaw);
		float fwd = stateDirX * fx + stateDirZ * fz;
		float right = stateDirX * -fz + stateDirZ * fx;
		// Body leans the way it is being pushed, arms windmill for balance.
		pose.rootPitch += fwd * 15f * k;
		pose.rootRoll += right * 13f * k;
		pose.local[Bone.BODY.ordinal()].rotateLocalX(-fwd * 14f * k * AnimPose.DEG);
		float wave = Mth.sin(time * 21f) * 22f * k;
		pose.rot(Bone.RIGHT_ARM, -35f * k + wave, 0, 55f * k + wave * 0.6f);
		pose.rot(Bone.LEFT_ARM, -30f * k - wave, 0, -55f * k + wave * 0.6f);
		pose.vanillaBase[Bone.RIGHT_ARM.ordinal()] = false;
		pose.vanillaBase[Bone.LEFT_ARM.ordinal()] = false;
	}

	private final float[] footLift = new float[2];
	private float pelvisDrop;

	/**
	 * Standing on uneven ground (stairs, slabs, slopes): drop the pelvis so the lower foot
	 * reaches the ground and shorten the other leg so it rests on its higher step. Fades out with
	 * speed (the gait handles moving feet).
	 */
	private void footPlacement(float dt) {
		if (!haveBones || rig == null || !entity.onGround()) {
			relaxFeet(dt);
			return;
		}
		float speed = Mth.sqrt((float) (vel.x * vel.x + vel.z * vel.z));
		float weight = 1f - Locomotion.smoothstep(0.3f, 1.2f, speed);
		if (weight <= 0.01f) {
			relaxFeet(dt);
			return;
		}
		double baseY = entity.getY();
		float legLen = rig.legLength / 16f * modelScale;
		float[] ground = new float[2];
		int[] legs = {Bone.RIGHT_LEG.ordinal(), Bone.LEFT_LEG.ordinal()};
		for (int i = 0; i < 2; i++) {
			Vector3f foot = new Vector3f(0, rig.legLength * modelScale / 16f, 0);
			boneRot[legs[i]].transform(foot);
			double fx = renderOrigin.x + bonePos[legs[i]].x + foot.x, fz = renderOrigin.z + bonePos[legs[i]].z + foot.z;
			net.minecraft.world.phys.Vec3 from = new net.minecraft.world.phys.Vec3(fx, baseY + 0.55, fz);
			net.minecraft.world.phys.Vec3 to = new net.minecraft.world.phys.Vec3(fx, baseY - 0.6, fz);
			var hit = entity.level().clip(new net.minecraft.world.level.ClipContext(from, to, net.minecraft.world.level.ClipContext.Block.COLLIDER,
				net.minecraft.world.level.ClipContext.Fluid.NONE, entity));
			ground[i] = hit.getType() == net.minecraft.world.phys.HitResult.Type.MISS ? -0.6f : (float) (hit.getLocation().y - baseY);
		}
		float drop = Math.max(-0.5f, Math.min(0f, Math.min(ground[0], ground[1])));
		float k = Math.min(1f, dt * 10f);
		pelvisDrop += (drop - pelvisDrop) * k;
		for (int i = 0; i < 2; i++) {
			float lift = Mth.clamp(ground[i] - drop, 0f, legLen * 0.55f);
			footLift[i] += (lift - footLift[i]) * k;
		}
		float px = 16f / Math.max(0.2f, modelScale);
		pose.rootY += pelvisDrop * weight;
		for (int i = 0; i < 2; i++) {
			if (footLift[i] < 0.01f) continue;
			// Shorten (retract) and bend the hip forward a little, like stepping up onto the block.
			pose.offset[legs[i]].y -= footLift[i] * px * 0.7f * weight;
			pose.local[legs[i]].rotateLocalX(-footLift[i] / legLen * 55f * AnimPose.DEG * weight);
		}
	}

	private void relaxFeet(float dt) {
		float k = Math.min(1f, dt * 8f);
		pelvisDrop -= pelvisDrop * k;
		footLift[0] -= footLift[0] * k;
		footLift[1] -= footLift[1] * k;
		if (Math.abs(pelvisDrop) > 0.005f) pose.rootY += pelvisDrop;
	}

	/** Staggering into a wall: put a hand out against it. */
	private void braceAgainstWall(float intensity) {
		double len = Math.sqrt(stateDirX * stateDirX + stateDirZ * stateDirZ);
		if (len < 0.1) return;
		var eye = entity.getEyePosition();
		var dir = new net.minecraft.world.phys.Vec3(stateDirX / len, 0, stateDirZ / len);
		var hit = entity.level().clip(new net.minecraft.world.level.ClipContext(eye.add(0, -0.4, 0), eye.add(0, -0.4, 0).add(dir.scale(1.4)),
			net.minecraft.world.level.ClipContext.Block.COLLIDER, net.minecraft.world.level.ClipContext.Fluid.NONE, entity));
		if (hit.getType() == net.minecraft.world.phys.HitResult.Type.MISS) return;
		float yaw = entity.yBodyRot * Mth.DEG_TO_RAD;
		float fx = -Mth.sin(yaw), fz = Mth.cos(yaw);
		float fwd = (float) (dir.x * fx + dir.z * fz), right = (float) (dir.x * -fz + dir.z * fx);
		Bone arm = right >= 0 ? Bone.RIGHT_ARM : Bone.LEFT_ARM;
		// Direction to the wall in model space (x left, y down, z back), slightly downward.
		Vector3f d = new Vector3f(-right, 0.25f, -fwd).normalize();
		Quaternionf target = new Quaternionf().rotationTo(0, 1, 0, d.x, d.y, d.z);
		Quaternionf local = new Quaternionf(pose.local[Bone.BODY.ordinal()]).conjugate().mul(target);
		float w = Math.min(1f, (float) (1.4 - hit.getLocation().distanceTo(eye.add(0, -0.4, 0))) * 1.5f) * intensity;
		pose.local[arm.ordinal()].slerp(local, Mth.clamp(w, 0, 1));
		pose.vanillaBase[arm.ordinal()] = false;
	}

	private void applyStateClip(HumanoidRenderState hs) {
		ClipState sc = stateClip;
		float progress = Mth.clamp(sc.time / Math.max(0.01f, sc.clip.length), 0, 1);
		for (int i = 0; i < Bone.COUNT; i++) {
			pose.vanilla[i] = 0;
			pose.vanillaBase[i] = false;
		}
		float hip = rig.legLength / 16f * modelScale;
		sc.applyTo(pose, 1f, true, hip / 0.75f, hip);
		pose.overrideRootYaw = true;
		if (phys == PhysState.CRAWLING) {
			pose.rootYawAbsolute = hs.bodyRot;
			pose.rootZ -= 0.9f * modelScale;
		} else {
			// Get-up: feet start where the body lay and walk back under the hitbox; facing turns to match.
			float settle = Locomotion.smoothstep(0.45f, 1f, progress);
			pose.rootX += getupOffset.x * (1 - settle);
			pose.rootZ += getupOffset.z * (1 - settle);
			float turn = Locomotion.smoothstep(0.6f, 1f, progress);
			pose.rootYawAbsolute = lieYaw + Mth.wrapDegrees(hs.bodyRot - lieYaw) * turn;
		}
	}

	private void applySprings(float intensity) {
		Vector3f r = rootSpring.value;
		pose.rootPitch += r.x;
		pose.rootYaw += r.y;
		pose.rootRoll += r.z;
		pose.local[Bone.BODY.ordinal()].rotateLocalZ(bodySpring.value.z * AnimPose.DEG).rotateLocalY(bodySpring.value.y * AnimPose.DEG)
			.rotateLocalX(bodySpring.value.x * AnimPose.DEG);
		addLocal(Bone.RIGHT_ARM, rightArmSpring.value);
		addLocal(Bone.LEFT_ARM, leftArmSpring.value);
		float comp = landSpring.value.x;
		if (comp != 0) {
			pose.rootY -= comp / 16f * 0.6f;
			pose.off(Bone.RIGHT_LEG).y -= comp * 0.6f;
			pose.off(Bone.LEFT_LEG).y -= comp * 0.6f;
			pose.local[Bone.BODY.ordinal()].rotateLocalX(comp * 1.6f * AnimPose.DEG);
		}
		Vector3f buckle = legBuckle.value;
		if (buckle.x != 0) {
			pose.off(Bone.RIGHT_LEG).y -= Math.max(0, buckle.x) * 0.04f;
			pose.local[Bone.RIGHT_LEG.ordinal()].rotateLocalX(-buckle.x * 0.3f * AnimPose.DEG);
		}
		if (buckle.y != 0) {
			pose.off(Bone.LEFT_LEG).y -= Math.max(0, buckle.y) * 0.04f;
			pose.local[Bone.LEFT_LEG.ordinal()].rotateLocalX(-buckle.y * 0.3f * AnimPose.DEG);
		}
	}

	private void addLocal(Bone bone, Vector3f eulerDeg) {
		if (eulerDeg.lengthSquared() < 1e-4f) return;
		Quaternionf add = new Quaternionf().rotationZYX(eulerDeg.z * AnimPose.DEG, eulerDeg.y * AnimPose.DEG, eulerDeg.x * AnimPose.DEG);
		if (pose.vanilla[bone.ordinal()] >= 1f) {
			pose.vanilla[bone.ordinal()] = 0.6f;
		}
		pose.local[bone.ordinal()].premul(add);
	}

	/** Head keeps the look direction mostly level while the torso bends beneath it. */
	private void headLook(HumanoidRenderState hs) {
		int h = Bone.HEAD.ordinal();
		boolean clipHead = action != null && action.clip.animates(h) || stateClip != null && stateClip.clip.animates(h);
		Quaternionf clipRot = new Quaternionf(pose.local[h]);
		Quaternionf look = new Quaternionf().rotationZYX(0, hs.yRot * AnimPose.DEG, hs.xRot * AnimPose.DEG);
		Quaternionf counter = new Quaternionf(pose.local[Bone.BODY.ordinal()]).conjugate();
		counter.slerp(new Quaternionf(), 0.3f);
		Quaternionf head = counter.mul(look);
		if (clipHead) head.slerp(clipRot, 0.75f);
		Vector3f s = headSpring.value;
		head.mul(new Quaternionf().rotationZYX(s.z * AnimPose.DEG, s.y * AnimPose.DEG, (s.x + loco.headBob) * AnimPose.DEG));
		pose.local[h].set(head);
		pose.vanilla[h] = 0;
	}

	private void fillFromRagdoll() {
		HumanoidRagdoll r = ragdoll;
		Vector3d p = new Vector3d();
		Quaterniond q = new Quaterniond();
		for (int i = 0; i < Bone.COUNT; i++) {
			r.bonePivot(i, ragdollAlpha, p, q);
			pose.worldPos[i].set((float) (p.x - renderOrigin.x), (float) (p.y - renderOrigin.y), (float) (p.z - renderOrigin.z));
			pose.worldRot[i].set((float) q.x, (float) q.y, (float) q.z, (float) q.w);
		}
	}

	private void blendSnapshot() {
		float w = snapBlend * snapBlend * (3 - 2 * snapBlend);
		if (w <= 0) return;
		pose.worldWeight = w;
		for (int i = 0; i < Bone.COUNT; i++) {
			pose.worldPos[i].set(snapPos[i]);
			pose.worldRot[i].set(snapRot[i]);
		}
	}

	@Override
	public void acceptBoneTransforms(Vector3f[] pivots, Quaternionf[] rotations, float scale) {
		for (int i = 0; i < Bone.COUNT; i++) {
			bonePos[i].set(pivots[i]);
			boneRot[i].set(rotations[i]);
		}
		modelScale = scale;
		haveBones = true;
		boneFrameTime = System.nanoTime();
	}

	/** World position of a bone's pivot from the last rendered frame. */
	public Vector3d boneWorld(int bone, Vector3d out) {
		return out.set(renderOrigin).add(bonePos[bone].x, bonePos[bone].y, bonePos[bone].z);
	}

	public void onRemoved() {
		// Ragdoll ownership moves to the corpse manager when applicable; otherwise free it.
		if (!dead) dropRagdoll();
	}
}
