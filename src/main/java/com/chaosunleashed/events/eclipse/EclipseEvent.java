package com.chaosunleashed.events.eclipse;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.EventContext;
import com.chaosunleashed.core.SpawnHelper;
import com.chaosunleashed.registry.ModEntities;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundEvent;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;

/**
 * Eclipse: during the day a dark disk slowly covers the sun until it is almost pitch black (with a corona),
 * hostile mobs spawn as if it were night and Shade Stalkers hunt in the darkness. After 3-5 minutes the sun
 * gradually returns and every shadow creature dissolves.
 */
public class EclipseEvent extends ChaosEvent {
	private static final int COVER_TICKS = 600;
	private static final int UNCOVER_TICKS = 800;
	private float coverage;
	private boolean totality;

	public EclipseEvent(EventContext context) {
		super(context);
	}

	@Override
	protected int activeLength() {
		// 3-5 minutes by default (durationSeconds +- 60s).
		int base = super.activeLength();
		return Math.max(COVER_TICKS + UNCOVER_TICKS + 200, base + this.random.nextBetween(-1200, 1200));
	}

	@Override
	public Text warningTitle() {
		return Text.literal("⚠ The sun is going dark...").formatted(Formatting.DARK_PURPLE, Formatting.BOLD);
	}

	@Override
	public Text warningSubtitle() {
		return Text.literal("Something is crossing the sun. Light your torches.").formatted(Formatting.GRAY);
	}

	@Override
	protected SoundEvent warningSound() {
		return ModSounds.ECLIPSE_WARNING;
	}

	@Override
	public float clientValue() {
		return this.coverage;
	}

	@Override
	protected void tickWarning() {
		this.coverage = this.isWaitingForTime() ? 0.0F : 0.3F * this.phaseProgress();
	}

	@Override
	protected void onActiveStart() {
		this.actionBarAll(Text.literal("◐ The eclipse has begun. Darkness is falling...").formatted(Formatting.DARK_PURPLE));
	}

	@Override
	protected void tickActive() {
		int t = this.phaseTicks();
		int remaining = this.remainingTicks();
		if (t < COVER_TICKS) {
			this.coverage = MathHelper.lerp(t / (float) COVER_TICKS, 0.3F, 1.0F);
		} else if (remaining < UNCOVER_TICKS) {
			this.coverage = MathHelper.lerp(remaining / (float) UNCOVER_TICKS, 0.35F, 1.0F);
		} else {
			this.coverage = 1.0F;
		}
		if (!this.totality && this.coverage >= 0.999F) {
			this.totality = true;
			this.playSoundToAll(ModSounds.ECLIPSE_TOTALITY, 1.0F, 0.8F);
			this.actionBarAll(Text.literal("◉ TOTALITY. The Shade Stalkers awaken.").formatted(Formatting.DARK_PURPLE, Formatting.BOLD));
		}
		if (remaining == UNCOVER_TICKS) {
			this.actionBarAll(Text.literal("◑ The sun is starting to return...").formatted(Formatting.YELLOW));
		}

		if (this.coverage > 0.6F && t % 20 == 0) {
			this.spawnMonsters();
		}
		if (t % 10 == 0) {
			for (ServerPlayerEntity player : this.players()) {
				this.world.spawnParticles(ModParticles.SHADOW_WISP, player.getX(), player.getY() + 2, player.getZ(),
					(int) (this.coverage * 6), 12, 4, 12, 0.01);
			}
		}
	}

	private void spawnMonsters() {
		int stalkerCap = Math.min(this.entityCap(), 2 + this.intensity * 2);
		int monsterCap = Math.min(this.entityCap(), 6 + this.intensity * 4);
		int stalkers = 0;
		int monsters = 0;
		for (Entity entity : this.trackedEntities()) {
			if (entity instanceof ShadeStalkerEntity) {
				stalkers++;
			} else {
				monsters++;
			}
		}
		for (ServerPlayerEntity player : this.vulnerablePlayers()) {
			// Shade Stalkers: roughly one every 8s per player at intensity 3, only near totality.
			if (this.coverage > 0.85F && stalkers < stalkerCap && this.random.nextInt(12) < this.intensity + 1) {
				BlockPos pos = SpawnHelper.findSurfaceSpawn(this.world, player.getBlockPos(), 14, 28, this.random);
				if (pos != null) {
					ShadeStalkerEntity stalker = ModEntities.SHADE_STALKER.create(this.world, net.minecraft.entity.SpawnReason.EVENT);
					if (stalker != null) {
						stalker.refreshPositionAndAngles(pos, this.random.nextFloat() * 360.0F, 0.0F);
						if (this.spawnTrackedMob(stalker)) {
							stalkers++;
							stalker.setTarget(player);
							this.world.spawnParticles(ModParticles.SHADOW_WISP, pos.getX() + 0.5, pos.getY() + 1, pos.getZ() + 0.5, 20, 0.4, 1.0, 0.4, 0.02);
						}
					}
				}
			}
			// Regular night monsters spawn as if it were night.
			if (monsters < monsterCap && this.random.nextInt(4) == 0) {
				EntityType<? extends MobEntity> type = switch (this.random.nextInt(4)) {
					case 0 -> EntityType.SKELETON;
					case 1 -> EntityType.SPIDER;
					case 2 -> EntityType.CREEPER;
					default -> EntityType.ZOMBIE;
				};
				BlockPos pos = SpawnHelper.findSurfaceSpawn(this.world, player.getBlockPos(), 20, 40, this.random);
				if (pos != null) {
					MobEntity mob = type.create(this.world, net.minecraft.entity.SpawnReason.EVENT);
					if (mob != null) {
						mob.refreshPositionAndAngles(pos, this.random.nextFloat() * 360.0F, 0.0F);
						if (this.spawnTrackedMob(mob)) {
							monsters++;
						}
					}
				}
			}
		}
	}

	@Override
	protected void onAftermathStart() {
		this.actionBarAll(Text.literal("☀ The sun returns. The shadows retreat.").formatted(Formatting.YELLOW));
	}

	@Override
	protected void tickAftermath() {
		this.coverage = MathHelper.lerp(this.phaseProgress(), 0.35F, 0.0F);
		// Shadows dissolve one by one as the light returns.
		if (this.phaseTicks() % 10 == 0) {
			for (Entity entity : this.trackedEntities()) {
				if (entity instanceof ShadeStalkerEntity && this.random.nextInt(4) == 0) {
					this.cleanupEntity(entity);
				}
			}
		}
	}

	@Override
	protected void cleanupEntity(Entity entity) {
		if (entity instanceof ShadeStalkerEntity) {
			this.world.spawnParticles(ParticleTypes.LARGE_SMOKE, entity.getX(), entity.getBodyY(0.5), entity.getZ(), 15, 0.3, 0.8, 0.3, 0.02);
			this.world.spawnParticles(ModParticles.SHADOW_WISP, entity.getX(), entity.getBodyY(0.5), entity.getZ(), 15, 0.3, 0.8, 0.3, 0.05);
			entity.discard();
		} else {
			super.cleanupEntity(entity);
		}
	}
}
