package dev.juukulius.entity;

import dev.juukulius.character.JuliusServer;
import dev.juukulius.combat.CombatUtil;
import dev.juukulius.network.FxType;
import dev.juukulius.network.JuliusNetworking;
import dev.juukulius.particle.ParticleDensity;
import dev.juukulius.registry.JuliusDamageTypes;
import dev.juukulius.registry.JuliusEntities;
import dev.juukulius.registry.JuliusParticles;
import dev.juukulius.registry.JuliusSounds;
import dev.juukulius.spirit.Spirit;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Al Clauzeria: the six spirits circle Julius and join into one whirling rainbow vortex of light shot from the sword's
 * tip. On impact the torrent of light explodes into a shockwave that sends opponents flying.
 */
public class ClauzeriaVortexEntity extends JuliusProjectile {
	public static final double BURST_RADIUS = 4.8;

	public ClauzeriaVortexEntity(EntityType<? extends ClauzeriaVortexEntity> type, Level level) {
		super(type, level);
		this.lifetime = 22;
	}

	public ClauzeriaVortexEntity(Level level, ServerPlayer owner, Vec3 position, Vec3 direction) {
		this(JuliusEntities.AL_CLAUZERIA_VORTEX, level);
		this.launch(owner, position, direction, 1.35);
	}

	@Override
	protected void defineSynchedData(net.minecraft.network.syncher.SynchedEntityData.Builder builder) {
	}

	@Override
	protected boolean sweepEntities(ServerLevel level, Vec3 from, Vec3 to) {
		for (EntityHitResult hit : this.sweepHits(level, from, to, 0.6)) {
			if (hit.getEntity() instanceof LivingEntity) {
				this.setPos(hit.getLocation());
				this.burst(level, hit.getLocation());
				this.discard();
				return true;
			}
		}

		return false;
	}

	@Override
	protected void onBlockImpact(ServerLevel level, BlockHitResult hit) {
		this.burst(level, hit.getLocation());
		this.discard();
	}

	@Override
	protected void onExpire(ServerLevel level) {
		this.burst(level, this.position());
	}

	private void burst(ServerLevel level, Vec3 center) {
		ServerPlayer owner = this.ownerPlayer();
		if (owner != null) {
			boolean empowered = dev.juukulius.character.JuliusAttachments.data(owner).ultimateActive();
			double radius = BURST_RADIUS * (empowered ? 1.2 : 1.0);
			for (LivingEntity target : CombatUtil.targetsInSphere(owner, center, radius)) {
				double distance = CombatUtil.closestPoint(target.getBoundingBox(), center).distanceTo(center);
				float falloff = (float) Mth.clamp(1.0 - distance / (radius * 1.8), 0.5, 1.0);
				if (CombatUtil.damage(owner, target, JuliusDamageTypes.RAINBOW, this, 16.0F * falloff * (empowered ? 1.3F : 1.0F))) {
					CombatUtil.knockback(target, CombatUtil.horizontalDirection(center, target.position(), this.getDeltaMovement()), 1.8 * falloff, 0.55);
				}
			}
		}

		JuliusNetworking.sendFx(level, FxType.CLAUZERIA_BURST, null, center, this.getDeltaMovement().normalize(), 0xFFFFFF, (float) BURST_RADIUS);
		JuliusServer.playSoundAt(level, center, JuliusSounds.CLAUZERIA_BURST, 1.2F, 1.0F);
	}

	@Override
	protected void spawnTrail(Vec3 position, Vec3 motion) {
		int count = ParticleDensity.scale(6, this.random);
		Vec3 heading = motion.normalize();
		Vec3 side = heading.cross(new Vec3(0.0, 1.0, 0.0));
		side = side.lengthSqr() < 1.0E-6 ? new Vec3(1.0, 0.0, 0.0) : side.normalize();
		Vec3 up = side.cross(heading).normalize();
		for (int i = 0; i < count; i++) {
			Spirit spirit = Spirit.byIndex(this.tickCount + i);
			double angle = (this.tickCount * 0.9 + i * Math.PI / 3.0);
			double radius = 0.45 + 0.15 * Math.sin(this.tickCount * 0.5 + i);
			Vec3 p = position.add(side.scale(Math.cos(angle) * radius)).add(up.scale(Math.sin(angle) * radius))
				.subtract(heading.scale(this.random.nextDouble() * motion.length()));
			this.level().addParticle(JuliusParticles.of(JuliusParticles.GLOW_SPARK, spirit.color, 1.2F), p.x, p.y, p.z, 0.0, 0.0, 0.0);
		}
	}
}
