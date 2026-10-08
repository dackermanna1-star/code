package dev.portalgun.block;

import dev.portalgun.content.ContentSpec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Contact / ambient behaviour shared by every spec-driven block class: hazard damage, status effects, bounce and
 * particles. Resolved once from the {@link ContentSpec.BlockSpec} when the block is constructed.
 */
public final class SpecBehavior {
	public static final SpecBehavior NONE = new SpecBehavior(null, 0, null, 0, 0, null, 0, false, null);

	public final @Nullable String kind;
	/** Damage per hit (two hits per second at most because of invulnerability frames). */
	public final float damagePerHit;
	public final @Nullable String damageType;
	public final float bounce;
	public final @Nullable Holder<MobEffect> effect;
	public final int effectTicks;
	public final int effectAmplifier;
	public final @Nullable ParticleOptions particle;
	public final boolean vent;

	private SpecBehavior(@Nullable String kind, float damagePerHit, @Nullable String damageType, float bounce, int effectTicks,
		@Nullable Holder<MobEffect> effect, int effectAmplifier, boolean vent, @Nullable ParticleOptions particle) {
		this.kind = kind;
		this.damagePerHit = damagePerHit;
		this.damageType = damageType;
		this.bounce = bounce;
		this.effect = effect;
		this.effectTicks = effectTicks;
		this.effectAmplifier = effectAmplifier;
		this.vent = vent;
		this.particle = particle;
	}

	public static SpecBehavior of(ContentSpec.BlockSpec spec) {
		float damage = spec.damage;
		if ("hazard".equals(spec.kind) && damage <= 0 && spec.effect == null) {
			damage = 1.0F;
		}
		ParticleOptions particle = BlockLookups.particle(spec.particle);
		boolean vent = "vent".equals(spec.kind);
		if (vent && particle == null) {
			particle = net.minecraft.core.particles.ParticleTypes.CAMPFIRE_COSY_SMOKE;
		}
		return new SpecBehavior(spec.kind, Math.max(0, damage) * 0.5F, spec.damageType, Math.max(0, Math.min(1.5F, spec.bounce)),
			Math.max(1, spec.effectSeconds) * 20, BlockLookups.effect(spec.effect), Math.max(0, spec.effectAmplifier), vent, particle);
	}

	public boolean hasContact() {
		return this.damagePerHit > 0 || this.effect != null;
	}

	/** Standing on top of the block (full blocks). */
	public void stepOn(Level level, BlockPos pos, Entity entity) {
		if (!this.hasContact() || !(level instanceof ServerLevel server) || !(entity instanceof LivingEntity living)) {
			return;
		}
		if (entity.isSteppingCarefully() && this.damagePerHit > 0 && this.effect == null) {
			return;
		}
		this.touch(server, living);
	}

	/** Walking through the block (plants, vines). */
	public void inside(Level level, Entity entity) {
		if (!this.hasContact() || !(level instanceof ServerLevel server) || !(entity instanceof LivingEntity living)) {
			return;
		}
		if (this.damagePerHit > 0) {
			entity.makeStuckInBlock(level.getBlockState(entity.blockPosition()), new Vec3(0.8F, 0.75, 0.8F));
			double dx = Math.abs(entity.getX() - entity.xOld);
			double dz = Math.abs(entity.getZ() - entity.zOld);
			if (dx < 0.003 && dz < 0.003 && this.effect == null) {
				return;
			}
		}
		this.touch(server, living);
	}

	private void touch(ServerLevel server, LivingEntity living) {
		if (this.damagePerHit > 0) {
			living.hurtServer(server, BlockLookups.damage(server.damageSources(), this.damageType), this.damagePerHit);
		}
		if (this.effect != null && !living.hasEffect(this.effect)) {
			living.addEffect(new MobEffectInstance(this.effect, this.effectTicks, this.effectAmplifier));
		}
	}

	/** Returns true when the bounce was handled. */
	public boolean bounce(BlockGetter level, Entity entity) {
		if (this.bounce <= 0 || entity.isSuppressingBounce()) {
			return false;
		}
		Vec3 v = entity.getDeltaMovement();
		if (v.y < 0.0) {
			double factor = entity instanceof LivingEntity ? 1.0 : 0.8;
			entity.setDeltaMovement(v.x, -v.y * this.bounce * factor, v.z);
		}
		return true;
	}

	/** Client ambience: vents puff upward, other blocks drift their particle now and then. */
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (this.particle == null) {
			return;
		}
		if (this.vent) {
			if (!level.getBlockState(pos.above()).isAir() && level.getFluidState(pos.above()).isEmpty()) {
				return;
			}
			int n = 1 + random.nextInt(2);
			for (int i = 0; i < n; i++) {
				double x = pos.getX() + 0.5 + (random.nextDouble() - 0.5) * 0.5;
				double z = pos.getZ() + 0.5 + (random.nextDouble() - 0.5) * 0.5;
				level.addAlwaysVisibleParticle(this.particle, true, x, pos.getY() + 1.05, z,
					(random.nextDouble() - 0.5) * 0.02, 0.06 + random.nextDouble() * 0.08, (random.nextDouble() - 0.5) * 0.02);
			}
			return;
		}
		boolean small = this.kind != null && switch (this.kind) {
			case "plant", "tall_plant", "hanging_plant", "crystal_cluster", "vine", "lily", "carpet" -> true;
			default -> false;
		};
		if (random.nextInt(small ? 6 : 10) != 0) {
			return;
		}
		double x = pos.getX() + random.nextDouble();
		double z = pos.getZ() + random.nextDouble();
		double y;
		if (small) {
			y = pos.getY() + 0.3 + random.nextDouble() * 0.6;
		} else if ("leaves".equals(this.kind)) {
			if (!level.getBlockState(pos.below()).isAir()) {
				return;
			}
			y = pos.getY() - 0.05;
		} else {
			if (!level.getBlockState(pos.above()).isAir()) {
				return;
			}
			y = pos.getY() + 1.05;
		}
		level.addParticle(this.particle, x, y, z, 0.0, small ? 0.01 : 0.02, 0.0);
	}
}
