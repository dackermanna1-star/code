package com.godforge.entity;

import com.godforge.destruction.CutJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModParticles;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.weapon.WeaponType;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Drives the "Sever Reality" ultimate: a blinding cut races along the ground, the CutJob pushes both halves
 * of the world apart, and anything caught in the opening is torn apart while bystanders are shoved aside.
 */
public class RealityCutEntity extends GfEffectEntity {
	private static final EntityDataAccessor<Float> DATA_LENGTH = SynchedEntityData.defineId(RealityCutEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Float> DATA_GAP = SynchedEntityData.defineId(RealityCutEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Float> DATA_DEPTH = SynchedEntityData.defineId(RealityCutEntity.class, EntityDataSerializers.FLOAT);
	public static final int REVEAL_TICKS = 14;

	private float damage = 30.0F;
	private CutJob job;

	public RealityCutEntity(EntityType<? extends RealityCutEntity> type, Level level) {
		super(type, level);
		this.setLifetime(110);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(DATA_LENGTH, 64.0F);
		builder.define(DATA_GAP, 8.0F);
		builder.define(DATA_DEPTH, 40.0F);
	}

	public void configure(float yaw, float length, float gap, float depth, float damage, boolean terrain) {
		this.setYRot(yaw);
		this.yRotO = yaw;
		this.entityData.set(DATA_LENGTH, length);
		this.entityData.set(DATA_GAP, gap);
		this.entityData.set(DATA_DEPTH, depth);
		this.damage = damage;
		this.terrain = terrain;
	}

	public float length() {
		return this.entityData.get(DATA_LENGTH);
	}

	public float gap() {
		return this.entityData.get(DATA_GAP);
	}

	public float depth() {
		return this.entityData.get(DATA_DEPTH);
	}

	public Vec3 direction() {
		float rad = this.getYRot() * Mth.DEG_TO_RAD;
		return new Vec3(-Mth.sin(rad), 0, Mth.cos(rad));
	}

	/** How far along the cut the reveal has travelled (0..1). */
	public float reveal(float partialTick) {
		return Mth.clamp((this.age() + partialTick) / REVEAL_TICKS, 0.0F, 1.0F);
	}

	@Override
	protected void serverTick(ServerLevel level, int age) {
		Vec3 origin = this.position();
		Vec3 dir = this.direction();
		float length = this.length();
		Vec3 end = origin.add(dir.scale(length));
		Vec3 mid = origin.add(dir.scale(length * 0.5));
		int color = WeaponType.WORLDCUTTER.color();
		if (age == 1) {
			Fx.send(level, FxType.SEVER, origin, dir.scale(length), 48.0F, 0.0F, color, 384);
			Fx.flash(level, mid, 0xF2ECFF, 0.95F, 22, 220);
			Fx.shake(level, mid, 1.6F, 70, 260);
			Fx.distort(level, mid, 1.0F, 80, 160);
			Fx.sound(level, origin, ModSounds.WORLDCUTTER_SEVER, 12.0F, 1.0F);
			Fx.sound(level, mid, ModSounds.WORLDCUTTER_RUMBLE, 10.0F, 0.7F);
		}
		if (age == REVEAL_TICKS && this.terrain) {
			this.job = new CutJob(level, origin.x, origin.z, Mth.floor(origin.y), this.getYRot(), length, this.gap(), (int) this.depth());
			if (!DestructionManager.submit(this.job)) {
				this.job = null;
			}
		}
		if (age % 20 == 0 && age < 80) {
			Fx.sound(level, mid, ModSounds.WORLDCUTTER_RUMBLE, 8.0F, 0.6F + level.getRandom().nextFloat() * 0.2F);
		}
		if (age % 4 == 0 && age > REVEAL_TICKS && age < 90) {
			Vec3 right = new Vec3(-dir.z, 0, dir.x);
			double edge = this.gap() * 0.5 + 0.5;
			Fx.send(level, FxType.DUST_LINE, origin.add(right.scale(edge)), dir.scale(length), 2.0F, 0.0F, 0x8C7B6B, 256);
			Fx.send(level, FxType.DUST_LINE, origin.subtract(right.scale(edge)), dir.scale(length), 2.0F, 0.0F, 0x8C7B6B, 256);
		}
		if (age <= REVEAL_TICKS + 50) {
			this.affectEntities(level, origin, dir, length, age);
		}
	}

	private void affectEntities(ServerLevel level, Vec3 origin, Vec3 dir, float length, int age) {
		Entity owner = this.getOwner();
		float reveal = this.reveal(0.0F);
		double reach = length * reveal;
		double gap = this.gap();
		double push = Math.max(14.0, gap * 1.8);
		Vec3 right = new Vec3(-dir.z, 0, dir.x);
		Vec3 end = origin.add(dir.scale(reach));
		AABB box = new AABB(origin, end).inflate(push, Math.max(24.0, this.depth()), push);
		DamageSource source = ModDamageTypes.source(level, WeaponType.WORLDCUTTER, this, owner);
		for (Entity e : level.getEntities(this, box, e -> e.isAlive() && !(e instanceof com.godforge.util.EffectEntity))) {
			Vec3 rel = e.position().subtract(origin);
			double t = rel.dot(dir);
			double d = rel.dot(right);
			if (t < -1 || t > reach + 1 || Math.abs(d) > push) {
				continue;
			}
			double side = d >= 0 ? 1.0 : -1.0;
			if (Math.abs(d) < gap * 0.5 + 1.0) {
				if (Combat.canAffect(level, owner, e)) {
					Combat.hurt(level, e, source, this.damage * (age <= REVEAL_TICKS + 2 ? 1.0F : 0.12F));
				}
				if (e != owner) {
					Combat.launch(e, right.scale(side * 0.9).add(0, 0.25, 0));
				}
			} else if (age < REVEAL_TICKS + 30 && e != owner) {
				double strength = 0.18 * (1.0 - Math.abs(d) / push);
				Combat.launch(e, right.scale(side * strength));
			}
		}
	}

	@Override
	protected void clientTick() {
		float reveal = this.reveal(0.0F);
		if (reveal <= 0.0F) {
			return;
		}
		Vec3 origin = this.position();
		Vec3 dir = this.direction();
		Vec3 right = new Vec3(-dir.z, 0, dir.x);
		Level level = this.level();
		int count = this.age() < REVEAL_TICKS + 40 ? 12 : 3;
		for (int i = 0; i < count; i++) {
			double t = this.random.nextDouble() * this.length() * reveal;
			double side = this.random.nextBoolean() ? 1 : -1;
			double h = (this.random.nextDouble() - 0.3) * 24.0;
			Vec3 p = origin.add(dir.scale(t)).add(right.scale(side * (this.random.nextDouble() * 0.6))).add(0, h, 0);
			level.addParticle(
				FxParticleOptions.of(ModParticles.GLOW, i % 3 == 0 ? 0xFFFFFF : 0xB18CFF, 0x3A1AFF, 0.25F + this.random.nextFloat() * 0.25F, 18, -0.02F,
					FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK | FxParticleOptions.F_NO_PHYSICS),
				p.x, p.y, p.z, right.x * side * 0.05, 0.02, right.z * side * 0.05
			);
		}
	}
}
