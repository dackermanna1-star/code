package com.godforge.entity;

import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.weapon.WeaponType;
import java.util.Comparator;
import java.util.List;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * A miniature sun orbiting its summoner. It sears anything hostile that comes near and periodically
 * fires solar flares at enemies. The Sunforge can hurl it as a homing nova.
 */
public class MiniSunEntity extends GfEffectEntity {
	private static final EntityDataAccessor<Integer> DATA_OWNER = SynchedEntityData.defineId(MiniSunEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Integer> DATA_SLOT = SynchedEntityData.defineId(MiniSunEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Integer> DATA_COUNT = SynchedEntityData.defineId(MiniSunEntity.class, EntityDataSerializers.INT);
	private float damage = 8.0F;

	public MiniSunEntity(EntityType<? extends MiniSunEntity> type, Level level) {
		super(type, level);
		this.setLifetime(20 * 120);
		this.setSize(0.55F);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(DATA_OWNER, -1);
		builder.define(DATA_SLOT, 0);
		builder.define(DATA_COUNT, 3);
	}

	public void configure(Player owner, int slot, int count, float damage) {
		this.setOwner(owner);
		this.entityData.set(DATA_OWNER, owner.getId());
		this.entityData.set(DATA_SLOT, slot);
		this.entityData.set(DATA_COUNT, count);
		this.damage = damage;
	}

	public int ownerId() {
		return this.entityData.get(DATA_OWNER);
	}

	/** Orbit position around an owner at the given time (shared by server logic and client rendering). */
	public Vec3 orbitPosition(Entity owner, float partialTick) {
		int count = Math.max(1, this.entityData.get(DATA_COUNT));
		int slot = this.entityData.get(DATA_SLOT);
		float t = (this.tickCount + partialTick) * 0.09F + slot * Mth.TWO_PI / count;
		double radius = 2.2 + 0.25 * Mth.sin((this.tickCount + partialTick) * 0.05F + slot);
		Vec3 base = owner.getPosition(partialTick);
		return base.add(Mth.cos(t) * radius, owner.getBbHeight() * 0.75 + 0.35 * Mth.sin(t * 2.0F), Mth.sin(t) * radius);
	}

	public static List<MiniSunEntity> ownedBy(ServerLevel level, Player player) {
		return level.getEntitiesOfClass(MiniSunEntity.class, player.getBoundingBox().inflate(12.0), s -> s.isAlive() && s.ownerId() == player.getId());
	}

	@Override
	protected void serverTick(ServerLevel level, int age) {
		Entity owner = this.getOwner();
		if (!(owner instanceof Player player) || !player.isAlive() || player.level() != level) {
			this.discard();
			return;
		}
		Vec3 pos = this.orbitPosition(player, 0.0F);
		this.setPos(pos);
		if (age % 10 == 0) {
			// sear anything hostile that touches the sun
			for (Entity e : level.getEntities(this, this.getBoundingBox().inflate(1.5), e -> e instanceof LivingEntity && e != player)) {
				if (Combat.canAffect(level, player, e)) {
					e.igniteForSeconds(4.0F);
					Combat.hurt(level, e, ModDamageTypes.source(level, WeaponType.SUNFORGE, this, player), this.damage * 0.5F);
				}
			}
		}
		if (age % 24 == this.entityData.get(DATA_SLOT) * 8 % 24) {
			List<LivingEntity> targets = level.getEntitiesOfClass(LivingEntity.class, new AABB(pos, pos).inflate(18.0), e -> e instanceof Enemy && e.isAlive() && Combat.canAffect(level, player, e));
			targets.stream().min(Comparator.comparingDouble(e -> e.distanceToSqr(pos))).ifPresent(target -> {
				SolarBoltEntity bolt = new SolarBoltEntity(ModEntities.SOLAR_BOLT, level);
				bolt.setOwner(player);
				bolt.setPos(pos);
				bolt.configure(SolarBoltEntity.BOLT, 0.45F, this.damage, false);
				bolt.setDeltaMovement(target.getBoundingBox().getCenter().subtract(pos).normalize().scale(1.8));
				level.addFreshEntity(bolt);
				Fx.send(level, FxType.MUZZLE, pos, bolt.getDeltaMovement(), 0.6F, 0.0F, 0xFFB01F, 64);
				Fx.sound(level, pos, ModSounds.SUNFORGE_BOLT, 0.6F, 1.6F);
			});
		}
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 160.0 * 160.0;
	}
}
