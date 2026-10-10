package dev.overkill.weapon;

import dev.overkill.network.Fx;
import dev.overkill.network.FxKind;
import dev.overkill.registry.ModDamageTypes;
import dev.overkill.registry.ModEffects;
import dev.overkill.registry.ModGameRules;
import dev.overkill.util.Devastation;
import dev.overkill.util.SafeLanding;
import dev.overkill.util.ServerProcesses;
import dev.overkill.util.Targeting;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.BaseFireBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Lightning logic for the Stormcaller Gauntlet: chain arcs, Thunder Call strikes and the Thunderfall Slam. */
public final class StormcallerLogic {
	/** How long a punched target counts as "recently hit" for Thunder Call. */
	public static final long RECENT_WINDOW = 15 * 20;
	public static final double SLAM_RADIUS = 13.0;

	private static final Map<UUID, Map<UUID, Long>> RECENT_HITS = new HashMap<>();
	private static final Map<UUID, Slam> SLAMS = new HashMap<>();

	private record Slam(long startTick) {
	}

	private StormcallerLogic() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(StormcallerLogic::tickSlams);
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
			RECENT_HITS.clear();
			SLAMS.clear();
		});
	}

	// ------------------------------------------------------------------------------------------
	// Punch memory
	// ------------------------------------------------------------------------------------------

	public static void recordHit(Player player, Entity target) {
		RECENT_HITS.computeIfAbsent(player.getUUID(), key -> new HashMap<>()).put(target.getUUID(), player.level().getGameTime());
	}

	public static List<LivingEntity> recentTargets(ServerLevel level, Player player, double range) {
		List<LivingEntity> result = new ArrayList<>();
		Map<UUID, Long> hits = RECENT_HITS.get(player.getUUID());
		if (hits == null) {
			return result;
		}
		long now = level.getGameTime();
		Iterator<Map.Entry<UUID, Long>> iterator = hits.entrySet().iterator();
		while (iterator.hasNext()) {
			Map.Entry<UUID, Long> entry = iterator.next();
			if (now - entry.getValue() > RECENT_WINDOW) {
				iterator.remove();
				continue;
			}
			if (level.getEntity(entry.getKey()) instanceof LivingEntity living && living.isAlive() && living.distanceTo(player) <= range) {
				result.add(living);
			}
		}
		return result;
	}

	// ------------------------------------------------------------------------------------------
	// Lightning
	// ------------------------------------------------------------------------------------------

	/** Sends a visible arc from {@code from} to {@code to}. */
	public static void arc(ServerLevel level, Vec3 from, Vec3 to, float thickness) {
		Fx.send(level, from, 96.0, FxKind.ARC, from, to, thickness, level.random.nextInt());
	}

	/**
	 * Chain lightning: jumps from {@code first} to up to {@code jumps} further enemies within 7 blocks,
	 * losing 20% damage per jump. Every target is electrified.
	 */
	public static void chain(ServerLevel level, Entity attacker, LivingEntity first, Vec3 origin, int jumps, float damage) {
		Set<Integer> hit = new HashSet<>();
		LivingEntity current = first;
		Vec3 from = origin;
		float dmg = damage;
		for (int i = 0; i <= jumps && current != null; i++) {
			hit.add(current.getId());
			Vec3 to = current.getBoundingBox().getCenter();
			arc(level, from, to, i == 0 ? 1.2F : 0.9F);
			zap(level, attacker, current, dmg);
			from = to;
			dmg *= 0.8F;
			current = nearestUnhit(level, attacker, to, 7.0, hit);
		}
		level.playSound(null, origin.x, origin.y, origin.z, SoundEvents.LIGHTNING_BOLT_IMPACT, SoundSource.PLAYERS, 0.7F, 1.7F + level.random.nextFloat() * 0.2F);
	}

	private static void zap(ServerLevel level, Entity attacker, LivingEntity target, float damage) {
		target.invulnerableTime = 0;
		target.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.STORM, attacker), damage);
		target.addEffect(new MobEffectInstance(ModEffects.ELECTRIFIED, 60, 0), attacker);
	}

	private static @Nullable LivingEntity nearestUnhit(ServerLevel level, Entity attacker, Vec3 from, double range, Set<Integer> hit) {
		LivingEntity best = null;
		double bestDist = range * range;
		for (LivingEntity candidate : level.getEntitiesOfClass(LivingEntity.class, new AABB(from, from).inflate(range),
			e -> !hit.contains(e.getId()) && Targeting.canHurt(attacker, e))) {
			double d = candidate.getBoundingBox().getCenter().distanceToSqr(from);
			if (d < bestDist) {
				bestDist = d;
				best = candidate;
			}
		}
		return best;
	}

	/** A lightning column on {@code target}: cosmetic bolt + our own damage, fire and a short chain. */
	public static void strike(ServerLevel level, Entity attacker, LivingEntity target, float damage) {
		Vec3 pos = target.position();
		spawnBolt(level, pos);
		target.invulnerableTime = 0;
		target.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.STORM, attacker), damage);
		target.addEffect(new MobEffectInstance(ModEffects.ELECTRIFIED, 100, 1), attacker);
		target.igniteForSeconds(4.0F);
		target.push(0.0, 0.5, 0.0);
		target.hurtMarked = true;
		Fx.send(level, pos, 128.0, FxKind.THUNDER_STRIKE, pos, Vec3.ZERO, 1.0F, level.random.nextInt());
		igniteGround(level, BlockPos.containing(pos), level.random);
		chain(level, attacker, target, target.getBoundingBox().getCenter(), 2, damage * 0.4F);
	}

	public static void spawnBolt(ServerLevel level, Vec3 pos) {
		LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(level, EntitySpawnReason.TRIGGERED);
		if (bolt != null) {
			bolt.snapTo(pos.x, pos.y, pos.z);
			bolt.setVisualOnly(true);
			level.addFreshEntity(bolt);
		}
	}

	private static void igniteGround(ServerLevel level, BlockPos pos, RandomSource random) {
		if (!ModGameRules.fire(level) || random.nextInt(2) != 0) {
			return;
		}
		for (int dy = 1; dy >= -2; dy--) {
			BlockPos at = pos.above(dy);
			BlockPos below = at.below();
			if (level.getBlockState(at).isAir() && level.getBlockState(below).isFaceSturdy(level, below, Direction.UP)) {
				level.setBlock(at, BaseFireBlock.getState(level, at), Block.UPDATE_ALL);
				return;
			}
		}
	}

	/**
	 * Thunder Call: lightning on everything punched in the last 15 seconds (or, failing that, on the
	 * nearest monsters). Returns how many targets were struck.
	 */
	public static int thunderCall(ServerLevel level, Player player, int charge) {
		List<LivingEntity> targets = recentTargets(level, player, 64.0);
		if (targets.isEmpty()) {
			targets = level.getEntitiesOfClass(LivingEntity.class, player.getBoundingBox().inflate(24.0),
				e -> e instanceof Enemy && Targeting.canHurt(player, e));
			targets.sort((a, b) -> Double.compare(a.distanceToSqr(player), b.distanceToSqr(player)));
			if (targets.size() > 6) {
				targets = new ArrayList<>(targets.subList(0, 6));
			}
		}
		float damage = 8.0F + 2.2F * charge;
		for (int i = 0; i < targets.size(); i++) {
			LivingEntity target = targets.get(i);
			ServerProcesses.later(level, 1 + i * 2, () -> {
				if (target.isAlive()) {
					strike(level, player, target, damage);
				}
			});
		}
		RECENT_HITS.remove(player.getUUID());
		return targets.size();
	}

	// ------------------------------------------------------------------------------------------
	// Thunderfall Slam
	// ------------------------------------------------------------------------------------------

	public static void startSlam(ServerPlayer player) {
		Vec3 look = player.getViewVector(1.0F);
		Vec3 flat = new Vec3(look.x, 0.0, look.z);
		flat = flat.lengthSqr() < 1.0E-4 ? Vec3.ZERO : flat.normalize();
		player.setDeltaMovement(flat.x * 1.1, 1.35, flat.z * 1.1);
		player.hurtMarked = true;
		SafeLanding.protect(player, 200);
		SLAMS.put(player.getUUID(), new Slam(player.level().getGameTime()));
		ServerLevel level = player.level();
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.TRIDENT_RIPTIDE_3, SoundSource.PLAYERS, 1.2F, 0.8F);
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.PLAYERS, 0.8F, 1.7F);
		arc(level, player.position(), player.position().add(0.0, 3.0, 0.0), 1.0F);
	}

	private static void tickSlams(MinecraftServer server) {
		if (SLAMS.isEmpty()) {
			return;
		}
		Iterator<Map.Entry<UUID, Slam>> iterator = SLAMS.entrySet().iterator();
		while (iterator.hasNext()) {
			Map.Entry<UUID, Slam> entry = iterator.next();
			ServerPlayer player = server.getPlayerList().getPlayer(entry.getKey());
			if (player == null || !player.isAlive()) {
				iterator.remove();
				continue;
			}
			ServerLevel level = player.level();
			long age = level.getGameTime() - entry.getValue().startTick();
			if (age > 200) {
				iterator.remove();
				continue;
			}
			if (age > 3 && (player.onGround() || player.isInWater())) {
				iterator.remove();
				slam(level, player);
				continue;
			}
			Vec3 motion = player.getDeltaMovement();
			if (age > 7 && motion.y < 0.15) {
				player.setDeltaMovement(motion.x * 0.98, Math.max(motion.y - 0.4, -3.2), motion.z * 0.98);
				player.hurtMarked = true;
				SafeLanding.protect(player, 60);
				if (age % 2 == 0) {
					Vec3 p = player.position();
					arc(level, p.add(0.0, 2.0, 0.0), p.add(level.random.nextGaussian(), -1.5, level.random.nextGaussian()), 0.7F);
				}
			}
		}
	}

	private static void slam(ServerLevel level, ServerPlayer player) {
		Vec3 center = player.position();
		SafeLanding.protect(player, 20);
		Fx.send(level, center, 160.0, FxKind.STORM_SLAM, center, Vec3.ZERO, (float) SLAM_RADIUS, level.random.nextInt());
		Fx.shake(level, center, 48.0, 4.5F, 26);
		level.playSound(null, center.x, center.y, center.z, SoundEvents.MACE_SMASH_GROUND_HEAVY, SoundSource.PLAYERS, 2.5F, 0.7F);
		level.playSound(null, center.x, center.y, center.z, SoundEvents.GENERIC_EXPLODE, SoundSource.PLAYERS, 3.0F, 0.7F);
		level.playSound(null, center.x, center.y, center.z, SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.PLAYERS, 4.0F, 0.8F);
		spawnBolt(level, center);
		Devastation.ejectDebris(level, center, 3.0, 8, 0.8, level.random);
		ServerProcesses.add(level, new Shockwave(player, center));
	}

	/** The slam's expanding ring of lightning: hits each target once as the front passes over it. */
	private static final class Shockwave implements ServerProcesses.Process {
		private static final double SPEED = 1.15;
		private final Player owner;
		private final Vec3 center;
		private final Set<Integer> hit = new HashSet<>();
		private int age;

		Shockwave(Player owner, Vec3 center) {
			this.owner = owner;
			this.center = center;
		}

		@Override
		public boolean tick(ServerLevel level) {
			this.age++;
			double radius = this.age * SPEED;
			if (radius > SLAM_RADIUS) {
				return true;
			}
			Fx.send(level, this.center, 128.0, FxKind.STORM_RING, this.center, Vec3.ZERO, (float) radius, this.age);
			double inner = Math.max(0.0, radius - 1.6);
			AABB box = new AABB(this.center, this.center).inflate(radius + 1.0, 4.0, radius + 1.0);
			for (Entity entity : level.getEntities(this.owner, box, e -> e instanceof LivingEntity && Targeting.canHurt(this.owner, e))) {
				Vec3 offset = entity.position().subtract(this.center);
				double flat = Math.sqrt(offset.x * offset.x + offset.z * offset.z);
				if (flat < inner || flat > radius + 0.6 || !this.hit.add(entity.getId())) {
					continue;
				}
				LivingEntity living = (LivingEntity) entity;
				float falloff = (float) (1.0 - radius / (SLAM_RADIUS + 3.0));
				living.invulnerableTime = 0;
				living.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.STORM, this.owner), 8.0F + 20.0F * falloff);
				living.addEffect(new MobEffectInstance(ModEffects.ELECTRIFIED, 100, 1), this.owner);
				living.igniteForSeconds(3.0F);
				Vec3 out = flat < 1.0E-3 ? Vec3.ZERO : new Vec3(offset.x / flat, 0.0, offset.z / flat);
				living.push(out.x * 1.1, 0.95, out.z * 1.1);
				living.hurtMarked = true;
			}
			if (this.age % 2 == 0) {
				RandomSource random = level.random;
				int bolts = 2 + (int) (radius / 3.0);
				for (int i = 0; i < bolts; i++) {
					double angle = random.nextDouble() * Math.PI * 2.0;
					int x = (int) Math.floor(this.center.x + Math.cos(angle) * radius);
					int z = (int) Math.floor(this.center.z + Math.sin(angle) * radius);
					int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
					if (Math.abs(y - this.center.y) > 8) {
						y = (int) Math.floor(this.center.y);
					}
					BlockPos ground = new BlockPos(x, y - 1, z);
					if (i == 0) {
						spawnBolt(level, Vec3.atBottomCenterOf(ground.above()));
					}
					if (random.nextFloat() < 0.35F) {
						Devastation.scorchBlock(level, ground, random, 0.5F);
					}
					igniteGround(level, ground.above(), random);
				}
			}
			return false;
		}
	}
}
