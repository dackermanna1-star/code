package com.chaosunleashed.events.rift;

import com.chaosunleashed.registry.ModParticles;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.data.DataTracker;
import net.minecraft.entity.data.TrackedData;
import net.minecraft.entity.data.TrackedDataHandlerRegistry;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.storage.ReadView;
import net.minecraft.storage.WriteView;
import net.minecraft.world.World;

/**
 * The glowing crack in the sky of a Dimension Rift. Purely visual (no collision, invulnerable, never saved);
 * the event controls how far it is open.
 */
public class RiftEntity extends Entity {
	private static final TrackedData<Float> OPENNESS = DataTracker.registerData(RiftEntity.class, TrackedDataHandlerRegistry.FLOAT);
	private static final TrackedData<Boolean> END = DataTracker.registerData(RiftEntity.class, TrackedDataHandlerRegistry.BOOLEAN);

	public RiftEntity(EntityType<? extends RiftEntity> type, World world) {
		super(type, world);
		this.noClip = true;
		this.setNoGravity(true);
	}

	@Override
	protected void initDataTracker(DataTracker.Builder builder) {
		builder.add(OPENNESS, 0.0F);
		builder.add(END, false);
	}

	public float getOpenness() {
		return this.dataTracker.get(OPENNESS);
	}

	public void setOpenness(float openness) {
		this.dataTracker.set(OPENNESS, openness);
	}

	public boolean isEnd() {
		return this.dataTracker.get(END);
	}

	public void setEnd(boolean end) {
		this.dataTracker.set(END, end);
	}

	@Override
	public void tick() {
		super.tick();
		World world = this.getEntityWorld();
		float open = this.getOpenness();
		if (world.isClient() && open > 0.05F) {
			for (int i = 0; i < 1 + (int) (open * 4); i++) {
				double dy = (this.random.nextDouble() - 0.5) * 24.0 * open;
				double dx = (this.random.nextDouble() - 0.5) * 3.0 * open;
				world.addParticleClient(ModParticles.RIFT_SPARK, this.getX() + dx, this.getY() + dy, this.getZ() + dx * 0.5,
					(this.random.nextDouble() - 0.5) * 0.1, -0.05 - this.random.nextDouble() * 0.1, (this.random.nextDouble() - 0.5) * 0.1);
			}
			if (this.random.nextInt(3) == 0) {
				world.addParticleClient(this.isEnd() ? ParticleTypes.REVERSE_PORTAL : ParticleTypes.FLAME, this.getX(), this.getY() - 12 * open,
					this.getZ(), 0.0, -0.2, 0.0);
			}
		}
	}

	@Override
	public boolean shouldRender(double distance) {
		return distance < 512.0 * 512.0;
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
	}

	@Override
	protected void writeCustomData(WriteView view) {
	}
}
