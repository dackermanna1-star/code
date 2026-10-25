package com.godforge.entity;

import com.godforge.destruction.BlockOps;
import com.godforge.destruction.CraterJob;
import com.godforge.destruction.DestructionManager;
import com.godforge.destruction.Palette;
import com.godforge.destruction.PathJob;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModDamageTypes;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.Loaded;
import com.godforge.weapon.BeamColors;
import com.godforge.weapon.WeaponType;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseFireBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * The Annihilation Cannon's beam. Lives only while its owner channels; every tick it ray-casts from the
 * owner's eye, scorches/melts/vaporizes/detonates whatever it touches according to the power level, and
 * reports its length so every client renders the same beam.
 */
public class LaserBeamEntity extends GfEffectEntity {
	private static final EntityDataAccessor<Integer> DATA_OWNER = SynchedEntityData.defineId(LaserBeamEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Float> DATA_LENGTH = SynchedEntityData.defineId(LaserBeamEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Float> DATA_RANGE = SynchedEntityData.defineId(LaserBeamEntity.class, EntityDataSerializers.FLOAT);
	private static final EntityDataAccessor<Integer> DATA_COLOR = SynchedEntityData.defineId(LaserBeamEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Integer> DATA_POWER = SynchedEntityData.defineId(LaserBeamEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Float> DATA_INTENSITY = SynchedEntityData.defineId(LaserBeamEntity.class, EntityDataSerializers.FLOAT);

	private int keepAlive = 3;
	private float baseDamage = 9.0F;
	private int maxBlocksPerTick = 900;
	private PathJob burrow;
	private int impactTicks;
	private BlockPos lastImpact;

	public LaserBeamEntity(EntityType<? extends LaserBeamEntity> type, Level level) {
		super(type, level);
		this.setLifetime(Integer.MAX_VALUE);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(DATA_OWNER, -1);
		builder.define(DATA_LENGTH, 0.0F);
		builder.define(DATA_RANGE, 64.0F);
		builder.define(DATA_COLOR, 0);
		builder.define(DATA_POWER, 5);
		builder.define(DATA_INTENSITY, 1.0F);
	}

	/** Called by the weapon each tick the trigger is held. */
	public void refresh(ServerPlayer player, int power, float width, float range, int color, float intensity, boolean overload, float damage, int maxBlocks, boolean terrain) {
		this.keepAlive = 3;
		this.setOwner(player);
		this.entityData.set(DATA_OWNER, player.getId());
		this.entityData.set(DATA_POWER, power);
		this.setSize(width);
		this.entityData.set(DATA_RANGE, range);
		this.entityData.set(DATA_COLOR, color);
		this.entityData.set(DATA_INTENSITY, intensity);
		this.setVariant(overload ? 1 : 0);
		this.baseDamage = damage;
		this.maxBlocksPerTick = maxBlocks;
		this.terrain = terrain;
	}

	public int ownerId() {
		return this.entityData.get(DATA_OWNER);
	}

	public float length() {
		return this.entityData.get(DATA_LENGTH);
	}

	public float range() {
		return this.entityData.get(DATA_RANGE);
	}

	public int colorIndex() {
		return this.entityData.get(DATA_COLOR);
	}

	public int power() {
		return this.entityData.get(DATA_POWER);
	}

	public float intensity() {
		return this.entityData.get(DATA_INTENSITY);
	}

	public boolean overloaded() {
		return this.variant() == 1;
	}

	public int rgb(float time) {
		return BeamColors.rgb(this.colorIndex(), time);
	}

	@Override
	protected void serverTick(ServerLevel level, int age) {
		Entity owner = this.getOwner();
		if (--this.keepAlive < 0 || !(owner instanceof LivingEntity living) || !owner.isAlive() || owner.level() != level) {
			this.discard();
			return;
		}
		Vec3 eye = living.getEyePosition();
		Vec3 look = living.getLookAngle();
		this.setPos(eye.x, eye.y - 0.2, eye.z);
		float range = this.range();
		Vec3 far = eye.add(look.scale(range));
		BlockHitResult hit = Loaded.clip(level, eye, far, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, owner);
		Vec3 end = hit.getLocation();
		this.entityData.set(DATA_LENGTH, (float) eye.distanceTo(end));

		int power = this.power();
		float intensity = this.intensity();
		boolean overload = this.overloaded();
		float width = this.size();
		this.burnEntities(level, living, eye, end, width, power, intensity, overload);
		if (hit.getType() != HitResult.Type.MISS) {
			this.impact(level, living, hit, look, width, power, intensity, overload);
		} else {
			this.impactTicks = 0;
		}
		if (age % 2 == 0) {
			Fx.send(level, FxType.HEAT_HAZE, end, look, width * (overload ? 1.6F : 0.8F), 12.0F, this.rgb(age), 128);
		}
	}

	private void burnEntities(ServerLevel level, LivingEntity owner, Vec3 eye, Vec3 end, float width, int power, float intensity, boolean overload) {
		double radius = width * 0.5 + 0.4;
		AABB box = new AABB(eye, end).inflate(radius);
		DamageSource source = ModDamageTypes.source(level, WeaponType.LASER_BEAM, this, owner);
		float damage = this.baseDamage * (float) Math.pow(power / 10.0, 1.3) * (0.3F + 0.7F * intensity) * (overload ? 4.0F : 1.0F);
		Vec3 dir = end.subtract(eye).normalize();
		for (Entity e : level.getEntities(owner, box, e -> e.isAlive() && !(e instanceof com.godforge.util.EffectEntity))) {
			Vec3 c = e.getBoundingBox().getCenter();
			double t = Mth.clamp(c.subtract(eye).dot(dir), 0.0, eye.distanceTo(end));
			Vec3 p = eye.add(dir.scale(t));
			if (c.distanceTo(p) > radius + e.getBbWidth() * 0.5) {
				continue;
			}
			if (!Combat.canAffect(level, owner, e)) {
				continue;
			}
			if (e instanceof LivingEntity living) {
				living.invulnerableTime = 0;
			}
			Combat.hurt(level, e, source, damage);
			e.igniteForSeconds(3.0F + power * 0.5F);
			if (power >= 8 || overload) {
				Combat.launch(e, dir.scale(0.08 * power).add(0, 0.05, 0));
			}
		}
	}

	private void impact(ServerLevel level, LivingEntity owner, BlockHitResult hit, Vec3 look, float width, int power, float intensity, boolean overload) {
		BlockPos pos = hit.getBlockPos();
		this.impactTicks = pos.equals(this.lastImpact) ? this.impactTicks + 1 : this.impactTicks;
		this.lastImpact = pos;
		boolean terrain = this.terrain && com.godforge.weapon.WeaponAccess.terrainAllowed(level, owner, true, pos);
		if (!terrain) {
			return;
		}
		Vec3 point = hit.getLocation();
		float rate = (0.25F + 0.75F * intensity) * (overload ? 3.0F : 1.0F);
		if (power <= 2 && !overload) {
			// Burn: scorch the surface and set it ablaze
			if (this.tickCount % Math.max(1, 6 - power * 2) == 0) {
				BlockState state = level.getBlockState(pos);
				if (!BlockOps.isProtected(level, pos, state)) {
					BlockState scorched = Palette.scorchSurface(state, pos, level.getRandom().nextLong(), false);
					if (scorched != null) {
						BlockOps.set(level, pos, scorched);
					}
				}
				BlockPos firePos = pos.relative(hit.getDirection());
				BlockState facing = Loaded.state(level, firePos);
				if (com.godforge.config.GodforgeConfig.get().general.startFires && facing != null && facing.isAir()) {
					BlockState fire = BaseFireBlock.getState(level, firePos);
					if (fire.canSurvive(level, firePos)) {
						level.setBlock(firePos, fire, BlockOps.FAST_PLACE);
					}
				}
			}
			return;
		}
		if (this.burrow == null || this.burrow.isFinished()) {
			this.burrow = new PathJob(level, level.getRandom().nextLong());
			if (!DestructionManager.submit(this.burrow)) {
				this.burrow = null;
				return;
			}
		}
		// Melt (3-6) leaves a glassy/molten lining, vaporize (7+) removes cleanly and burrows faster
		Palette lining = power <= 4 ? Palette.GLASSED : (power <= 6 ? Palette.MOLTEN : Palette.NONE);
		double radius = Math.max(0.6, width * 0.5 * (0.7 + power * 0.06)) * (overload ? 1.5 : 1.0);
		double depth = Math.min(4.0, 0.12 * power * rate);
		Vec3 from = point.subtract(look.scale(0.5));
		Vec3 to = point.add(look.scale(depth + 0.5));
		this.burrow.add(from, to, radius, lining);
		if ((power >= 10 || overload) && this.tickCount % (overload ? 3 : 6) == 0) {
			// Annihilate: the impact point itself detonates
			double blast = overload ? 4.5 : 3.0;
			CraterJob.builder(level, BlockPos.containing(point), blast).vertical(0.9).noise(0.3).lining(Palette.MOLTEN, 1.0).fire(0.3F).submit();
			Combat.sphere(level, ModDamageTypes.source(level, WeaponType.LASER_BEAM, this, owner), owner, point, blast + 2, this.baseDamage * 2.0F, 1.0, 1.2, 0.5);
			Fx.send(level, FxType.EXPLOSION, point, Vec3.ZERO, (float) blast, 0.0F, this.rgb(this.tickCount), 192);
			Fx.sound(level, point, ModSounds.BIG_EXPLOSION, 3.0F, 1.3F + level.getRandom().nextFloat() * 0.3F);
			if (overload) {
				Fx.shake(level, point, 0.5F, 8, 64);
			}
		}
		if (hit.getDirection() == Direction.UP && power >= 5 && this.tickCount % 10 == 0) {
			Fx.sound(level, point, ModSounds.LASER_STOP, 0.6F, 2.0F);
		}
	}

	@Override
	public void onRemoval(RemovalReason reason) {
		if (this.burrow != null) {
			this.burrow.seal();
		}
		if (reason.shouldDestroy() && this.level() instanceof ServerLevel server) {
			Fx.sound(server, this.position(), ModSounds.LASER_STOP, 1.0F, 1.0F);
		}
		super.onRemoval(reason);
	}

	@Override
	public boolean shouldRenderAtSqrDistance(double distance) {
		return distance < 600.0 * 600.0;
	}
}
