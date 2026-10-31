package com.jjkshowdown.entity.projectile;

import com.jjkshowdown.combat.TechniqueDamage;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.util.Fx;
import com.jjkshowdown.util.Targeting;
import com.jjkshowdown.world.Destruction;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;
import org.joml.Vector3fc;

import java.util.HashSet;
import java.util.Set;

/**
 * The World-Cutting Slash: a Dismantle that targets space itself. It propagates outward from Sukuna as a single
 * infinitely thin plane, ignoring Infinity, armour and toughness, and cleaving terrain along the cut.
 */
public class WorldSlashEntity extends TechniqueProjectile {
	private static final EntityDataAccessor<Vector3fc> FORWARD = SynchedEntityData.defineId(WorldSlashEntity.class, EntityDataSerializers.VECTOR3);
	private static final EntityDataAccessor<Vector3fc> EDGE = SynchedEntityData.defineId(WorldSlashEntity.class, EntityDataSerializers.VECTOR3);
	public static final int PROPAGATE_TICKS = 8;
	public static final int LIFE = 30;

	private float length = 56f;
	private float halfWidth = 9f;
	private final Set<Integer> cut = new HashSet<>();

	public WorldSlashEntity(EntityType<? extends WorldSlashEntity> type, Level level) {
		super(type, level);
		this.maxLife = LIFE;
	}

	public static WorldSlashEntity create(ServerLevel level, LivingEntity owner, Vec3 origin, Vec3 forward, Vec3 edge, float damage,
			float length, float halfWidth) {
		WorldSlashEntity w = new WorldSlashEntity(ModEntities.WORLD_SLASH, level);
		w.setOwner(owner);
		w.setPos(origin.x, origin.y, origin.z);
		w.entityData.set(FORWARD, forward.normalize().toVector3f());
		w.entityData.set(EDGE, edge.normalize().toVector3f());
		w.damage = damage;
		w.length = length;
		w.halfWidth = halfWidth;
		w.setScale(halfWidth);
		w.setCharge(length);
		return w;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(FORWARD, new Vector3f(0, 0, 1));
		builder.define(EDGE, new Vector3f(1, 0, 0));
	}

	public Vec3 forward() {
		Vector3fc v = entityData.get(FORWARD);
		return new Vec3(v.x(), v.y(), v.z());
	}

	public Vec3 edge() {
		Vector3fc v = entityData.get(EDGE);
		return new Vec3(v.x(), v.y(), v.z());
	}

	public float length() {
		return charge();
	}

	public float halfWidth() {
		return scale();
	}

	@Override
	protected boolean collidesWithBlocks() {
		return false;
	}

	@Override
	protected boolean bypassesInfinity() {
		return true;
	}

	@Override
	public void tick() {
		setDeltaMovement(Vec3.ZERO);
		super.tick();
	}

	@Override
	protected void serverTick(ServerLevel level, Vec3 from, Vec3 to) {
		if (tickCount > PROPAGATE_TICKS) return;
		LivingEntity owner = ownerLiving();
		Vec3 o = position();
		Vec3 f = forward();
		Vec3 e = edge();
		Vec3 n = f.cross(e).normalize();
		float start = length * (tickCount - 1) / PROPAGATE_TICKS;
		float end = length * tickCount / PROPAGATE_TICKS;
		// entities crossing the plane within the propagated extent
		for (LivingEntity t : Targeting.livingInRadius(owner != null ? owner : this, o.add(f.scale((start + end) * 0.5)), (end - start) * 0.5 + halfWidth + 2)) {
			if (cut.contains(t.getId())) continue;
			Vec3 rel = t.getBoundingBox().getCenter().subtract(o);
			double along = rel.dot(f);
			double across = Math.abs(rel.dot(e));
			double off = Math.abs(rel.dot(n));
			if (along >= -1 && along <= end + 1 && across <= halfWidth + t.getBbWidth() && off <= t.getBbWidth() * 0.5 + t.getBbHeight() * 0.5 + 0.4) {
				cut.add(t.getId());
				float dmg = damage + t.getMaxHealth() * 0.35f;
				TechniqueDamage.hurt(t, ModDamageTypes.WORLD_SLASH, this, owner, dmg, true);
				Fx.particles(level, ModParticles.BLOOD, t.getBoundingBox().getCenter(), 40, 0.4, 0.3);
				Fx.particles(level, ModParticles.SLASH, t.getBoundingBox().getCenter(), 4, 0.5, 0.0);
				JjkNetwork.screenEffect(t, Payloads.ScreenEffect.IMPACT_FRAME, 1.0f, 10, 0xFFFFFF);
			}
		}
		Destruction.cutPlane(level, o.add(f.scale(start)), f, e, end - start, halfWidth, 0.3, owner, 80f, 0.03f);
		if (tickCount == 1) {
			JjkNetwork.shakeAround(level, o, 96, 1.6f, 30);
			JjkNetwork.flashAround(level, o, 80, 0.45f, 8, 0xFFFFFF);
		}
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double d) {
		return d < 256 * 256;
	}
}
