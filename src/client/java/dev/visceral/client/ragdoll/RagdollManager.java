package dev.visceral.client.ragdoll;

import dev.visceral.Visceral;
import dev.visceral.VisceralConfig;
import dev.visceral.client.fx.BloodDecals;
import dev.visceral.network.HitFxPayload;
import dev.visceral.registry.VisceralAttachments;
import dev.visceral.wound.Wound;
import dev.visceral.wound.WoundData;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.state.LevelRenderState;
import net.minecraft.core.Direction;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;

/** Owns every ragdoll on the client: spawning on death, simulation, corpses and cleanup. */
public final class RagdollManager {
	private static final RagdollManager INSTANCE = new RagdollManager();

	private final Int2ObjectMap<Ragdoll> byEntity = new Int2ObjectOpenHashMap<>();
	private final List<Ragdoll> ragdolls = new ArrayList<>();
	private final Int2ObjectMap<RecentHit> recentHits = new Int2ObjectOpenHashMap<>();
	private long ticks;
	private boolean warned;

	/** The last blow an entity received: where the ragdoll gets pushed when it dies. */
	public record RecentHit(Vec3 point, Vec3 direction, float damage, boolean explosion, long tick) {
	}

	private RagdollManager() {
	}

	public static RagdollManager get() {
		return INSTANCE;
	}

	public int count() {
		return this.ragdolls.size();
	}

	public int simulatingCount() {
		int count = 0;
		for (Ragdoll ragdoll : this.ragdolls) {
			if (ragdoll.isBuilt() && !ragdoll.isSleeping()) {
				count++;
			}
		}
		return count;
	}

	public List<Ragdoll> all() {
		return this.ragdolls;
	}

	public void clear() {
		this.byEntity.clear();
		this.ragdolls.clear();
		this.recentHits.clear();
	}

	public void recordHit(HitFxPayload payload) {
		this.recentHits.put(payload.entityId(), new RecentHit(payload.point(), payload.direction(), payload.damage(), payload.has(HitFxPayload.EXPLOSION), this.ticks));
	}

	/** Ragdoll driving this entity, or null. */
	public Ragdoll get(Entity entity) {
		Ragdoll ragdoll = this.byEntity.get(entity.getId());
		return ragdoll != null && ragdoll.entity == entity && !ragdoll.isFailed() ? ragdoll : null;
	}

	public Iterable<LivingEntity> corpseEntities() {
		List<LivingEntity> list = new ArrayList<>();
		for (Ragdoll ragdoll : this.ragdolls) {
			if (ragdoll.isBuilt() && ragdoll.isCorpse()) {
				list.add(ragdoll.entity);
			}
		}
		return list;
	}

	// ------------------------------------------------------------------ ticking

	public void tick(ClientLevel level) {
		this.ticks++;
		VisceralConfig config = VisceralConfig.get();
		if (config.ragdolls) {
			for (Entity entity : level.entitiesForRendering()) {
				if (entity instanceof LivingEntity living && living.isDeadOrDying() && !this.byEntity.containsKey(entity.getId()) && this.eligible(living, config)) {
					this.start(living);
				}
			}
		}

		int lifetime = config.ragdollLifetimeSeconds * 20;
		Iterator<Ragdoll> iterator = this.ragdolls.iterator();
		while (iterator.hasNext()) {
			Ragdoll ragdoll = iterator.next();
			boolean remove;
			if (ragdoll.isFailed()) {
				remove = true;
			} else if (!ragdoll.isBuilt()) {
				remove = ragdoll.entity.isRemoved() || !ragdoll.tickPending();
			} else {
				try {
					ragdoll.tick(level, config, lifetime);
				} catch (RuntimeException e) {
					this.warn("simulating", e);
					ragdoll.markFailed();
				}
				this.feedPool(level, ragdoll, config);
				remove = ragdoll.isFinished(lifetime) || ragdoll.isFailed();
			}
			if (remove) {
				iterator.remove();
				if (this.byEntity.get(ragdoll.entityId) == ragdoll) {
					this.byEntity.remove(ragdoll.entityId);
				}
			}
		}

		while (this.ragdolls.size() > config.maxRagdolls) {
			Ragdoll oldest = this.ragdolls.removeFirst();
			if (this.byEntity.get(oldest.entityId) == oldest) {
				this.byEntity.remove(oldest.entityId);
			}
		}

		if (config.ragdollEntityPushing) {
			this.pushByEntities(level);
		}
		this.recentHits.int2ObjectEntrySet().removeIf(entry -> this.ticks - entry.getValue().tick() > 40);
	}

	private boolean eligible(LivingEntity entity, VisceralConfig config) {
		if (entity instanceof ArmorStand || entity instanceof Player && !config.ragdollPlayers) {
			return false;
		}
		EntityRenderDispatcher dispatcher = Minecraft.getInstance().getEntityRenderDispatcher();
		return dispatcher.getRenderer(entity) instanceof LivingEntityRenderer<?, ?, ?>;
	}

	private void start(LivingEntity entity) {
		RecentHit hit = this.recentHits.get(entity.getId());
		Ragdoll ragdoll = new Ragdoll(entity, this.ticks, hit != null && this.ticks - hit.tick() < 20 ? hit : null);
		this.byEntity.put(entity.getId(), ragdoll);
		this.ragdolls.add(ragdoll);
	}

	/** Corpses keep bleeding into a growing pool beneath them. */
	private void feedPool(ClientLevel level, Ragdoll ragdoll, VisceralConfig config) {
		if (!config.bloodPools || !ragdoll.blood.stains() || ragdoll.age() < 12 || ragdoll.age() % 8 != 0 || ragdoll.age() > 900) {
			return;
		}
		WoundData wounds = ragdoll.entity.getAttached(VisceralAttachments.WOUNDS);
		if (wounds == null) {
			return;
		}
		int bleeding = 0;
		float severity = 0.0F;
		for (Wound wound : wounds.wounds()) {
			if (wound.type().bleeds() && ragdoll.entity.level().getGameTime() - wound.time() < 20 * 120) {
				bleeding++;
				severity += wound.severity();
			}
		}
		if (bleeding == 0 || ragdoll.torsoSpeed() > 0.6) {
			return;
		}
		Vec3 torso = ragdoll.torsoPosition();
		BlockHitResult hit = level.clip(new ClipContext(torso.add(0, 0.3, 0), torso.add(0, -2.0, 0), ClipContext.Block.COLLIDER, ClipContext.Fluid.ANY, CollisionContext.empty()));
		if (hit.getType() != HitResult.Type.BLOCK || hit.getDirection() != Direction.UP || !level.getFluidState(hit.getBlockPos()).isEmpty()) {
			return;
		}
		float size = (float) Math.sqrt(ragdoll.entity.getBbWidth() * ragdoll.entity.getBbWidth() * ragdoll.entity.getBbHeight());
		float maxRadius = Mth.clamp(0.35F + size * 0.55F, 0.3F, 1.7F) * Mth.clamp(0.45F + severity * 0.25F, 0.45F, 1.0F);
		float growth = 0.035F * Mth.clamp(severity, 0.4F, 2.0F) / (1.0F + ragdoll.poolFeeds() * 0.04F);
		BloodDecals.feedPool(level, hit.getLocation(), ragdoll.blood, growth, maxRadius);
		ragdoll.addPoolFeed();
	}

	private void pushByEntities(ClientLevel level) {
		for (Ragdoll ragdoll : this.ragdolls) {
			if (!ragdoll.isBuilt() || ragdoll.age() < 10) {
				continue;
			}
			for (Entity other : level.getEntities(ragdoll.entity, ragdoll.bounds(), entity -> entity instanceof LivingEntity && entity.isAlive())) {
				Vec3 motion = other.position().subtract(other.xo, other.yo, other.zo);
				if (motion.horizontalDistanceSqr() < 1.0E-4) {
					continue;
				}
				ragdoll.shove(other.position().add(0, other.getBbHeight() * 0.25, 0), other.getBbWidth() * 0.6, motion.scale(20.0));
			}
		}
	}

	public void onExplosion(Vec3 center, float radius) {
		double reach = Math.max(2.0, radius * 2.0);
		for (Ragdoll ragdoll : this.ragdolls) {
			if (ragdoll.isBuilt() && ragdoll.bounds().getCenter().distanceTo(center) < reach + 2.0) {
				ragdoll.push(center, Mth.clamp(radius * 3.5, 4.0, 22.0) * VisceralConfig.get().ragdollImpulseScale, reach, true);
			}
		}
	}

	// ------------------------------------------------------------------ rendering hooks

	/** Builds a pending ragdoll from the model pose vanilla is about to draw. */
	public void build(Ragdoll ragdoll, net.minecraft.client.model.Model<?> model, org.joml.Matrix4f modelPose) {
		if (ragdoll.isBuilt() || ragdoll.isFailed()) {
			return;
		}
		try {
			Vec3 camera = Minecraft.getInstance().gameRenderer.getMainCamera().position();
			if (!RagdollBuilder.build(ragdoll, model, modelPose, camera)) {
				ragdoll.markFailed();
			}
		} catch (RuntimeException e) {
			this.warn("building", e);
			ragdoll.markFailed();
		}
	}

	/** Adds render states for corpses whose entity has already been removed from the world. */
	public void extractCorpses(Camera camera, Frustum frustum, float partialTick, LevelRenderState state, EntityRenderDispatcher dispatcher) {
		ClientLevel level = Minecraft.getInstance().level;
		if (level == null) {
			return;
		}
		for (Ragdoll ragdoll : this.ragdolls) {
			if (!ragdoll.isBuilt() || ragdoll.isFailed()) {
				continue;
			}
			boolean detached = ragdoll.entity.isRemoved() || level.getEntity(ragdoll.entityId) != ragdoll.entity;
			if (!detached || (ragdoll.entity == camera.entity() && !camera.isDetached())) {
				continue;
			}
			if (!frustum.isVisible(ragdoll.bounds())) {
				continue;
			}
			try {
				EntityRenderState renderState = dispatcher.extractEntity(ragdoll.entity, partialTick);
				state.entityRenderStates.add(renderState);
			} catch (RuntimeException e) {
				this.warn("extracting a corpse", e);
				ragdoll.markFailed();
			}
		}
	}

	void warn(String what, Throwable throwable) {
		if (!this.warned) {
			this.warned = true;
			Visceral.LOGGER.error("Ragdoll failed while {}; affected ragdolls fall back to vanilla", what, throwable);
		}
	}
}
