package com.jjkshowdown.domain;

import com.jjkshowdown.combat.TechniqueDamage;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.ParticleDensity;
import com.jjkshowdown.util.Targeting;
import com.jjkshowdown.world.Destruction;
import com.jjkshowdown.world.TerrainJournal;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.List;
import java.util.UUID;

/**
 * The core of an active domain expansion. Owns the arena transformation, applies the sure-hit effect, takes part in
 * clashes and, when it collapses, restores the terrain and burns out its caster's technique.
 */
public class DomainEntity extends Entity {
	public static final int PHASE_FORMING = 0, PHASE_ACTIVE = 1, PHASE_CLASH = 2, PHASE_COLLAPSING = 3;
	public static final int COLLAPSE_TICKS = 24;

	private static final EntityDataAccessor<Integer> TYPE = SynchedEntityData.defineId(DomainEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Integer> OWNER = SynchedEntityData.defineId(DomainEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Float> RADIUS = SynchedEntityData.defineId(DomainEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Integer> PHASE = SynchedEntityData.defineId(DomainEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Long> PHASE_START = SynchedEntityData.defineId(DomainEntity.class, EntityDataSerializers.LONG);
	private static final EntityDataAccessor<Integer> FORM_TICKS = SynchedEntityData.defineId(DomainEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Float> INTEGRITY = SynchedEntityData.defineId(DomainEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Integer> CLASH_WITH = SynchedEntityData.defineId(DomainEntity.class, EntityDataSerializers.INT);

	private UUID ownerUuid;
	private int duration = 400;
	private int activeTicks;
	private List<DomainArena.Change> plan;
	private int planIndex;
	private boolean finalized;
	private boolean lostClash;
	private boolean wonClash;
	private int clashBonusTicks;

	public DomainEntity(EntityType<? extends DomainEntity> type, Level level) {
		super(type, level);
		this.noPhysics = true;
		this.setNoGravity(true);
	}

	public static DomainEntity create(ServerLevel level, LivingEntity owner, DomainType type, int formTicks) {
		DomainEntity d = new DomainEntity(ModEntities.DOMAIN, level);
		BlockPos feet = owner.blockPosition();
		d.setPos(feet.getX() + 0.5, feet.getY(), feet.getZ() + 0.5);
		d.ownerUuid = owner.getUUID();
		d.entityData.set(TYPE, type.ordinal());
		d.entityData.set(OWNER, owner.getId());
		d.entityData.set(RADIUS, type.radius());
		d.entityData.set(FORM_TICKS, Math.max(1, formTicks));
		d.entityData.set(PHASE, PHASE_FORMING);
		d.entityData.set(PHASE_START, level.getGameTime());
		d.duration = JjkConfig.get().domains.durationTicks;
		if (JjkConfig.get().domains.transformTerrain) {
			d.plan = type == DomainType.UNLIMITED_VOID
					? DomainArena.unlimitedVoid(level, feet, (int) type.radius(), owner)
					: DomainArena.malevolentShrine(level, feet, owner.getDirection(), owner);
		} else {
			d.plan = List.of();
		}
		return d;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		builder.define(TYPE, 0);
		builder.define(OWNER, -1);
		builder.define(RADIUS, 16f);
		builder.define(PHASE, PHASE_FORMING);
		builder.define(PHASE_START, 0L);
		builder.define(FORM_TICKS, 40);
		builder.define(INTEGRITY, 1f);
		builder.define(CLASH_WITH, -1);
	}

	// ------------------------------------------------------------------------------------------------ accessors

	public DomainType domainType() {
		return DomainType.byOrdinal(entityData.get(TYPE));
	}

	public float radius() {
		return entityData.get(RADIUS);
	}

	public int phase() {
		return entityData.get(PHASE);
	}

	public long phaseStart() {
		return entityData.get(PHASE_START);
	}

	public int formTicks() {
		return entityData.get(FORM_TICKS);
	}

	public float integrity() {
		return entityData.get(INTEGRITY);
	}

	public void setIntegrity(float v) {
		entityData.set(INTEGRITY, Math.max(0, Math.min(1, v)));
	}

	public int clashWith() {
		return entityData.get(CLASH_WITH);
	}

	public int ownerId() {
		return entityData.get(OWNER);
	}

	public UUID ownerUuid() {
		return ownerUuid;
	}

	@Nullable
	public LivingEntity owner() {
		Entity e = level().getEntity(ownerId());
		return e instanceof LivingEntity le ? le : null;
	}

	public boolean isLive() {
		int p = phase();
		return p == PHASE_ACTIVE || p == PHASE_CLASH;
	}

	public boolean contains(Vec3 pos) {
		return pos.distanceToSqr(position()) <= radius() * radius();
	}

	public boolean contains(Entity e) {
		return contains(e.position()) || contains(e.getEyePosition());
	}

	/** Progress of the forming expansion 0..1 (client visuals). */
	public float formProgress(float partial) {
		if (phase() != PHASE_FORMING) return 1f;
		return Math.min(1f, (level().getGameTime() - phaseStart() + partial) / (float) formTicks());
	}

	public float collapseProgress(float partial) {
		if (phase() != PHASE_COLLAPSING) return 0f;
		return Math.min(1f, (level().getGameTime() - phaseStart() + partial) / (float) COLLAPSE_TICKS);
	}

	private void setPhase(int phase) {
		entityData.set(PHASE, phase);
		entityData.set(PHASE_START, level().getGameTime());
	}

	void enterClash(DomainEntity other) {
		entityData.set(CLASH_WITH, other.getId());
		if (phase() == PHASE_ACTIVE || phase() == PHASE_FORMING) {
			if (phase() == PHASE_FORMING) finishForming();
			setPhase(PHASE_CLASH);
		}
	}

	void leaveClash(boolean won) {
		entityData.set(CLASH_WITH, -1);
		if (won) {
			wonClash = true;
			clashBonusTicks = 100;
			if (phase() == PHASE_CLASH) setPhase(PHASE_ACTIVE);
		} else {
			lostClash = true;
			collapse();
		}
	}

	// ------------------------------------------------------------------------------------------------ tick

	@Override
	public void tick() {
		super.tick();
		if (level() instanceof ServerLevel level) {
			serverTick(level);
		} else {
			clientTick();
		}
	}

	private void serverTick(ServerLevel level) {
		if (finalized) {
			discard();
			return;
		}
		LivingEntity owner = owner();
		int phase = phase();
		if (phase != PHASE_COLLAPSING) {
			if (owner == null || !owner.isAlive() || owner.isRemoved() || owner.level() != level) {
				collapse();
				return;
			}
			double leave = radius() * (domainType().hasBarrier ? 1.25 : 1.5);
			if (owner.position().distanceToSqr(position()) > leave * leave) {
				collapse();
				return;
			}
		}
		switch (phase) {
			case PHASE_FORMING -> {
				buildArena(level, false);
				long t = level.getGameTime() - phaseStart();
				if (t % 8 == 0) Fx.sound(level, position(), ModSounds.BARRIER_FORM, 1.5f, 0.6f + t * 0.01f);
				if (t >= formTicks()) finishForming();
			}
			case PHASE_ACTIVE, PHASE_CLASH -> {
				activeTicks++;
				if (owner != null) {
					// sustaining a domain costs energy; empty tank collapses it
					if (CursedEnergy.drain(owner, phase == PHASE_CLASH ? 6f : 1.5f) <= 0.0f && CursedEnergy.get(owner) <= 0) {
						collapse();
						return;
					}
					sureHit(level, owner);
				}
				int limit = duration + clashBonusTicks;
				if (phase == PHASE_ACTIVE && activeTicks >= limit) collapse();
			}
			case PHASE_COLLAPSING -> {
				if (level.getGameTime() - phaseStart() >= COLLAPSE_TICKS) finish(level);
			}
			default -> {
			}
		}
	}

	private void buildArena(ServerLevel level, boolean all) {
		if (plan == null || planIndex >= plan.size()) return;
		int total = plan.size();
		int target;
		if (all) {
			target = total;
		} else {
			long t = level.getGameTime() - phaseStart() + 1;
			target = (int) Math.min(total, Math.ceil(total * Math.min(1.0, t / (double) Math.max(1, formTicks() - 2))));
		}
		TerrainJournal journal = TerrainJournal.get(level);
		for (; planIndex < target; planIndex++) {
			DomainArena.Change c = plan.get(planIndex);
			journal.replace(level, c.pos(), c.state(), TerrainJournal.HELD, getUUID());
		}
	}

	/** Shorten the activation so it completes within {@code ticks} (used when the cinematic ends early or is skipped). */
	public void hurryForming(int ticks) {
		if (phase() != PHASE_FORMING) return;
		long elapsed = level().getGameTime() - phaseStart();
		entityData.set(FORM_TICKS, (int) Math.max(1, Math.min(formTicks(), elapsed + ticks)));
	}

	/** End the activation sequence (also used when a cinematic is skipped). */
	public void finishForming() {
		if (!(level() instanceof ServerLevel level) || phase() != PHASE_FORMING) return;
		buildArena(level, true);
		setPhase(clashWith() >= 0 ? PHASE_CLASH : PHASE_ACTIVE);
		Fx.sound(level, position(), domainType() == DomainType.UNLIMITED_VOID ? ModSounds.VOID_ACTIVATE : ModSounds.SHRINE_ACTIVATE, 3.0f, 1.0f);
		JjkNetwork.shakeAround(level, position(), radius() * 2.5, 1.0f, 20);
		JjkNetwork.flashAround(level, position(), radius() * 1.5, 0.7f, 14, domainType().color);
	}

	public void collapse() {
		if (!(level() instanceof ServerLevel level) || phase() == PHASE_COLLAPSING || finalized) return;
		if (phase() == PHASE_FORMING) buildArena(level, true);
		DomainManager.onCollapse(this);
		setPhase(PHASE_COLLAPSING);
		Fx.sound(level, position(), ModSounds.SHATTER, 3.0f, domainType() == DomainType.UNLIMITED_VOID ? 1.0f : 0.7f);
		JjkNetwork.shakeAround(level, position(), radius() * 2, 0.8f, 16);
	}

	private void finish(ServerLevel level) {
		if (finalized) return;
		finalized = true;
		TerrainJournal.get(level).restoreHolderNow(level, getUUID());
		LivingEntity owner = owner();
		if (owner != null) {
			SorcererState s = Sorcerers.state(owner);
			int burnout = Math.round(JjkConfig.get().domains.burnoutTicks * (lostClash ? 1.5f : 1.0f));
			s.burnoutTicks = Math.max(s.burnoutTicks, burnout);
			s.burnoutTotal = Math.max(1, s.burnoutTicks);
			if (s.infinity) {
				s.infinity = false;
				Fx.sound(owner, ModSounds.INFINITY_OFF, 1f, 1f);
			}
			s.amplification = false;
			if (domainType() == DomainType.MALEVOLENT_SHRINE && !lostClash) {
				// after the Shrine, Sukuna follows up with an empowered Fuga
				s.empoweredFugaTicks = 200;
			}
			s.dirty = true;
			s.visualDirty = true;
			if (burnout > 0) {
				JjkNetwork.notify(owner, Payloads.Notify.WARN, net.minecraft.network.chat.Component.translatable("message.jjkshowdown.burnout",
						burnout / 20), 0xFF6060);
			}
			if (lostClash) {
				s.staggerTicks = Math.max(s.staggerTicks, 50);
				TechniqueDamage.hurt(owner, ModDamageTypes.BACKLASH, this, null, owner.getMaxHealth() * 0.15f, true);
			}
		}
		Fx.burst(level, domainType() == DomainType.UNLIMITED_VOID ? ModParticles.VOID_STAR : ModParticles.DOMAIN_EMBER, position().add(0, 2, 0), 80, 1.2);
		discard();
	}

	// ------------------------------------------------------------------------------------------------ sure-hit

	private void sureHit(ServerLevel level, LivingEntity owner) {
		float r = radius();
		LivingEntity rival = rivalOwner();
		float power = Mastery.powerMultiplier(owner) * JjkConfig.get().domains.sureHitDamageMultiplier;
		if (owner instanceof com.jjkshowdown.entity.boss.SorcererBoss boss) power *= boss.damageScale();
		boolean clashing = phase() == PHASE_CLASH;
		List<LivingEntity> targets = Targeting.livingInRadius(owner, position(), r);
		if (domainType() == DomainType.UNLIMITED_VOID) {
			for (LivingEntity t : targets) {
				if (clashing && t == rival) continue; // the rival's own domain neutralises the sure-hit
				boolean amplified = Sorcerers.hasAmplification(t);
				boolean apply = !amplified || (activeTicks % 30) < 12;
				if (apply) {
					t.addEffect(new MobEffectInstance(ModEffects.INFORMATION_OVERLOAD, amplified ? 14 : 50, 0, false, false, true), owner);
				}
				if (activeTicks % 20 == 0) {
					TechniqueDamage.hurt(t, ModDamageTypes.SURE_HIT, this, owner, 1.0f * power, true);
				}
			}
		} else {
			for (LivingEntity t : targets) {
				if (clashing && t == rival) continue;
				float scale = Sorcerers.hasAmplification(t) ? 0.5f : 1.0f;
				Vec3 c = t.getBoundingBox().getCenter();
				if ((activeTicks + t.getId()) % 10 == 0) {
					TechniqueDamage.hurt(t, ModDamageTypes.SURE_HIT, this, owner, 1.2f * power * scale, true);
					Fx.particles(level, ModParticles.SLASH, c, 1, 0.4, 0.0);
					Fx.particles(level, ModParticles.BLOOD, c, 3, 0.3, 0.1);
				}
				if ((activeTicks + t.getId()) % 20 == 0) {
					TechniqueDamage.hurt(t, ModDamageTypes.SURE_HIT, this, owner, (1.5f + Math.min(4f, t.getMaxHealth() * 0.02f)) * power * scale, true);
					Fx.particles(level, ModParticles.SLASH_RED, c, 3, 0.5, 0.0);
					Fx.sound(level, c, ModSounds.SHRINE_SLASH, 0.9f, 0.8f + random.nextFloat() * 0.4f);
				}
			}
			// Dismantle on everything inanimate: shred the surface
			if (Destruction.enabledFor(level, owner)) {
				for (int i = 0; i < 16; i++) {
					double a = random.nextDouble() * Math.PI * 2;
					double d = 3 + Math.sqrt(random.nextDouble()) * (r - 3);
					int x = (int) Math.floor(getX() + Math.cos(a) * d);
					int z = (int) Math.floor(getZ() + Math.sin(a) * d);
					int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z) - 1;
					if (Math.abs(y - getY()) > r * 0.6) continue;
					BlockPos p = new BlockPos(x, y, z);
					if (Destruction.destroy(level, p, owner, 50f, 0.05f, Vec3.atCenterOf(p).add(0, -1, 0), null) && random.nextInt(3) == 0) {
						Fx.particles(level, ModParticles.SLASH, Vec3.atCenterOf(p), 1, 0.2, 0.0);
					}
				}
			}
			// Malevolent Shrine erodes enemy barriers from outside
			DomainEntity other = clashPartner();
			if (clashing && other != null && other.domainType().hasBarrier) {
				other.setIntegrity(other.integrity() - 0.0028f * DomainClash.strengthRatio(this, other));
				if (activeTicks % 3 == 0) {
					Vec3 dir = new Vec3(random.nextGaussian(), Math.abs(random.nextGaussian()) * 0.6, random.nextGaussian()).normalize();
					Vec3 at = other.position().add(dir.scale(other.radius() + 0.6));
					Fx.particles(level, ModParticles.SLASH_RED, at, 1, 0.3, 0.0);
					if (activeTicks % 9 == 0) Fx.sound(level, at, ModSounds.SHRINE_SLASH, 1.2f, 0.6f);
				}
			}
		}
	}

	@Nullable
	public DomainEntity clashPartner() {
		int id = clashWith();
		return id >= 0 && level().getEntity(id) instanceof DomainEntity d ? d : null;
	}

	@Nullable
	private LivingEntity rivalOwner() {
		DomainEntity d = clashPartner();
		return d != null ? d.owner() : null;
	}

	// ------------------------------------------------------------------------------------------------ client

	private void clientTick() {
		float r = radius();
		int phase = phase();
		float grow = formProgress(0);
		if (domainType() == DomainType.UNLIMITED_VOID) {
			int n = ParticleDensity.scale(phase == PHASE_FORMING ? 10 : 6);
			for (int i = 0; i < n; i++) {
				Vec3 p = randomInside(r * grow * 0.95);
				level().addParticle(ModParticles.VOID_STAR, p.x, p.y, p.z, 0, 0.002, 0);
			}
			if (phase == PHASE_FORMING) {
				for (int i = 0; i < ParticleDensity.scale(16); i++) {
					Vec3 dir = randomDir();
					if (dir.y < 0) dir = new Vec3(dir.x, -dir.y, dir.z);
					Vec3 p = position().add(dir.scale(r * grow));
					level().addParticle(ParticleTypes.END_ROD, p.x, p.y, p.z, 0, 0, 0);
				}
			}
		} else {
			int n = ParticleDensity.scale(phase == PHASE_FORMING ? 6 : 10);
			for (int i = 0; i < n; i++) {
				Vec3 p = randomInside(r * grow);
				if (p.y < getY() - 1) p = new Vec3(p.x, getY() + random.nextDouble() * 4, p.z);
				level().addParticle(i % 3 == 0 ? ModParticles.SLASH : ModParticles.DOMAIN_EMBER, p.x, p.y, p.z, 0, 0.01, 0);
			}
		}
	}

	private Vec3 randomDir() {
		double u = random.nextDouble() * 2 - 1;
		double t = random.nextDouble() * Math.PI * 2;
		double s = Math.sqrt(1 - u * u);
		return new Vec3(s * Math.cos(t), u, s * Math.sin(t));
	}

	private Vec3 randomInside(double r) {
		Vec3 d = randomDir();
		if (d.y < 0) d = new Vec3(d.x, -d.y, d.z);
		return position().add(d.scale(Math.cbrt(random.nextDouble()) * r));
	}

	// ------------------------------------------------------------------------------------------------ lifecycle

	@Override
	public void onRemoval(RemovalReason reason) {
		super.onRemoval(reason);
		if (level() instanceof ServerLevel level && !finalized) {
			// unloaded or killed without a proper collapse: never leave the arena behind
			finalized = true;
			TerrainJournal.get(level).restoreHolderNow(level, getUUID());
			DomainManager.onCollapse(this);
		}
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		return false;
	}

	@Override
	public boolean shouldBeSaved() {
		return false;
	}

	@Override
	public boolean isPickable() {
		return false;
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double d) {
		return d < 320 * 320;
	}

	public AABB cullingBox() {
		return new AABB(position(), position()).inflate(radius() + 2);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
	}

	public Direction facingHint() {
		return Direction.NORTH;
	}
}
