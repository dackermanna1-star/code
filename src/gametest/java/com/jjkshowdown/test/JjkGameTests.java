package com.jjkshowdown.test;

import com.jjkshowdown.ability.AbilityHandler;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.combat.Blast;
import com.jjkshowdown.combat.TechniqueDamage;
import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.domain.DomainManager;
import com.jjkshowdown.entity.boss.GojoBoss;
import com.jjkshowdown.entity.boss.SukunaBoss;
import com.jjkshowdown.entity.projectile.DismantleEntity;
import com.jjkshowdown.registry.ModBlocks;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.Characters;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.world.TerrainJournal;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Server-side gameplay tests: run with {@code ./gradlew runGameTest}. */
public class JjkGameTests {
	private static final float EPS = 0.001f;

	/** Keep a generous area ticking: blinks, dashes and knockback carry fighters far outside the test structure. */
	private static void forceArena(GameTestHelper h, int chunkRadius) {
		ServerLevel level = h.getLevel();
		BlockPos c = h.absolutePos(new BlockPos(4, 0, 4));
		int cx = c.getX() >> 4, cz = c.getZ() >> 4;
		for (int x = -chunkRadius; x <= chunkRadius; x++) {
			for (int z = -chunkRadius; z <= chunkRadius; z++) level.setChunkForced(cx + x, cz + z, true);
		}
	}

	private static GojoBoss gojo(GameTestHelper h, double x, double z) {
		GojoBoss g = h.spawn(ModEntities.GOJO, new Vec3(x, 2, z));
		g.setNoAi(true);
		CursedEnergy.fill(g);
		return g;
	}

	private static SukunaBoss sukuna(GameTestHelper h, double x, double z) {
		SukunaBoss s = h.spawn(ModEntities.SUKUNA, new Vec3(x, 2, z));
		s.setNoAi(true);
		CursedEnergy.fill(s);
		return s;
	}

	@GameTest(maxTicks = 40)
	public void infinityBlocksAttacksButNotWorldSlash(GameTestHelper h) {
		ServerLevel level = h.getLevel();
		GojoBoss g = gojo(h, 2.5, 2.5);
		Zombie z = h.spawn(EntityType.ZOMBIE, new Vec3(4.5, 2, 2.5));
		h.assertTrue(AbilityHandler.press(g, AbilitySlot.TOGGLE), "Infinity should activate");
		h.assertTrue(Sorcerers.hasInfinity(g), "Infinity flag set");
		float hp = g.getHealth();
		g.hurtServer(level, level.damageSources().mobAttack(z), 10f);
		h.assertTrue(Math.abs(g.getHealth() - hp) < EPS, "Infinity must stop melee damage");
		g.hurtServer(level, level.damageSources().arrow(null, z), 10f);
		h.assertTrue(Math.abs(g.getHealth() - hp) < EPS, "Infinity must stop projectile damage");
		g.invulnerableTime = 0;
		TechniqueDamage.hurt(g, ModDamageTypes.WORLD_SLASH, z, z, 10f, true);
		h.assertTrue(g.getHealth() < hp - 1f, "The World-Cutting Slash must cut through Infinity");
		h.succeed();
	}

	@GameTest(maxTicks = 40)
	public void domainAmplificationPiercesInfinity(GameTestHelper h) {
		ServerLevel level = h.getLevel();
		GojoBoss g = gojo(h, 2.5, 2.5);
		SukunaBoss s = sukuna(h, 4.5, 2.5);
		AbilityHandler.press(g, AbilitySlot.TOGGLE);
		float hp = g.getHealth();
		g.hurtServer(level, level.damageSources().mobAttack(s), 8f);
		h.assertTrue(Math.abs(g.getHealth() - hp) < EPS, "Without amplification Sukuna's fist is stopped");
		h.assertTrue(AbilityHandler.press(s, AbilitySlot.TOGGLE), "Domain Amplification should activate");
		h.assertTrue(Sorcerers.hasAmplification(s), "amplification flag");
		g.invulnerableTime = 0;
		g.hurtServer(level, level.damageSources().mobAttack(s), 8f);
		h.assertTrue(g.getHealth() < hp - 1f, "Domain Amplification must pass through Infinity");
		h.succeed();
	}

	@GameTest(maxTicks = 60)
	public void blastCratersAndJournalRestores(GameTestHelper h) {
		ServerLevel level = h.getLevel();
		BlockPos c = h.absolutePos(new BlockPos(4, 2, 4));
		for (BlockPos p : BlockPos.betweenClosed(c.offset(-1, -1, -1), c.offset(1, 1, 1))) level.setBlock(p, Blocks.STONE.defaultBlockState(), 3);
		Blast.Spec spec = new Blast.Spec();
		spec.type = ModDamageTypes.RED;
		spec.radius = 3;
		spec.damage = 1;
		spec.craterRadius = 2.2f;
		spec.maxHardness = 10;
		spec.debrisChance = 0;
		Blast.detonate(level, null, null, Vec3.atCenterOf(c), spec);
		h.assertTrue(level.getBlockState(c).isAir(), "centre block destroyed");
		TerrainJournal j = TerrainJournal.get(level);
		h.assertTrue(j.isTracked(c), "destroyed block is journaled for restoration");
		j.restoreAll(level);
		h.assertTrue(level.getBlockState(c).is(Blocks.STONE), "terrain restored");
		h.succeed();
	}

	@GameTest(maxTicks = 60)
	public void dismantleCutsSoftTerrain(GameTestHelper h) {
		ServerLevel level = h.getLevel();
		SukunaBoss s = sukuna(h, 1.5, 4.5);
		BlockPos wall = h.absolutePos(new BlockPos(5, 2, 4));
		level.setBlock(wall, Blocks.OAK_PLANKS.defaultBlockState(), 3);
		level.setBlock(wall.above(), Blocks.OAK_PLANKS.defaultBlockState(), 3);
		Vec3 from = h.absoluteVec(new Vec3(2.5, 2.6, 4.5));
		DismantleEntity d = DismantleEntity.create(level, s, 2.6f, 5f, 0f, 2.5f);
		d.launch(from, new Vec3(1, 0, 0), 1.5);
		level.addFreshEntity(d);
		h.succeedWhen(() -> h.assertTrue(level.getBlockState(wall).isAir() || level.getBlockState(wall.above()).isAir(), "Dismantle should cut the planks"));
	}

	@GameTest(maxTicks = 160, environment = "jjkshowdown-test:isolated_a")
	public void unlimitedVoidBuildsArenaParalysesAndRestores(GameTestHelper h) {
		ServerLevel level = h.getLevel();
		forceArena(h, 3);
		GojoBoss g = gojo(h, 4.5, 4.5);
		Zombie z = h.spawn(EntityType.ZOMBIE, new Vec3(7.5, 2, 4.5));
		h.assertTrue(AbilityHandler.press(g, AbilitySlot.DOMAIN), "Unlimited Void should expand");
		DomainEntity d = DomainManager.ownedBy(g);
		h.assertTrue(d != null, "domain entity exists");
		h.runAfterDelay(30, () -> {
			h.assertTrue(d.isLive(), "domain is live after forming");
			int r = (int) d.radius();
			BlockPos top = BlockPos.containing(d.position()).above(r);
			h.assertTrue(level.getBlockState(top).is(ModBlocks.UNLIMITED_VOID_BARRIER), "barrier dome at the top of the radius");
			h.assertTrue(level.getBlockState(BlockPos.containing(d.position()).below()).is(ModBlocks.VOID_FLOOR), "void floor below the caster");
			h.assertTrue(z.hasEffect(ModEffects.INFORMATION_OVERLOAD), "the zombie is paralysed by infinite information");
			d.collapse();
		});
		h.runAfterDelay(70, () -> {
			h.assertTrue(d.isRemoved(), "domain finished collapsing");
			int r = (int) d.radius();
			BlockPos top = BlockPos.containing(d.position()).above(r);
			h.assertTrue(!level.getBlockState(top).is(ModBlocks.UNLIMITED_VOID_BARRIER), "barrier removed after collapse");
			SorcererState st = Sorcerers.state(g);
			h.assertTrue(st.burnoutTicks > 0, "domain burns out the technique");
			h.assertTrue(!AbilityHandler.press(g, AbilitySlot.TOGGLE), "Infinity cannot be used during burnout");
			h.succeed();
		});
	}

	@GameTest(maxTicks = 500, environment = "jjkshowdown-test:isolated_b")
	public void domainsClashAndOneShatters(GameTestHelper h) {
		forceArena(h, 3);
		GojoBoss g = gojo(h, 3.5, 4.5);
		SukunaBoss s = sukuna(h, 9.5, 4.5);
		boolean[] clashed = new boolean[1];
		DomainEntity[] dom = new DomainEntity[2];
		h.assertTrue(AbilityHandler.press(g, AbilitySlot.DOMAIN), "Gojo expands");
		dom[0] = DomainManager.ownedBy(g);
		h.runAfterDelay(25, () -> {
			h.assertTrue(AbilityHandler.press(s, AbilitySlot.DOMAIN), "Sukuna answers with his domain");
			dom[1] = DomainManager.ownedBy(s);
		});
		h.onEachTick(() -> {
			if (dom[0] != null && dom[1] != null && dom[0].clashWith() >= 0 && dom[1].clashWith() >= 0) clashed[0] = true;
			if (h.getTick() % 10 == 0 && h.getTick() < 120) {
				System.out.println("[JJK-CLASH] t=" + g.tickCount + " uv=" + (dom[0] == null ? "-" : dom[0].phase() + "/" + dom[0].clashWith() + "/" + dom[0].isRemoved())
						+ " shrine=" + (dom[1] == null ? "-" : dom[1].phase() + "/" + dom[1].clashWith() + "/" + dom[1].isRemoved())
						+ " sOverload=" + s.hasEffect(ModEffects.INFORMATION_OVERLOAD) + " active=" + DomainManager.active().size()
						+ " dist=" + String.format("%.1f", g.distanceTo(s)) + " gCE=" + (int) CursedEnergy.get(g) + " sCE=" + (int) CursedEnergy.get(s));
			}
		});
		h.succeedWhen(() -> {
			h.assertTrue(dom[0] != null && dom[1] != null, "both domains were expanded");
			h.assertTrue(clashed[0], "the domains clashed");
			boolean resolved = dom[0].phase() == DomainEntity.PHASE_COLLAPSING || dom[0].isRemoved()
					|| dom[1].phase() == DomainEntity.PHASE_COLLAPSING || dom[1].isRemoved();
			h.assertTrue(resolved, "clash resolved");
			System.out.println("[JJK-TEST] clash resolved: gojoDomain=" + dom[0].phase() + "/" + dom[0].isRemoved() + " sukunaDomain=" + dom[1].phase() + "/"
					+ dom[1].isRemoved() + " voidIntegrity=" + dom[0].integrity());
		});
	}

	@GameTest(maxTicks = 420, environment = "jjkshowdown-test:isolated_c")
	public void rivalsFightWithoutErrors(GameTestHelper h) {
		forceArena(h, 4);
		GojoBoss g = h.spawn(ModEntities.GOJO, new Vec3(2.5, 2, 2.5));
		SukunaBoss s = h.spawn(ModEntities.SUKUNA, new Vec3(12.5, 2, 12.5));
		g.setTarget(s);
		s.setTarget(g);
		float gh = g.getHealth(), sh = s.getHealth();
		h.onEachTick(() -> {
			if (h.getTick() % 20 == 0) {
				SorcererState gs = Sorcerers.state(g), ss = Sorcerers.state(s);
				System.out.println("[JJK-TEST] t=" + g.tickCount + " dist=" + String.format("%.1f", g.distanceTo(s)) + " gojoTarget=" + (g.getTarget() == null ? "-" : g.getTarget().getName().getString())
						+ " sukunaTarget=" + (s.getTarget() == null ? "-" : s.getTarget().getName().getString()) + " inf=" + gs.infinity + " da=" + ss.amplification
						+ " gCharge=" + gs.chargingSlot + " sCharge=" + ss.chargingSlot + " gHP=" + g.getHealth() + " sHP=" + s.getHealth()
						+ " sCE=" + (int) CursedEnergy.get(s) + " sCD=" + java.util.Arrays.toString(ss.cooldowns) + " sLock=" + ss.cinematicLock + " sStag=" + ss.staggerTicks);
			}
		});
		h.runAfterDelay(400, () -> {
			System.out.println("[JJK-TEST] rivals: gojo " + gh + " -> " + g.getHealth() + " (alive=" + g.isAlive() + "), sukuna " + sh + " -> " + s.getHealth()
					+ " (alive=" + s.isAlive() + "), gojoCE=" + CursedEnergy.get(g) + " sukunaCE=" + CursedEnergy.get(s));
			h.assertTrue(g.getHealth() < gh || s.getHealth() < sh || !g.isAlive() || !s.isAlive(), "the rivals actually fought");
			h.succeed();
		});
	}

	@GameTest(maxTicks = 40)
	public void playerProgressionAndUnlocks(GameTestHelper h) {
		ServerPlayer p = h.makeMockServerPlayerInLevel();
		Characters.set(p, CharacterType.SUKUNA, false);
		h.assertValueEqual(Sorcerers.character(p), CharacterType.SUKUNA, "character set");
		h.assertTrue(p.getMaxHealth() > 20f, "sorcerer health bonus applied");
		int before = Sorcerers.data(p).mastery();
		Mastery.addXp(p, 500);
		h.assertTrue(Sorcerers.data(p).mastery() > before, "mastery levels up with XP");
		Characters.set(p, CharacterType.NONE, false);
		h.assertTrue(Math.abs(p.getMaxHealth() - 20f) < EPS, "bonuses removed for non-sorcerers");
		h.succeed();
	}
}
