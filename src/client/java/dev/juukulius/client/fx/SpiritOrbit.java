package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.animation.JuliusAnim;
import dev.juukulius.character.JuliusAppearance;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.client.anim.AnimatorManager;
import dev.juukulius.client.anim.ClientClock;
import dev.juukulius.client.anim.Playback;
import dev.juukulius.client.anim.PlayerAnimator;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.particle.ParticleDensity;
import dev.juukulius.registry.JuliusParticles;
import dev.juukulius.spirit.Spirit;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;
import org.joml.Vector3f;

/**
 * Julius's six spirits as small living lights: they orbit him with gentle bobbing, the selected spirit waits by his
 * casting hand, they flare during swordplay, gather on the blade while Al Clarista charges, dart to the hand when an art
 * is cast, spiral fast and tight during Al Cranvel, and emerge from / return to his chest when summoned or dismissed.
 * Positions follow their targets through critically damped springs, so movement drags them naturally.
 */
public final class SpiritOrbit {
	private static final Int2ObjectMap<Formation> FORMATIONS = new Int2ObjectOpenHashMap<>();
	private static final int TRAIL_POINTS = 10;

	private SpiritOrbit() {
	}

	public static @Nullable Formation formation(int entityId) {
		return FORMATIONS.get(entityId);
	}

	// ------------------------------------------------------------------------------------------------ tick

	public static void tick(ClientLevel level) {
		RandomSource random = level.getRandom();
		long gameTime = level.getGameTime();
		for (AbstractClientPlayer player : level.players()) {
			JuliusAppearance appearance = JuliusAttachments.appearance(player);
			float visibility = visibility(appearance, gameTime, 0.0F);
			Formation formation = FORMATIONS.get(player.getId());
			if (visibility <= 0.0F || formation == null) {
				continue;
			}

			boolean ultimate = appearance.ultimateActive(gameTime);
			for (Spirit spirit : Spirit.values()) {
				Vector3f p = formation.position[spirit.ordinal()];
				if (random.nextFloat() < 0.32F * visibility) {
					emit(level, random, spirit, p.x, p.y, p.z, ultimate);
				}
			}
		}

		FORMATIONS.int2ObjectEntrySet().removeIf(entry -> {
			Entity entity = level.getEntity(entry.getIntKey());
			return !(entity instanceof AbstractClientPlayer player) || visibility(JuliusAttachments.appearance(player), gameTime, 0.0F) <= 0.0F;
		});
	}

	private static void emit(ClientLevel level, RandomSource random, Spirit spirit, double x, double y, double z, boolean ultimate) {
		if (ParticleDensity.scale(1, random) == 0) {
			return;
		}

		ParticleOptions options = switch (spirit.element) {
			case FIRE -> JuliusParticles.of(JuliusParticles.EMBER, spirit.accent, 0.7F);
			case WATER -> JuliusParticles.of(JuliusParticles.DROPLET, spirit.color, 0.6F);
			case WIND -> JuliusParticles.of(JuliusParticles.LEAF, spirit.color, 0.7F);
			case EARTH -> JuliusParticles.of(JuliusParticles.GLOW_SPARK, spirit.color, 0.6F);
			case YANG -> JuliusParticles.of(JuliusParticles.LIGHT_MOTE, spirit.accent, 0.7F);
			case YIN -> JuliusParticles.of(JuliusParticles.SHADOW_WISP, spirit.accent, 0.6F);
		};
		if (ultimate && random.nextBoolean()) {
			options = JuliusParticles.of(JuliusParticles.RAINBOW_SPARK, 0xFFFFFF, 0.8F);
		}

		level.addParticle(options, x, y, z, (random.nextDouble() - 0.5) * 0.02, 0.01, (random.nextDouble() - 0.5) * 0.02);
	}

	/** 0 (hidden) → 1 (fully manifested), including emerge/return transitions. */
	public static float visibility(JuliusAppearance appearance, long gameTime, float partialTick) {
		float now = gameTime + partialTick;
		if (appearance.transformed() && appearance.spiritsOut()) {
			long since = Math.max(appearance.spiritsTime(), appearance.changeTime());
			return Mth.clamp((now - since - 2.0F) / 16.0F, 0.0F, 1.0F);
		}

		long since = Math.max(appearance.spiritsTime(), appearance.changeTime());
		return Mth.clamp(1.0F - (now - since) / 12.0F, 0.0F, 1.0F);
	}

	// ------------------------------------------------------------------------------------------------ render

	public static void render(FxContext context, ClientLevel level) {
		Minecraft minecraft = Minecraft.getInstance();
		long gameTime = level.getGameTime();
		for (AbstractClientPlayer player : level.players()) {
			JuliusAppearance appearance = JuliusAttachments.appearance(player);
			float visibility = visibility(appearance, gameTime, context.partialTick);
			if (visibility <= 0.0F || player.isInvisible() && player != minecraft.player) {
				continue;
			}

			Formation formation = FORMATIONS.computeIfAbsent(player.getId(), id -> new Formation());
			boolean firstPerson = player == minecraft.player && minecraft.options.getCameraType().isFirstPerson();
			formation.update(player, appearance, gameTime, context.partialTick, context.time, visibility, firstPerson);
			formation.render(context, player, appearance, gameTime, visibility, firstPerson);
		}
	}

	public static void clear() {
		FORMATIONS.clear();
	}

	/** The six spirits around one player. */
	public static final class Formation {
		public final Vector3f[] position = new Vector3f[Spirit.COUNT];
		private final Vector3f[] velocity = new Vector3f[Spirit.COUNT];
		private final Vector3f[][] trail = new Vector3f[Spirit.COUNT][TRAIL_POINTS];
		private final float[] pulse = new float[Spirit.COUNT];
		private int trailHead;
		private float lastTime = Float.NaN;
		private float trailClock;
		private boolean initialized;
		private Vec3 look = new Vec3(0.0, 0.0, 1.0);

		Formation() {
			for (int i = 0; i < Spirit.COUNT; i++) {
				this.position[i] = new Vector3f();
				this.velocity[i] = new Vector3f();
				for (int j = 0; j < TRAIL_POINTS; j++) {
					this.trail[i][j] = new Vector3f();
				}
			}
		}

		void update(AbstractClientPlayer player, JuliusAppearance appearance, long gameTime, float partialTick, float time, float visibility,
			boolean firstPerson) {
			float dt = Float.isNaN(this.lastTime) ? 0.016F : Mth.clamp(time - this.lastTime, 0.0F, 0.08F);
			this.lastTime = time;
			Vec3 feet = player.getPosition(partialTick);
			float scale = player.getScale();
			Vec3 chest = feet.add(0.0, 1.15 * scale, 0.0);
			float yaw = Mth.rotLerp(partialTick, player.yBodyRotO, player.yBodyRot) * Mth.DEG_TO_RAD;
			Vec3 forward = new Vec3(-Mth.sin(yaw), 0.0, Mth.cos(yaw));
			Vec3 left = new Vec3(Mth.cos(yaw), 0.0, Mth.sin(yaw));
			Vec3 look = player.getViewVector(partialTick);
			this.look = look;
			boolean ultimate = appearance.ultimateActive(gameTime);
			PlayerAnimator animator = AnimatorManager.peek(player.getId());
			Playback action = animator != null ? animator.current() : null;
			float now = ClientClock.seconds(partialTick);
			float actionTime = action != null ? action.rawTime(now) : 10.0F;
			JuliusAnim actionId = action != null ? action.id : null;
			float charge = animator != null ? animator.chargeProgress : 0.0F;

			float orbitSpeed = ultimate ? 2.6F : 0.9F;
			float radius = (ultimate ? 0.82F : 1.0F) * scale * (firstPerson ? 1.35F : 1.0F);
			float flare = 0.0F;
			if (actionId != null && actionId.isSlash() && actionTime < 0.45F) {
				flare = 0.28F * Mth.sin(actionTime / 0.45F * Mth.PI);
			}

			radius += flare;
			float emerge = easeOutBack(visibility);
			Vec3 handPoint = player.getEyePosition(partialTick).add(look.scale(0.75)).add(left.scale(0.32)).add(0.0, -0.32, 0.0);
			Vec3 blade = BladeTrails.bladeCenter(player.getId(), chest.add(forward.scale(0.6)));
			int selected = appearance.selectedSpirit();

			for (Spirit spirit : Spirit.values()) {
				int i = spirit.ordinal();
				float angle = time * orbitSpeed + i * Mth.TWO_PI / Spirit.COUNT;
				float bob = Mth.sin(time * 2.1F + i * 1.3F) * 0.12F + Mth.sin(angle) * 0.18F;
				Vec3 target = chest.add(Mth.cos(angle) * radius, bob, Mth.sin(angle) * radius);

				if (i == selected && !ultimate) {
					Vec3 perch = chest.add(left.scale(0.55 * scale)).add(0.0, 0.5 * scale, 0.0).add(forward.scale(0.12));
					if (firstPerson) {
						perch = player.getEyePosition(partialTick).add(look.scale(1.1)).add(left.scale(0.65)).add(0.0, 0.25, 0.0);
					}

					target = lerp(target, perch, 0.82F);
				}

				if (actionId != null && i == selected && isCast(actionId) && actionTime < 0.5F) {
					float dart = Mth.sin(Mth.clamp(actionTime / 0.5F, 0.0F, 1.0F) * Mth.PI);
					target = lerp(target, handPoint, dart);
					this.pulse[i] = Math.max(this.pulse[i], dart);
				}

				if (charge > 0.0F) {
					Vec3 onBlade = blade.add(Mth.cos(angle * 3.0F) * 0.18, (i - 2.5) * 0.1, Mth.sin(angle * 3.0F) * 0.18);
					target = lerp(target, onBlade, (float) Math.pow(charge, 0.7));
				}

				if (actionId == JuliusAnim.AL_CLAUZERIA && actionTime < 0.9F) {
					float gather = Mth.clamp(actionTime / 0.7F, 0.0F, 1.0F);
					float spin = time * 9.0F + i * Mth.TWO_PI / Spirit.COUNT;
					Vec3 spiral = chest.add(Mth.cos(spin) * (1.1 - gather * 0.6), gather * 0.6, Mth.sin(spin) * (1.1 - gather * 0.6));
					target = lerp(spiral, blade, gather * gather);
				} else if (actionId == JuliusAnim.CRANVEL_ACTIVATE && actionTime < 1.0F) {
					float rise = Mth.clamp(actionTime / 0.9F, 0.0F, 1.0F);
					float spin = time * 12.0F + i * Mth.TWO_PI / Spirit.COUNT;
					Vec3 crown = feet.add(Mth.cos(spin) * (1.3 - rise * 0.9), 0.4 + rise * 2.0, Mth.sin(spin) * (1.3 - rise * 0.9));
					target = crown;
				}

				target = lerp(chest, target, emerge);
				Vector3f p = this.position[i];
				Vector3f v = this.velocity[i];
				if (!this.initialized) {
					p.set((float) target.x, (float) target.y, (float) target.z);
					v.zero();
					for (Vector3f t : this.trail[i]) {
						t.set(p);
					}
				} else {
					float stiffness = ultimate ? 160.0F : 95.0F;
					float damping = 2.0F * Mth.sqrt(stiffness) * 0.9F;
					v.x += ((float) target.x - p.x) * stiffness * dt - v.x * damping * dt;
					v.y += ((float) target.y - p.y) * stiffness * dt - v.y * damping * dt;
					v.z += ((float) target.z - p.z) * stiffness * dt - v.z * damping * dt;
					p.add(v.x * dt, v.y * dt, v.z * dt);
				}

				this.pulse[i] = Math.max(0.0F, this.pulse[i] - dt * 2.5F);
			}

			this.initialized = true;
			this.trailClock += dt;
			if (this.trailClock >= 0.025F) {
				this.trailClock = 0.0F;
				this.trailHead = (this.trailHead + 1) % TRAIL_POINTS;
				for (int i = 0; i < Spirit.COUNT; i++) {
					this.trail[i][this.trailHead].set(this.position[i]);
				}
			}
		}

		void render(FxContext context, AbstractClientPlayer player, JuliusAppearance appearance, long gameTime, float visibility, boolean firstPerson) {
			float time = context.time;
			boolean ultimate = appearance.ultimateActive(gameTime);
			int selected = appearance.selectedSpirit();
			Vec3 eye = context.camera;
			// Trails are ribbons whose width runs across u, so they use the beam profile (bright centre line).
			VertexConsumer trailGlow = context.glow(JuliusTextures.BEAM);
			for (Spirit spirit : Spirit.values()) {
				int i = spirit.ordinal();
				float alpha = this.alpha(i, visibility, eye, firstPerson);
				if (alpha <= 0.01F) {
					continue;
				}

				int color = ultimate ? FxDraw.rainbow(time * 0.5F + i / 6.0F) : spirit.color;
				float trailAlpha = alpha * (ultimate ? 0.9F : 0.55F) * (firstPerson ? 0.45F : 1.0F);
				this.renderTrail(context, trailGlow, i, color, trailAlpha, (ultimate ? 0.09F : 0.055F) * (firstPerson ? 0.7F : 1.0F));
			}

			// Separate passes per texture: the shared buffer only holds one render type at a time.
			VertexConsumer glow = context.glow(JuliusTextures.GLOW);
			for (Spirit spirit : Spirit.values()) {
				int i = spirit.ordinal();
				float alpha = this.alpha(i, visibility, eye, firstPerson);
				if (alpha <= 0.01F) {
					continue;
				}

				Vector3f p = this.position[i];
				Vector3f rel = context.rel(p.x, p.y, p.z);
				boolean isSelected = i == selected;
				float breathe = 0.88F + 0.12F * Mth.sin(time * 3.2F + i * 1.7F);
				float size = (isSelected ? 0.4F : 0.3F) * breathe * (1.0F + this.pulse[i] * 0.6F) * (ultimate ? 1.15F : 1.0F) * (firstPerson ? 0.6F : 1.0F);
				int haloColor = ultimate ? FxDraw.lerpRgb(0.5F, spirit.color, FxDraw.rainbow(time * 0.5F + i / 6.0F)) : spirit.color;
				FxDraw.billboard(glow, context.matrix, context.cameraRotation, rel.x, rel.y, rel.z, size, 0.0F,
					FxDraw.argb(alpha * (isSelected ? 0.75F : 0.55F), haloColor));
			}

			VertexConsumer core = context.glow(JuliusTextures.SPIRIT_CORE);
			for (Spirit spirit : Spirit.values()) {
				int i = spirit.ordinal();
				float alpha = this.alpha(i, visibility, eye, firstPerson);
				if (alpha <= 0.01F) {
					continue;
				}

				Vector3f p = this.position[i];
				Vector3f rel = context.rel(p.x, p.y, p.z);
				float breathe = 0.88F + 0.12F * Mth.sin(time * 3.2F + i * 1.7F);
				float size = (i == selected ? 0.4F : 0.3F) * breathe * (1.0F + this.pulse[i] * 0.6F) * (ultimate ? 1.15F : 1.0F) * (firstPerson ? 0.6F : 1.0F);
				int coreColor = spirit.element == Spirit.Element.YIN ? FxDraw.lerpRgb(0.4F, spirit.color, 0xFFFFFF) : FxDraw.lerpRgb(0.55F, spirit.accent, 0xFFFFFF);
				FxDraw.billboard(core, context.matrix, context.cameraRotation, rel.x, rel.y, rel.z, size * 0.36F, time * 1.5F, FxDraw.argb(alpha, coreColor));
			}

			for (Spirit spirit : Spirit.values()) {
				int i = spirit.ordinal();
				float alpha = this.alpha(i, visibility, eye, firstPerson);
				if (alpha <= 0.01F) {
					continue;
				}

				Vector3f p = this.position[i];
				Vector3f rel = context.rel(p.x, p.y, p.z);
				float spin = time * (0.9F + i * 0.1F) + i;
				float size = (i == selected ? 0.2F : 0.15F) * (firstPerson ? 0.6F : 1.0F);
				if (spirit.element == Spirit.Element.YIN) {
					VertexConsumer veil = context.veil(JuliusTextures.SPIRIT_GLYPHS[i]);
					FxDraw.billboard(veil, context.matrix, context.cameraRotation, rel.x, rel.y, rel.z, size, spin, FxDraw.argb(alpha * 0.9F, spirit.accent));
				}

				VertexConsumer glyph = context.glow(JuliusTextures.SPIRIT_GLYPHS[i]);
				FxDraw.billboard(glyph, context.matrix, context.cameraRotation, rel.x, rel.y, rel.z, size, spin, FxDraw.argb(alpha * 0.9F, spirit.color));
			}
		}

		private float alpha(int spirit, float visibility, Vec3 eye, boolean firstPerson) {
			if (!firstPerson) {
				return visibility;
			}

			double distance = Math.sqrt(this.position[spirit].distanceSquared((float) eye.x, (float) eye.y, (float) eye.z));
			float near = Mth.clamp((float) (distance - 0.45) / 0.5F, 0.0F, 1.0F);
			// Spirits crossing the middle of the view fade out so they never block the aim (the selected spirit's perch
			// at the edge of the view stays clear).
			Vector3f toSpirit = new Vector3f(this.position[spirit]).sub((float) eye.x, (float) eye.y, (float) eye.z).normalize();
			float facing = toSpirit.dot((float) this.look.x, (float) this.look.y, (float) this.look.z);
			float centre = Mth.clamp((facing - 0.8F) / 0.15F, 0.0F, 1.0F);
			return visibility * near * (1.0F - centre * 0.8F);
		}

		private void renderTrail(FxContext context, VertexConsumer consumer, int spirit, int color, float alpha, float width) {
			Vector3f toCamera = new Vector3f();
			Vector3f previousSide = null;
			Vector3f previousPoint = null;
			for (int k = 0; k < TRAIL_POINTS; k++) {
				int index = Math.floorMod(this.trailHead - k, TRAIL_POINTS);
				Vector3f point = k == 0 ? this.position[spirit] : this.trail[spirit][index];
				Vector3f rel = context.rel(point.x, point.y, point.z);
				Vector3f next = k + 1 < TRAIL_POINTS ? this.trail[spirit][Math.floorMod(this.trailHead - k - 1, TRAIL_POINTS)] : point;
				Vector3f direction = new Vector3f(point).sub(next);
				if (direction.lengthSquared() < 1.0E-6F) {
					direction.set(0.0F, 1.0E-3F, 0.0F);
				}

				toCamera.set(rel).negate();
				float fade = 1.0F - k / (float) TRAIL_POINTS;
				Vector3f side = new Vector3f(direction).cross(toCamera).normalize().mul(width * fade);
				if (!Float.isFinite(side.x)) {
					side.set(0.0F, width * fade, 0.0F);
				}

				if (previousSide != null) {
					int colorA = FxDraw.argb(alpha * (fade + 1.0F / TRAIL_POINTS), color);
					int colorB = FxDraw.argb(alpha * fade, color);
					FxDraw.gradientQuad(consumer, context.matrix,
						new Vector3f(previousPoint).sub(previousSide), new Vector3f(previousPoint).add(previousSide),
						new Vector3f(rel).add(side), new Vector3f(rel).sub(side), 0.0F, 0.0F, 1.0F, 1.0F, colorA, colorB);
				}

				previousSide = side;
				previousPoint = rel;
			}
		}
	}

	private static boolean isCast(JuliusAnim animation) {
		return animation == JuliusAnim.CAST_FORWARD || animation == JuliusAnim.CAST_SELF || animation == JuliusAnim.CAST_GROUND
			|| animation == JuliusAnim.CAST_SWEEP || animation == JuliusAnim.UL_GORA || animation == JuliusAnim.SPIRIT_SELECT;
	}

	private static Vec3 lerp(Vec3 from, Vec3 to, float t) {
		return from.lerp(to, t);
	}

	private static float easeOutBack(float t) {
		if (t >= 1.0F) {
			return 1.0F;
		}

		float c1 = 1.5F;
		float f = t - 1.0F;
		return Math.max(0.0F, 1.0F + (c1 + 1.0F) * f * f * f + c1 * f * f);
	}
}
