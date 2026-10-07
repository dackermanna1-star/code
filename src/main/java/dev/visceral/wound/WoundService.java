package dev.visceral.wound;

import dev.visceral.VisceralConfig;
import dev.visceral.blood.BloodType;
import dev.visceral.blood.BloodTypes;
import dev.visceral.network.HitFxPayload;
import dev.visceral.network.VisceralNetworking;
import dev.visceral.registry.VisceralAttachments;
import dev.visceral.registry.VisceralDamageTypes;
import dev.visceral.registry.VisceralEffects;
import java.util.List;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/** Server side: records wounds, applies bleeding and broadcasts hit effects. */
public final class WoundService {
	private static final int PRUNE_INTERVAL = 200;
	/** Damage sources that tick repeatedly only leave a new wound this often per entity. */
	private static final long REPEAT_WOUND_COOLDOWN = 30L;

	private WoundService() {
	}

	public static void init() {
		ServerTickEvents.END_WORLD_TICK.register(WoundService::pruneHealedWounds);
	}

	/**
	 * Called at the end of {@code LivingEntity.hurtServer} when damage went through.
	 *
	 * @param amount     incoming damage (after shields, before armor)
	 * @param healthLost health + absorption actually removed
	 */
	public static void onDamaged(LivingEntity victim, ServerLevel level, DamageSource source, float amount, float healthLost) {
		VisceralConfig config = VisceralConfig.get();
		if (!config.wounds || source.is(VisceralDamageTypes.BLEEDING)) {
			return;
		}
		BloodType blood = BloodTypes.of(victim.getType());
		if (blood == BloodType.NONE) {
			return;
		}
		boolean lethal = victim.isDeadOrDying();
		float damage = Math.max(healthLost, amount * 0.35F);
		if (damage <= 0.01F && !lethal) {
			return;
		}

		RandomSource random = victim.getRandom();
		List<DamageClassifier.Hit> hits = DamageClassifier.classify(victim, source, damage, random);
		if (hits.isEmpty()) {
			return;
		}

		long gameTime = level.getGameTime();
		WoundData data = victim.getAttachedOrElse(VisceralAttachments.WOUNDS, WoundData.EMPTY);
		boolean repeating = isRepeatingSource(source);
		boolean addedWound = false;
		int bleedTicks = 0;
		float maxSeverity = 0.0F;
		boolean critical = source.getEntity() instanceof Player player && player.fallDistance > 0.0F && !player.onGround()
			&& source.getDirectEntity() == player;

		for (int i = 0; i < hits.size(); i++) {
			DamageClassifier.Hit hit = hits.get(i);
			int seed = random.nextInt();
			boolean leavesWound = config.maxWoundsPerEntity > 0 && (!repeating || !recentlyWounded(data, hit.type(), gameTime));
			if (leavesWound) {
				Vec3 originWorld = hit.point().subtract(hit.dir().scale(0.75)).subtract(victim.position());
				Vector3f origin = BodyFrame.toBody(originWorld, victim.yBodyRot);
				Vector3f dir = BodyFrame.toBody(hit.dir(), victim.yBodyRot).normalize();
				float severity = critical ? Math.min(2.5F, hit.severity() * 1.35F) : hit.severity();
				Wound wound = new Wound(hit.type(), severity, origin, dir, hit.roll(), seed, gameTime);
				data = data.with(wound, config.maxWoundsPerEntity, gameTime, config.woundHealSeconds * 20L);
				addedWound = true;
				if (blood.bleeds()) {
					bleedTicks = Math.max(bleedTicks, wound.bleedTicks(config.bleedDurationMultiplier));
				}
				maxSeverity = Math.max(maxSeverity, severity);
			}

			int flags = 0;
			if (lethal && i == 0) {
				flags |= HitFxPayload.LETHAL;
			}
			if (critical) {
				flags |= HitFxPayload.CRITICAL;
			}
			if (hit.explosion()) {
				flags |= HitFxPayload.EXPLOSION;
			}
			if (!leavesWound) {
				flags |= HitFxPayload.NO_WOUND;
			}
			Vec3 dir = hit.dir();
			VisceralNetworking.sendToTrackingAndSelf(victim, new HitFxPayload(
				victim.getId(), hit.point().x, hit.point().y, hit.point().z, (float) dir.x, (float) dir.y, (float) dir.z,
				hit.type(), damage / hits.size(), flags, seed
			));
		}

		if (addedWound) {
			victim.setAttached(VisceralAttachments.WOUNDS, data);
		}
		if (!lethal && bleedTicks > 0) {
			applyBleeding(victim, bleedTicks, maxSeverity, config);
		}
	}

	private static void applyBleeding(LivingEntity victim, int ticks, float severity, VisceralConfig config) {
		if (!config.bleedingDamage || victim instanceof Player && !config.playersBleed) {
			return;
		}
		MobEffectInstance existing = victim.getEffect(VisceralEffects.BLEEDING);
		int amplifier = severity > 1.4F ? 1 : 0;
		if (existing != null) {
			amplifier = Math.min(2, Math.max(amplifier, existing.getAmplifier() + (severity > 0.6F ? 1 : 0)));
			ticks = Math.max(ticks, existing.getDuration());
		}
		victim.addEffect(new MobEffectInstance(VisceralEffects.BLEEDING, ticks, amplifier, false, false, true));
	}

	private static boolean isRepeatingSource(DamageSource source) {
		Entity direct = source.getDirectEntity();
		return direct == null && source.getEntity() == null;
	}

	private static boolean recentlyWounded(WoundData data, WoundType type, long gameTime) {
		for (Wound wound : data.wounds()) {
			if (wound.type() == type && gameTime - wound.time() < REPEAT_WOUND_COOLDOWN) {
				return true;
			}
		}
		return false;
	}

	private static void pruneHealedWounds(ServerLevel level) {
		if (level.getGameTime() % PRUNE_INTERVAL != 0) {
			return;
		}
		long healTicks = VisceralConfig.get().woundHealSeconds * 20L;
		long gameTime = level.getGameTime();
		for (Entity entity : level.getAllEntities()) {
			if (entity instanceof LivingEntity living && living.hasAttached(VisceralAttachments.WOUNDS)) {
				WoundData data = living.getAttached(VisceralAttachments.WOUNDS);
				WoundData pruned = data.pruned(gameTime, healTicks);
				if (pruned.isEmpty()) {
					living.removeAttached(VisceralAttachments.WOUNDS);
				} else if (pruned != data) {
					living.setAttached(VisceralAttachments.WOUNDS, pruned);
				}
			}
		}
	}
}
