package dev.portalgun.gametest;

import dev.portalgun.creature.CreatureOrb;
import dev.portalgun.creature.SpecCreature;
import dev.portalgun.registry.ModCreatures;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Creature gallery + behaviour smoke test. Does nothing unless env PORTALGUN_TEST=creatures (optionally
 * "creatures:id1,id2" to restrict, PORTALGUN_CREATURE_PHASES=gallery,closeup,behavior to pick phases).
 * Screenshots land in build/run/clientGameTest/screenshots; behaviour results are logged as "[CreatureTest]" lines.
 */
public class CreatureGalleryTest implements FabricClientGameTest {
	private static final Map<String, Set<String>> HITS = new ConcurrentHashMap<>();

	@Override
	public void runTest(ClientGameTestContext context) {
		String mode = System.getenv().getOrDefault("PORTALGUN_TEST", "");
		if (!mode.startsWith("creatures")) {
			return;
		}
		List<String> ids = new ArrayList<>();
		String[] only = mode.contains(":") ? mode.substring(mode.indexOf(':') + 1).split(",") : new String[0];
		for (String id : ModCreatures.TYPES.keySet()) {
			if (only.length == 0 || List.of(only).contains(id)) {
				ids.add(id);
			}
		}
		String phases = System.getenv().getOrDefault("PORTALGUN_CREATURE_PHASES", "gallery,closeup,behavior");
		log("testing " + ids.size() + " creatures, phases " + phases);
		ServerLivingEntityEvents.ALLOW_DAMAGE.register((victim, source, amount) -> {
			Entity attacker = source.getEntity();
			if (victim instanceof ServerPlayer && attacker != null) {
				HITS.computeIfAbsent(EntityType.getKey(attacker.getType()).getPath(), k -> ConcurrentHashMap.newKeySet()).add(source.getMsgId());
			}
			return true;
		});
		try (TestSingleplayerContext sp = context.worldBuilder().create()) {
			sp.getClientWorld().waitForChunksRender();
			sp.getServer().runCommand("gamerule advance_time false");
			sp.getServer().runCommand("gamerule advance_weather false");
			sp.getServer().runCommand("gamerule spawn_mobs false");
			sp.getServer().runCommand("time set 6000");
			sp.getServer().runCommand("weather clear");
			sp.getServer().runCommand("difficulty normal");
			context.runOnClient(mc -> mc.options.hideGui = true);
			if (phases.contains("gallery")) {
				this.gallery(context, sp, ids);
			}
			if (phases.contains("closeup")) {
				this.closeups(context, sp, ids);
			}
			if (phases.contains("behavior")) {
				this.behavior(context, sp, ids);
			}
		}
	}

	private static void log(String s) {
		System.out.println("[CreatureTest] " + s);
	}

	private static ServerPlayer player(net.minecraft.server.MinecraftServer server) {
		return server.getPlayerList().getPlayers().get(0);
	}

	private static SpecCreature spawn(ServerLevel level, String id, double x, double y, double z, float yaw, boolean ai) {
		EntityType<SpecCreature> type = ModCreatures.TYPES.get(id);
		SpecCreature e = type.create(level, EntitySpawnReason.COMMAND);
		if (e == null) {
			return null;
		}
		e.snapTo(x, y, z, yaw, 0.0F);
		e.setYHeadRot(yaw);
		e.setYBodyRot(yaw);
		e.setNoAi(!ai);
		e.setPersistenceRequired();
		level.addFreshEntity(e);
		return e;
	}

	private static int groundY(ServerLevel level, int x, int z) {
		return level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z);
	}

	private static void clear(ServerLevel level, Vec3 c, double r) {
		for (Entity e : level.getEntities((Entity) null, new AABB(c, c).inflate(r), e -> e instanceof SpecCreature || e instanceof CreatureOrb)) {
			e.discard();
		}
	}

	/** Rows of up to 6 creatures in front of the camera. */
	private void gallery(ClientGameTestContext context, TestSingleplayerContext sp, List<String> ids) {
		int perRow = 6;
		for (int g = 0; g * perRow < ids.size(); g++) {
			List<String> group = ids.subList(g * perRow, Math.min(ids.size(), (g + 1) * perRow));
			int gi = g;
			sp.getServer().runOnServer(server -> {
				ServerPlayer p = player(server);
				p.setGameMode(GameType.SPECTATOR);
				ServerLevel level = p.level();
				double baseX = 0.5;
				double baseZ = 200.5 + gi * 40;
				double total = 0;
				double maxH = 0;
				List<Double> widths = new ArrayList<>();
				for (String id : group) {
					EntityType<SpecCreature> t = ModCreatures.TYPES.get(id);
					double w = Math.max(t.getWidth(), Math.min(3.0, t.getHeight() * 0.6)) + 1.2;
					widths.add(w);
					total += w;
					maxH = Math.max(maxH, t.getHeight());
				}
				double x = baseX - total / 2;
				double dist = Math.max(5.0, total * 0.75 + maxH * 0.5);
				int gy = groundY(level, (int) baseX, (int) (baseZ + dist));
				for (int i = 0; i < group.size(); i++) {
					String id = group.get(i);
					EntityType<SpecCreature> t = ModCreatures.TYPES.get(id);
					double cx = x + widths.get(i) / 2;
					x += widths.get(i);
					String mv = ModCreatures.spec(t).movement;
					double y = gy + (mv.equals("flying") || mv.equals("floating") ? 0.6 : 0.0);
					spawn(level, id, cx, y, baseZ + dist, 180.0F + 25.0F, false);
				}
				p.connection.teleport(baseX, gy + 1.2 + maxH * 0.55, baseZ, 0.0F, 14.0F);
			});
			context.waitTicks(25);
			sp.getClientWorld().waitForChunksRender();
			context.takeScreenshot("creatures_row_" + g);
			context.waitTicks(4);
			context.takeScreenshot("creatures_row_" + g + "_b");
			sp.getServer().runOnServer(server -> clear(player(server).level(), player(server).position(), 80));
		}
	}

	/** One close-up per creature (two frames a few ticks apart to check the idle animation). */
	private void closeups(ClientGameTestContext context, TestSingleplayerContext sp, List<String> ids) {
		int k = 0;
		for (String id : ids) {
			int kk = k++;
			sp.getServer().runOnServer(server -> {
				ServerPlayer p = player(server);
				p.setGameMode(GameType.SPECTATOR);
				ServerLevel level = p.level();
				EntityType<SpecCreature> t = ModCreatures.TYPES.get(id);
				double size = Math.max(t.getHeight(), t.getWidth() * 1.2);
				double dist = 1.6 + size * 1.5;
				double cx = 1000.5 + (kk % 8) * 30;
				double cz = 1000.5 + (kk / 8) * 30;
				int gy = groundY(level, (int) cx, (int) (cz + dist));
				String mv = ModCreatures.spec(t).movement;
				double y = gy + (mv.equals("flying") || mv.equals("floating") ? 0.4 : 0.0);
				spawn(level, id, cx, y, cz + dist, 180.0F + 35.0F, false);
				p.connection.teleport(cx, y + t.getHeight() * 0.6 + size * 0.35, cz, 0.0F, 18.0F);
			});
			context.waitTicks(15);
			sp.getClientWorld().waitForChunksRender();
			context.takeScreenshot("creature_" + id);
			context.waitTicks(6);
			context.takeScreenshot("creature_" + id + "_b");
			sp.getServer().runOnServer(server -> clear(player(server).level(), player(server).position(), 40));
		}
	}

	/** Spawn everything with AI around a survival player and log what each creature did. */
	private void behavior(ClientGameTestContext context, TestSingleplayerContext sp, List<String> ids) {
		Map<String, Vec3> start = new LinkedHashMap<>();
		Map<String, Integer> uuids = new HashMap<>();
		Map<String, double[]> stats = new ConcurrentHashMap<>();
		HITS.clear();
		double ox = -300.5;
		double oz = -300.5;
		sp.getServer().runOnServer(server -> {
			ServerPlayer p = player(server);
			ServerLevel level = p.level();
			int gy = groundY(level, (int) ox, (int) oz);
			// a pond for the swimmers, 10 blocks north of the player
			for (int dx = -5; dx <= 5; dx++) {
				for (int dz = -5; dz <= 5; dz++) {
					for (int dy = 1; dy <= 3; dy++) {
						level.setBlockAndUpdate(BlockPos.containing(ox + dx, gy - dy, oz - 12 + dz), Blocks.WATER.defaultBlockState());
					}
				}
			}
			p.setGameMode(GameType.SURVIVAL);
			p.connection.teleport(ox, gy, oz, 180.0F, 20.0F);
			p.addEffect(new MobEffectInstance(MobEffects.RESISTANCE, 20 * 120, 4, false, false));
			p.addEffect(new MobEffectInstance(MobEffects.REGENERATION, 20 * 120, 4, false, false));
			p.addEffect(new MobEffectInstance(MobEffects.SATURATION, 20 * 120, 4, false, false));
			int i = 0;
			for (String id : ids) {
				EntityType<SpecCreature> t = ModCreatures.TYPES.get(id);
				String mv = ModCreatures.spec(t).movement;
				double a = i * 2.39996;
				double r = 7 + (i % 5) * 1.5;
				double x = ox + Math.cos(a) * r;
				double z = oz + Math.sin(a) * r;
				double y;
				if (mv.equals("swimming")) {
					x = ox + (i % 5) - 2;
					z = oz - 12 + (i % 3) - 1;
					y = gy - 2.5;
				} else {
					y = groundY(level, (int) Math.floor(x), (int) Math.floor(z)) + (mv.equals("flying") || mv.equals("floating") ? 2.0 : 0.0);
				}
				SpecCreature e = spawn(level, id, x, y, z, (float) (a * 57.3), true);
				if (e != null) {
					start.put(id, e.position());
					uuids.put(id, e.getId());
					stats.put(id, new double[] {0, 0, 0, 0, 0});
				}
				i++;
			}
		});
		for (int tick = 0; tick < 300; tick += 5) {
			context.waitTicks(5);
			sp.getServer().runOnServer(server -> {
				ServerLevel level = player(server).level();
				ServerPlayer p = player(server);
				p.setHealth(p.getMaxHealth());
				for (Map.Entry<String, Integer> en : uuids.entrySet()) {
					Entity e = level.getEntity(en.getValue());
					double[] st = stats.get(en.getKey());
					if (e instanceof SpecCreature c && c.isAlive()) {
						st[0] = Math.max(st[0], c.position().distanceTo(start.get(en.getKey())));
						st[1] = Math.max(st[1], c.getY() - groundY(level, c.getBlockX(), c.getBlockZ()));
						if (c.getTarget() == p) {
							st[2] = 1;
						}
						if (c.isInWater()) {
							st[3]++;
						}
					} else {
						st[4] = 1;
					}
				}
				for (CreatureOrb orb : level.getEntitiesOfClass(CreatureOrb.class, p.getBoundingBox().inflate(48))) {
					if (orb.getOwner() != null) {
						String owner = EntityType.getKey(orb.getOwner().getType()).getPath();
						double[] st = stats.get(owner);
						if (st != null) {
							st[2] = Math.max(st[2], 2);
						}
					}
				}
			});
			if (tick == 100 || tick == 103 + 2) {
				context.takeScreenshot("creature_behavior_" + tick);
			}
		}
		sp.getServer().runOnServer(server -> {
			for (String id : ids) {
				double[] st = stats.get(id);
				if (st == null) {
					log(id + ": FAILED TO SPAWN");
					continue;
				}
				EntityType<SpecCreature> t = ModCreatures.TYPES.get(id);
				var spec = ModCreatures.spec(t);
				log(String.format("%-22s %-10s %-9s %-7s moved=%5.1f maxAlt=%4.1f target=%s shot=%s waterTicks=%3d gone=%s hits=%s", id, spec.movement,
					spec.behavior, spec.attack, st[0], st[1], st[2] >= 1 ? "yes" : "no", st[2] >= 2 ? "yes" : "no", (int) st[3], st[4] > 0 ? "yes" : "no",
					HITS.getOrDefault(id, Set.of())));
			}
			clear(player(server).level(), player(server).position(), 80);
		});
		context.waitTicks(5);
	}
}
