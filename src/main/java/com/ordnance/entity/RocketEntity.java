package com.ordnance.entity;

import com.ordnance.ClientBridge;
import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.explosion.OrdnanceExplosion;
import com.ordnance.registry.ModEntities;
import com.ordnance.registry.ModItems;
import com.ordnance.weapon.ExplosiveItem;
import net.minecraft.block.BlockState;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.particle.BlockStateParticleEffect;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvents;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.EntityHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.World;

/**
 * RPG-7 rocket. A short booster kick launches it, then the sustainer motor ignites a few metres out and
 * accelerates it to cruise speed; after burnout it arcs down. The warhead arms after a short distance and
 * detonates on impact, or self-destructs at the end of its flight time.
 */
public class RocketEntity extends OrdnanceProjectileEntity {
	public static final int MOTOR_IGNITION_TICK = 3;
	public static final int MOTOR_BURN_TICKS = 40;

	public RocketEntity(EntityType<? extends RocketEntity> type, World world) {
		super(type, world);
	}

	public RocketEntity(World world, LivingEntity shooter, ItemStack rocket) {
		this(ModEntities.ROCKET, world);
		this.setOwner(shooter);
		this.setItem(rocket);
	}

	@Override
	protected Item getDefaultItem() {
		return ModItems.PG7V_ROCKET;
	}

	public ExplosionProfile profile() {
		return this.getStack().getItem() instanceof ExplosiveItem explosive ? explosive.profile() : ExplosionProfile.RPG_HEAT;
	}

	public boolean isMotorBurning() {
		return this.age >= MOTOR_IGNITION_TICK && this.age < MOTOR_IGNITION_TICK + MOTOR_BURN_TICKS;
	}

	@Override
	public boolean hasNoGravity() {
		return true;
	}

	@Override
	public void tick() {
		super.tick();
		OrdnanceConfig.Rpg cfg = ConfigManager.get().weapons.rpg7;
		Vec3d velocity = this.getVelocity();
		boolean burning = this.isMotorBurning();
		if (burning && velocity.lengthSquared() > 1.0E-6) {
			double speed = velocity.length();
			if (speed < cfg.maxSpeed) {
				velocity = velocity.add(velocity.multiply(Math.min(cfg.motorAcceleration, cfg.maxSpeed - speed) / speed));
			}
		}

		double drag = this.isTouchingWater() ? 0.88 : 0.996;
		velocity = velocity.multiply(drag).add(0.0, burning ? -0.004 : -0.03, 0.0);
		this.setVelocity(velocity);

		World world = this.getEntityWorld();
		Vec3d start = this.getEntityPos();
		Vec3d end = start.add(velocity);
		BlockHitResult blockHit = world.raycast(new RaycastContext(start, end, RaycastContext.ShapeType.COLLIDER, RaycastContext.FluidHandling.NONE, this));
		Vec3d limit = blockHit.getType() == HitResult.Type.MISS ? end : blockHit.getPos();
		EntityHitResult entityHit = this.findEntityHit(start, limit);
		if (entityHit != null || blockHit.getType() != HitResult.Type.MISS) {
			Vec3d impact = entityHit != null ? entityHit.getPos() : blockHit.getPos();
			this.distanceTravelled += impact.distanceTo(start);
			this.setPosition(impact);
			if (!world.isClient()) {
				this.impact(impact, velocity);
			} else {
				this.setVelocity(Vec3d.ZERO);
			}

			return;
		}

		this.distanceTravelled += velocity.length();
		this.setPosition(end);
		this.updateRotationFromVelocity();
		this.updateSpin(18.0F);
		if (world.isClient()) {
			ClientBridge.get().entityTick(this);
		} else if (this.age > cfg.selfDestructTicks) {
			this.impact(this.getEntityPos(), velocity);
		}
	}

	private void impact(Vec3d pos, Vec3d velocity) {
		ServerWorld world = (ServerWorld)this.getEntityWorld();
		if (this.distanceTravelled < ConfigManager.get().weapons.rpg7.armingDistance) {
			// Unarmed warhead: the rocket breaks apart without detonating.
			BlockState debris = net.minecraft.block.Blocks.IRON_BLOCK.getDefaultState();
			world.spawnParticles(new BlockStateParticleEffect(ParticleTypes.BLOCK, debris), pos.x, pos.y, pos.z, 12, 0.2, 0.2, 0.2, 0.1);
			world.playSound(null, pos.x, pos.y, pos.z, SoundEvents.BLOCK_ANVIL_LAND, SoundCategory.NEUTRAL, 0.5F, 1.6F);
			this.discard();
			return;
		}

		Vec3d dir = velocity.lengthSquared() > 1.0E-6 ? velocity.normalize() : new Vec3d(0.0, -1.0, 0.0);
		OrdnanceExplosion.detonate(world, pos.subtract(dir.multiply(0.15)), this.profile(), this, this.getOwner(), dir);
		this.discard();
	}

	@Override
	public boolean shouldRender(double distance) {
		return distance < 256.0 * 256.0;
	}
}
