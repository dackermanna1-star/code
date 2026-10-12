package com.chaosunleashed.events.blackhole;

import com.chaosunleashed.registry.ModParticles;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.util.math.MathHelper;
import net.minecraft.world.World;

/**
 * The visible singularity of a Black Hole event: a black sphere with a swirling accretion disk. The event owns
 * all the physics (pull, destruction, growth); this entity only carries the radius to clients and spawns the
 * swirling particles.
 */
public class BlackHoleEntity extends Entity {
	private static final TrackedData<Float> RADIUS = DataTracker.registerData(BlackHoleEntity.class, TrackedDataHandlerRegistry.FLOAT);

	public BlackHoleEntity(EntityType<? extends BlackHoleEntity> type, World world) {
		super(type, world);
		this.noClip = true;
		this.setNoGravity(true);
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		builder.add(RADIUS, 0.5F);
	}

	public float getRadius() {
		return this.dataTracker.get(RADIUS);
	}

	public void setRadius(float radius) {
		this.dataTracker.set(RADIUS, radius);
	}

	@Override
	public void tick() {
		super.tick();
		World world = this.getEntityWorld();
		if (world.isClient()) {
			float radius = this.getRadius();
			int count = 2 + (int) (radius * 3);
			for (int i = 0; i < count; i++) {
				// Matter orbiting in the accretion disk plane, spiralling inward.
				double angle = this.random.nextDouble() * Math.PI * 2.0;
				double distance = radius * (1.4 + this.random.nextDouble() * 2.4);
				double x = this.getX() + Math.cos(angle) * distance;
				double z = this.getZ() + Math.sin(angle) * distance;
				double y = this.getY() + (this.random.nextDouble() - 0.5) * 0.3 * radius + Math.cos(angle) * distance * 0.35;
				double speed = 0.25 + 0.15 / Math.max(0.5, distance / radius);
				double vx = -Math.sin(angle) * speed - Math.cos(angle) * 0.06;
				double vz = Math.cos(angle) * speed - Math.sin(angle) * 0.06;
				world.addParticleClient(ModParticles.VOID_SWIRL, x, y, z, vx, -Math.cos(angle) * 0.02, vz);
			}
			if (this.random.nextInt(2) == 0) {
				double r = radius * 6.0;
				world.addParticleClient(net.minecraft.particle.ParticleTypes.REVERSE_PORTAL,
					this.getX() + (this.random.nextDouble() - 0.5) * r, this.getY() + (this.random.nextDouble() - 0.5) * r,
					this.getZ() + (this.random.nextDouble() - 0.5) * r, 0.0, 0.0, 0.0);
			}
		}
	}

	@Override
	public boolean shouldRender(double distance) {
		return distance < 384.0 * 384.0;
	}

	@Override
	public boolean damage(ServerWorld world, DamageSource source, float amount) {
		return false;
	}

	@Override
	public boolean isAttackable() {
		return false;
	}

	@Override
	protected void readCustomData(ReadView view) {
		this.setRadius(MathHelper.clamp(view.getFloat("Radius", 0.5F), 0.1F, 16.0F));
	}

	@Override
	protected void writeCustomData(WriteView view) {
		view.putFloat("Radius", this.getRadius());
	}
}
