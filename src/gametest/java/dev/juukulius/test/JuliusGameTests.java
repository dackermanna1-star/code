package dev.juukulius.test;

import com.mojang.authlib.GameProfile;
import com.mojang.serialization.JsonOps;
import dev.juukulius.JuliusMod;
import dev.juukulius.character.ActionState;
import dev.juukulius.character.JuliusAppearance;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.character.JuliusData;
import dev.juukulius.character.JuliusServer;
import dev.juukulius.combat.Ability;
import dev.juukulius.combat.CombatRules;
import dev.juukulius.combat.SwordArts;
import dev.juukulius.entity.ClaristaWaveEntity;
import dev.juukulius.entity.ClauzeriaVortexEntity;
import dev.juukulius.entity.FirestormEntity;
import dev.juukulius.entity.SpiritBoltEntity;
import dev.juukulius.entity.StoneSpikeEntity;
import dev.juukulius.network.ActionRequestPayload;
import dev.juukulius.network.ActionRequestPayload.Action;
import dev.juukulius.registry.JuliusItems;
import dev.juukulius.spirit.Spirit;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ServerboundPlayerLoadedPacket;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.golem.IronGolem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * Server-side behaviour of Julius: transformation, the sword combo and specials, every spirit art, mana and cooldown
 * validation, Al Cranvel, death/respawn and persistence. Each test drives the same entry points a client request
 * reaches ({@link JuliusServer#handleRequest}) with a mock player standing in a small arena and an iron golem as target.
 */
public class JuliusGameTests {
	/** Player position (relative to the test origin), facing south (+z) towards the target. */
	private static final Vec3 PLAYER = new Vec3(3.5, 1.0, 1.5);
	/** Target three blocks ahead of the player. */
	private static final Vec3 TARGET = new Vec3(3.5, 1.0, 4.5);
	private static final float GOLEM_HEALTH = 100.0F;

	// ------------------------------------------------------------------------------------------------ transformation

	@GameTest(maxTicks = 100)
	public void transformationGrantsSwordAndReverts(GameTestHelper helper) {
		ServerPlayer player = player(helper, false);
		JuliusData data = JuliusAttachments.data(player);
		request(player, Action.TRANSFORM, 0);
		helper.assertTrue(data.transformed, "transform request should transform");
		helper.assertTrue(data.spiritsOut, "spirits should manifest on transformation");
		helper.assertTrue(player.getMainHandItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD), "first transformation grants the sword");
		helper.assertTrue(JuliusAttachments.appearance(player).transformed(), "appearance should be synced as transformed");
		helper.assertTrue(player.getAttribute(Attributes.MOVEMENT_SPEED).hasModifier(JuliusMod.id("knight_poise")), "speed modifier missing");

		// A second press right away is rejected (transformation cooldown) and changes nothing.
		request(player, Action.TRANSFORM, 0);
		helper.assertTrue(data.transformed, "transformation spam must be rejected");

		helper.runAfterDelay(CombatRules.TRANSFORM_COOLDOWN + 1, () -> {
			request(player, Action.TRANSFORM, 0);
			helper.assertFalse(data.transformed, "second request after the cooldown should revert");
			helper.assertFalse(JuliusAttachments.appearance(player).transformed(), "appearance should be synced as reverted");
			helper.assertFalse(player.getAttribute(Attributes.MOVEMENT_SPEED).hasModifier(JuliusMod.id("knight_poise")), "speed modifier not removed");
			helper.assertValueEqual(countSwords(player), 1, "the sword is only granted once");
			finish(helper, player);
		});
	}

	@GameTest(maxTicks = 40)
	public void actionsRequireTransformationAndSword(GameTestHelper helper) {
		ServerPlayer player = player(helper, false);
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = JuliusServer.state(player);
		request(player, Action.SWING, 1);
		request(player, Action.SPIRIT_ART, 0);
		request(player, Action.ULTIMATE, 0);
		helper.assertValueEqual(state.comboStep, 0, "untransformed swing must be rejected");
		helper.assertValueEqual(data.mana, CombatRules.MAX_MANA, "rejected actions must not cost mana");
		helper.assertFalse(data.ultimateActive(), "untransformed Al Cranvel must be rejected");

		transformReady(player);
		player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
		request(player, Action.SWING, 1);
		request(player, Action.SWORD_SPECIAL, 0);
		helper.assertValueEqual(state.comboStep, 0, "swing without the sword must be rejected");
		helper.assertValueEqual(data.cooldown(Ability.HEAVY_STRIKE), 0, "heavy strike without the sword must be rejected");
		finish(helper, player);
	}

	// ------------------------------------------------------------------------------------------------ sword

	@GameTest(maxTicks = 120)
	public void comboChainsThreeHitsAndRestoresMana(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		IronGolem golem = target(helper);
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = JuliusServer.state(player);
		transformReady(player);
		data.mana = 40.0F;

		helper.startSequence()
			.thenExecute(() -> {
				request(player, Action.SWING, 1);
				helper.assertValueEqual(state.comboStep, 1, "first swing starts the combo");
			})
			.thenExecuteAfter(4, () -> {
				helper.assertTrue(golem.getHealth() <= GOLEM_HEALTH - 5.9F, "slash 1 should hit at its impact frame, health " + golem.getHealth());
				helper.assertTrue(data.mana >= 41.9F, "a combo hit restores mana, mana " + data.mana);
				request(player, Action.SWING, 2);
				helper.assertValueEqual(state.comboStep, 2, "swing inside the chain window continues the combo");
			})
			.thenExecuteAfter(5, () -> request(player, Action.SWING, 3))
			.thenExecuteAfter(1, () -> {
				helper.assertValueEqual(state.comboStep, 3, "third swing is the finisher");
				long swingTime = state.lastSwingTime;
				request(player, Action.SWING, 1);
				helper.assertValueEqual(state.lastSwingTime, swingTime, "swinging during the finisher recovery must be rejected");
			})
			.thenExecuteAfter(6, () -> helper.assertTrue(golem.getHealth() <= GOLEM_HEALTH - 21.4F,
				"three hits should deal 6 + 6.5 + 9 damage, health " + golem.getHealth()))
			.thenExecuteAfter(CombatRules.COMBO[2].totalTicks() + CombatRules.FINISHER_RECOVERY, () -> {
				request(player, Action.SWING, 1);
				helper.assertValueEqual(state.comboStep, 1, "a new combo starts after the finisher recovery");
			})
			.thenExecuteAfter(1, () -> leave(player))
			.thenSucceed();
	}

	@GameTest(maxTicks = 80)
	public void comboResetsAfterTheChainWindow(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		ActionState state = JuliusServer.state(player);
		transformReady(player);
		request(player, Action.SWING, 1);
		helper.runAfterDelay(CombatRules.COMBO[0].chainUntil() + CombatRules.INPUT_TOLERANCE + 4, () -> {
			request(player, Action.SWING, 2);
			helper.assertValueEqual(state.comboStep, 1, "a late swing starts over at step 1");
			finish(helper, player);
		});
	}

	@GameTest(maxTicks = 60)
	public void heavyStrikeHitsOnItsImpactFrame(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		IronGolem golem = target(helper);
		JuliusData data = JuliusAttachments.data(player);
		transformReady(player);
		request(player, Action.SWORD_SPECIAL, 0);
		helper.assertValueEqual(data.cooldown(Ability.HEAVY_STRIKE), CombatRules.cooldown(Ability.HEAVY_STRIKE), "heavy strike starts its cooldown");
		helper.assertTrue(Math.abs(data.mana - (CombatRules.MAX_MANA - Ability.HEAVY_STRIKE.manaCost)) < 0.01F, "heavy strike costs mana");
		helper.startSequence()
			.thenExecuteAfter(CombatRules.HEAVY_IMPACT_TICK - 2, () -> helper.assertValueEqual(golem.getHealth(), GOLEM_HEALTH, "no damage before the impact frame"))
			.thenExecuteAfter(3, () -> helper.assertTrue(golem.getHealth() <= GOLEM_HEALTH - CombatRules.HEAVY_DAMAGE + 0.01F,
				"heavy strike damage, health " + golem.getHealth()))
			.thenExecute(() -> {
				float mana = data.mana;
				int cooldown = data.cooldown(Ability.HEAVY_STRIKE);
				request(player, Action.SWORD_SPECIAL, 0);
				helper.assertTrue(data.mana >= mana - 0.01F && data.cooldown(Ability.HEAVY_STRIKE) == cooldown,
					"a second heavy strike during the cooldown must be rejected");
				leave(player);
			})
			.thenSucceed();
	}

	@GameTest(maxTicks = 120)
	public void alClauzeriaGuardsAndReleasesTheVortex(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		IronGolem golem = target(helper);
		ServerLevel level = helper.getLevel();
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = JuliusServer.state(player);
		transformReady(player);
		request(player, Action.SWORD_SPECIAL, 1);
		helper.assertTrue(state.barrierEnd > level.getGameTime(), "Al Clauzeria raises the barrier");
		helper.assertTrue(player.hasEffect(MobEffects.RESISTANCE), "Al Clauzeria grants resistance while gathering");
		helper.assertTrue(Math.abs(data.mana - (CombatRules.MAX_MANA - Ability.AL_CLAUZERIA.manaCost)) < 0.01F, "Al Clauzeria costs mana");

		float health = player.getHealth();
		player.hurtServer(level, level.damageSources().source(DamageTypes.ARROW), 6.0F);
		helper.assertValueEqual(player.getHealth(), health, "the barrier repels projectiles");

		helper.startSequence()
			.thenExecuteAfter(12, () -> {
				helper.assertTrue(entities(helper, ClauzeriaVortexEntity.class).isEmpty(), "the vortex waits for the six spirits to gather");
				helper.assertValueEqual(golem.getHealth(), GOLEM_HEALTH, "nothing is released during the gather");
			})
			.thenWaitUntil(() -> helper.assertTrue(golem.getHealth() < GOLEM_HEALTH, "the released vortex should strike the target"))
			.thenExecute(() -> leave(player))
			.thenSucceed();
	}

	@GameTest(maxTicks = 60)
	public void chargedReleaseLaunchesAlClarista(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		IronGolem golem = target(helper);
		JuliusData data = JuliusAttachments.data(player);
		transformReady(player);
		helper.assertFalse(SwordArts.releaseCharge(player, CombatRules.CHARGE_MIN_TICKS - 1), "an uncharged release does nothing");
		helper.assertTrue(SwordArts.releaseCharge(player, CombatRules.CHARGE_FULL_TICKS), "a full charge releases the wave");
		float expected = CombatRules.MAX_MANA - Ability.AL_CLARISTA.manaCost - CombatRules.WAVE_EXTRA_COST;
		helper.assertTrue(Math.abs(data.mana - expected) < 0.01F, "a full charge costs the extra mana, mana " + data.mana);
		helper.assertFalse(entities(helper, ClaristaWaveEntity.class).isEmpty(), "the crescent wave entity exists");
		helper.startSequence()
			.thenWaitUntil(() -> helper.assertTrue(golem.getHealth() <= GOLEM_HEALTH - CombatRules.WAVE_MIN_DAMAGE,
				"the wave should cut the target, health " + golem.getHealth()))
			.thenExecute(() -> leave(player))
			.thenSucceed();
	}

	// ------------------------------------------------------------------------------------------------ spirit arts

	@GameTest(maxTicks = 60)
	public void iaFlameBurst(GameTestHelper helper) {
		castAndExpect(helper, Spirit.IA, false, true, (player, golem) -> {
			helper.assertFalse(entities(helper, SpiritBoltEntity.class).isEmpty(), "Flame Burst launches a fire orb");
		}, golem -> golem.getHealth() < GOLEM_HEALTH);
	}

	@GameTest(maxTicks = 80)
	public void ulGoraFirestorm(GameTestHelper helper) {
		castAndExpect(helper, Spirit.IA, true, true, (player, golem) -> {
			helper.assertFalse(entities(helper, FirestormEntity.class).isEmpty(), "Ul Gora raises the firestorm");
		}, golem -> golem.getHealth() < GOLEM_HEALTH);
	}

	@GameTest(maxTicks = 60)
	public void kuaTideLance(GameTestHelper helper) {
		castAndExpect(helper, Spirit.KUA, false, true, (player, golem) -> {
			helper.assertFalse(entities(helper, SpiritBoltEntity.class).isEmpty(), "Tide Lance launches a water lance");
			helper.assertTrue(player.hasEffect(MobEffects.REGENERATION), "Tide Lance leaves a restorative veil");
		}, golem -> golem.getHealth() < GOLEM_HEALTH);
	}

	@GameTest(maxTicks = 40)
	public void kuaHealingWater(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		transformReady(player);
		select(player, Spirit.KUA);
		player.setHealth(8.0F);
		request(player, Action.SPIRIT_ART, 1);
		helper.assertTrue(player.getHealth() >= 13.9F, "Healing Water heals, health " + player.getHealth());
		helper.assertTrue(player.hasEffect(MobEffects.REGENERATION) && player.getEffect(MobEffects.REGENERATION).getAmplifier() == 1,
			"Healing Water grants Regeneration II");
		finish(helper, player);
	}

	@GameTest(maxTicks = 40)
	public void aroGaleStepCutsNearbyEnemies(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		IronGolem golem = target(helper, PLAYER.add(0.0, 0.0, 1.6));
		transformReady(player);
		select(player, Spirit.ARO);
		request(player, Action.SPIRIT_ART, 0);
		helper.assertTrue(JuliusServer.state(player).dashTicks > 0, "Gale Step starts the dash");
		helper.startSequence()
			.thenWaitUntil(() -> helper.assertTrue(golem.getHealth() < GOLEM_HEALTH, "the gusts cut enemies along the path"))
			.thenExecute(() -> leave(player))
			.thenSucceed();
	}

	@GameTest(maxTicks = 40)
	public void aroElFuraBlast(GameTestHelper helper) {
		castAndExpect(helper, Spirit.ARO, true, true, (player, golem) -> {
		}, golem -> golem.getHealth() < GOLEM_HEALTH);
	}

	@GameTest(maxTicks = 60)
	public void ikuStoneSpires(GameTestHelper helper) {
		castAndExpect(helper, Spirit.IKU, false, true, (player, golem) -> {
		}, golem -> golem.getHealth() < GOLEM_HEALTH && !entities(helper, StoneSpikeEntity.class).isEmpty());
	}

	@GameTest(maxTicks = 40)
	public void ikuGroundShatter(GameTestHelper helper) {
		castAndExpect(helper, Spirit.IKU, true, true, (player, golem) -> {
			helper.assertTrue(golem.getHealth() < GOLEM_HEALTH, "Ground Shatter strikes everything around Julius");
			helper.assertTrue(golem.hasEffect(MobEffects.SLOWNESS), "Ground Shatter staggers its targets");
		}, golem -> true);
	}

	@GameTest(maxTicks = 40)
	public void inRadiantBurst(GameTestHelper helper) {
		castAndExpect(helper, Spirit.IN, false, true, (player, golem) -> {
			helper.assertTrue(golem.getHealth() < GOLEM_HEALTH, "Radiant Burst hits the target in front");
			helper.assertTrue(player.hasEffect(MobEffects.ABSORPTION) && player.hasEffect(MobEffects.RESISTANCE), "Radiant Burst leaves a brief ward");
		}, golem -> true);
	}

	@GameTest(maxTicks = 40)
	public void inEmpowerment(GameTestHelper helper) {
		castAndExpect(helper, Spirit.IN, true, false, (player, golem) -> {
			helper.assertTrue(player.hasEffect(MobEffects.STRENGTH) && player.hasEffect(MobEffects.SPEED) && player.hasEffect(MobEffects.HASTE),
				"In strengthens body and speed");
		}, golem -> true);
	}

	@GameTest(maxTicks = 60)
	public void nesUmbralBolt(GameTestHelper helper) {
		castAndExpect(helper, Spirit.NES, false, true, (player, golem) -> {
			helper.assertFalse(entities(helper, SpiritBoltEntity.class).isEmpty(), "Umbral Bolt launches a dark orb");
		}, golem -> golem.hasEffect(MobEffects.SLOWNESS) && golem.hasEffect(MobEffects.WEAKNESS));
	}

	@GameTest(maxTicks = 40)
	public void nesYinSealBindsTheTarget(GameTestHelper helper) {
		castAndExpect(helper, Spirit.NES, true, true, (player, golem) -> {
			helper.assertTrue(golem.hasEffect(MobEffects.SLOWNESS) && golem.getEffect(MobEffects.SLOWNESS).getAmplifier() >= 4, "Yin Seal binds the target");
			helper.assertTrue(golem.hasEffect(MobEffects.WEAKNESS), "Yin Seal weakens the target");
		}, golem -> true);
	}

	@GameTest(maxTicks = 40)
	public void yinSealWithoutTargetIsRefunded(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		JuliusData data = JuliusAttachments.data(player);
		transformReady(player);
		select(player, Spirit.NES);
		request(player, Action.SPIRIT_ART, 1);
		helper.assertValueEqual(data.mana, CombatRules.MAX_MANA, "an art without a target refunds its mana");
		helper.assertValueEqual(data.cooldown(Ability.NES_YIN_SEAL), 0, "an art without a target refunds its cooldown");
		finish(helper, player);
	}

	// ------------------------------------------------------------------------------------------------ resources

	@GameTest(maxTicks = 80)
	public void manaCostsCooldownsAndRegeneration(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		JuliusData data = JuliusAttachments.data(player);
		transformReady(player);
		select(player, Spirit.IA);
		request(player, Action.SPIRIT_ART, 0);
		float afterCast = CombatRules.MAX_MANA - Ability.IA_FLAME_BURST.manaCost;
		helper.assertTrue(Math.abs(data.mana - afterCast) < 0.01F, "Flame Burst costs its mana");
		helper.assertValueEqual(data.cooldown(Ability.IA_FLAME_BURST), CombatRules.cooldown(Ability.IA_FLAME_BURST), "Flame Burst starts its cooldown");

		helper.startSequence()
			.thenExecuteAfter(Ability.IA_FLAME_BURST.lockTicks + 1, () -> {
				request(player, Action.SPIRIT_ART, 0);
				helper.assertTrue(Math.abs(data.mana - afterCast) < 0.01F, "casting during the cooldown must be rejected");
			})
			.thenExecuteAfter(CombatRules.REGEN_DELAY_TICKS - Ability.IA_FLAME_BURST.lockTicks - 4, () ->
				helper.assertTrue(Math.abs(data.mana - afterCast) < 0.01F, "regeneration pauses after spending mana"))
			.thenExecuteAfter(12, () -> helper.assertTrue(data.mana > afterCast + 1.0F && data.mana < afterCast + 3.5F,
				"transformed regeneration is 5 per second, mana " + data.mana))
			.thenExecute(() -> {
				data.mana = 5.0F;
				select(player, Spirit.KUA);
				request(player, Action.SPIRIT_ART, 0);
				helper.assertTrue(data.mana < 5.5F && data.cooldown(Ability.KUA_TIDE_LANCE) == 0, "an art without enough mana must be rejected");
				leave(player);
			})
			.thenSucceed();
	}

	@GameTest(maxTicks = 80)
	public void spiritsRestAndReturn(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		JuliusData data = JuliusAttachments.data(player);
		transformReady(player);
		request(player, Action.TOGGLE_SPIRITS, 0);
		helper.assertFalse(data.spiritsOut, "the spirits return to their crystals");
		helper.assertFalse(JuliusAttachments.appearance(player).spiritsOut(), "resting spirits are synced");
		helper.startSequence()
			.thenExecuteAfter(CombatRules.SPIRIT_TOGGLE_COOLDOWN + 1, () -> {
				data.mana = 50.0F;
				request(player, Action.SPIRIT_ART, 0);
				helper.assertTrue(data.spiritsOut, "pressing an art while resting summons the spirits instead");
				helper.assertTrue(data.mana >= 49.9F, "summoning the spirits back costs nothing");
				leave(player);
			})
			.thenSucceed();
	}

	@GameTest(maxTicks = 20)
	public void aroCushionsFalls(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		ServerLevel level = helper.getLevel();
		JuliusData data = JuliusAttachments.data(player);
		transformReady(player);
		float health = player.getHealth();
		player.hurtServer(level, level.damageSources().fall(), 6.0F);
		helper.assertValueEqual(player.getHealth(), health, "Aro cushions the fall");
		helper.assertTrue(data.mana < CombatRules.MAX_MANA, "the cushion costs mana");

		data.mana = 0.0F;
		player.hurtServer(level, level.damageSources().fall(), 6.0F);
		helper.assertTrue(player.getHealth() < health, "without mana the fall hurts");
		finish(helper, player);
	}

	// ------------------------------------------------------------------------------------------------ Al Cranvel

	@GameTest(maxTicks = 120)
	public void alCranvelEmpowersThenEnds(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		IronGolem golem = target(helper, PLAYER.add(0.0, 0.0, 2.5));
		ServerLevel level = helper.getLevel();
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = JuliusServer.state(player);
		transformReady(player);
		request(player, Action.ULTIMATE, 0);
		helper.assertTrue(data.ultimateActive(), "Al Cranvel activates");
		helper.assertTrue(Math.abs(data.mana - (CombatRules.MAX_MANA - Ability.AL_CRANVEL.manaCost)) < 0.01F, "Al Cranvel costs mana");
		helper.assertTrue(player.getAttribute(Attributes.MOVEMENT_SPEED).hasModifier(JuliusMod.id("al_cranvel_speed")), "Al Cranvel speeds Julius up");
		helper.assertTrue(JuliusAttachments.appearance(player).ultimateEnd() > level.getGameTime(), "the ultimate is synced to everyone");

		float health = player.getHealth();
		player.hurtServer(level, level.damageSources().generic(), 5.0F);
		helper.assertValueEqual(player.getHealth(), health, "the awakening cannot be interrupted");

		request(player, Action.ULTIMATE, 0);
		helper.assertTrue(data.ultimateActive() && data.cooldown(Ability.AL_CRANVEL) == 0, "activating twice is rejected");

		helper.startSequence()
			.thenExecuteAfter(20, () -> helper.assertTrue(golem.getHealth() < GOLEM_HEALTH, "the awakening burst strikes nearby enemies"))
			.thenExecuteAfter(Ability.AL_CRANVEL.lockTicks - 18, () -> {
				select(player, Spirit.IA);
				data.mana = 50.0F;
				request(player, Action.SPIRIT_ART, 0);
				float expected = 50.0F - Ability.IA_FLAME_BURST.manaCost * CombatRules.ULTIMATE_COST_MULTIPLIER;
				helper.assertTrue(Math.abs(data.mana - expected) < 0.01F, "arts cost half during Al Cranvel, mana " + data.mana);
				data.ultimateTicks = 2;
			})
			.thenExecuteAfter(3, () -> {
				helper.assertFalse(data.ultimateActive(), "Al Cranvel ends when its time runs out");
				int cooldown = data.cooldown(Ability.AL_CRANVEL);
				helper.assertTrue(cooldown > CombatRules.cooldown(Ability.AL_CRANVEL) - 5, "the cooldown starts when it ends, cooldown " + cooldown);
				helper.assertFalse(player.getAttribute(Attributes.MOVEMENT_SPEED).hasModifier(JuliusMod.id("al_cranvel_speed")), "the buffs end with it");
				helper.assertTrue(state.lockTicks > 0, "the exhaustion animation locks actions briefly");
				leave(player);
			})
			.thenSucceed();
	}

	// ------------------------------------------------------------------------------------------------ death and persistence

	@GameTest(maxTicks = 40)
	public void deathRevertsAndRespawnRestoresMana(GameTestHelper helper) {
		ServerPlayer player = player(helper, true);
		ServerLevel level = helper.getLevel();
		JuliusData data = JuliusAttachments.data(player);
		transformReady(player);
		request(player, Action.ULTIMATE, 0);
		data.mana = 12.0F;
		data.cooldowns[Ability.HEAVY_STRIKE.ordinal()] = 60;
		JuliusServer.state(player).invulnerableTicks = 0;

		player.hurtServer(level, level.damageSources().genericKill(), Float.MAX_VALUE);
		helper.assertTrue(player.isDeadOrDying(), "the player should have died");
		helper.assertFalse(data.transformed, "Julius reverts on death");
		helper.assertFalse(data.ultimateActive(), "Al Cranvel ends on death");

		ServerPlayer respawned = level.getServer().getPlayerList().respawn(player, false, Entity.RemovalReason.KILLED);
		JuliusData after = JuliusAttachments.data(respawned);
		helper.assertFalse(after.transformed, "respawn starts untransformed");
		helper.assertValueEqual(after.mana, CombatRules.MANA_AFTER_DEATH, "respawn restores mana to the respawn value");
		helper.assertTrue(after.cooldown(Ability.HEAVY_STRIKE) > 0, "cooldowns survive death");
		helper.assertTrue(after.cooldown(Ability.AL_CRANVEL) > 0, "the ultimate's cooldown runs after it ends");
		helper.assertFalse(JuliusAttachments.appearance(respawned).transformed(), "the respawned player is synced as untransformed");
		finish(helper, respawned);
	}

	@GameTest
	public void dataSurvivesSaving(GameTestHelper helper) {
		JuliusData data = new JuliusData();
		data.transformed = true;
		data.spiritsOut = false;
		data.selectedSpirit = Spirit.NES.ordinal();
		data.mana = 37.5F;
		data.cooldowns[Ability.UL_GORA.ordinal()] = 123;
		data.ultimateTicks = 77;
		data.swordGranted = true;
		var encoded = JuliusData.CODEC.encodeStart(JsonOps.INSTANCE, data).getOrThrow();
		JuliusData decoded = JuliusData.CODEC.parse(JsonOps.INSTANCE, encoded).getOrThrow();
		helper.assertTrue(decoded.transformed && !decoded.spiritsOut && decoded.selectedSpirit == Spirit.NES.ordinal(), "flags survive saving");
		helper.assertValueEqual(decoded.mana, 37.5F, "mana survives saving");
		helper.assertValueEqual(decoded.cooldown(Ability.UL_GORA), 123, "cooldowns survive saving");
		helper.assertValueEqual(decoded.ultimateTicks, 77, "the ultimate survives saving");
		helper.assertTrue(decoded.swordGranted, "the sword grant survives saving");
		helper.succeed();
	}

	// ------------------------------------------------------------------------------------------------ helpers

	private interface ArtCheck {
		void check(ServerPlayer player, IronGolem golem);
	}

	/**
	 * Casts the selected spirit's art at a golem three blocks ahead, checks the immediate result, then waits until
	 * {@code eventually} holds (projectiles need a few ticks to arrive).
	 */
	private static void castAndExpect(GameTestHelper helper, Spirit spirit, boolean combination, boolean needsTarget, ArtCheck immediate,
		Predicate<IronGolem> eventually) {
		ServerPlayer player = player(helper, true);
		IronGolem golem = target(helper);
		JuliusData data = JuliusAttachments.data(player);
		transformReady(player);
		select(player, spirit);
		Ability ability = spirit.art(combination);
		request(player, Action.SPIRIT_ART, combination ? 1 : 0);
		helper.assertValueEqual(data.cooldown(ability), CombatRules.cooldown(ability), ability.id + " should be cast");
		helper.assertTrue(Math.abs(data.mana - (CombatRules.MAX_MANA - ability.manaCost)) < 0.01F, ability.id + " should cost its mana");
		immediate.check(player, golem);
		helper.startSequence()
			.thenWaitUntil(() -> helper.assertTrue(!needsTarget || eventually.test(golem), ability.id + " should affect the target"))
			.thenExecute(() -> leave(player))
			.thenSucceed();
	}

	/** A survival mock player standing in the arena facing the target, optionally holding the sword. */
	private static ServerPlayer player(GameTestHelper helper, boolean sword) {
		ServerLevel level = helper.getLevel();
		for (int x = 0; x < 8; x++) {
			for (int z = 0; z < 8; z++) {
				helper.setBlock(new BlockPos(x, 0, z), Blocks.SMOOTH_STONE);
			}
		}

		CommonListenerCookie cookie = CommonListenerCookie.createInitial(new GameProfile(UUID.randomUUID(), "julius-test"), false);
		ServerPlayer player = new ServerPlayer(level.getServer(), level, cookie.gameProfile(), cookie.clientInformation());
		Connection connection = new Connection(PacketFlow.SERVERBOUND);
		new EmbeddedChannel(connection);
		level.getServer().getPlayerList().placeNewPlayer(connection, player, cookie);
		// Test worlds default to creative; Julius is tested as a survival player. Skip the post-join loading grace
		// period, during which players cannot be hurt.
		player.setGameMode(GameType.SURVIVAL);
		player.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
		Vec3 position = helper.absoluteVec(PLAYER);
		player.teleportTo(level, position.x, position.y, position.z, Set.of(), 0.0F, 0.0F, true);
		player.setYHeadRot(0.0F);
		if (sword) {
			player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(JuliusItems.HOUSE_JUUKULIUS_SWORD));
		}

		return player;
	}

	private static IronGolem target(GameTestHelper helper) {
		return target(helper, TARGET);
	}

	private static IronGolem target(GameTestHelper helper, Vec3 relative) {
		IronGolem golem = helper.spawn(EntityType.IRON_GOLEM, relative);
		golem.setNoAi(true);
		golem.setHealth(GOLEM_HEALTH);
		return golem;
	}

	/** Transforms and skips the transformation's action lock. */
	private static void transformReady(ServerPlayer player) {
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = JuliusServer.state(player);
		JuliusServer.transform(player, data, state);
		state.lockTicks = 0;
		data.mana = CombatRules.MAX_MANA;
	}

	private static void select(ServerPlayer player, Spirit spirit) {
		JuliusServer.state(player).selectCooldown = 0;
		request(player, Action.SELECT_SPIRIT, spirit.ordinal());
		JuliusAppearance appearance = JuliusAttachments.appearance(player);
		if (JuliusAttachments.data(player).selectedSpirit != spirit.ordinal() || appearance.selectedSpirit() != spirit.ordinal()) {
			throw new IllegalStateException("spirit selection failed for " + spirit);
		}
	}

	private static void request(ServerPlayer player, Action action, int argument) {
		JuliusServer.handleRequest(player, new ActionRequestPayload(action, argument));
	}

	private static <T extends Entity> List<T> entities(GameTestHelper helper, Class<T> type) {
		return helper.getLevel().getEntitiesOfClass(type, helper.getBounds().inflate(16.0));
	}

	private static int countSwords(ServerPlayer player) {
		int count = 0;
		for (ItemStack stack : player.getInventory()) {
			if (stack.is(JuliusItems.HOUSE_JUUKULIUS_SWORD)) {
				count += stack.getCount();
			}
		}

		return count;
	}

	/** Removes the mock player (it would otherwise stay in the player list after the test). */
	private static void leave(ServerPlayer player) {
		player.level().getServer().getPlayerList().remove(player);
	}

	private static void finish(GameTestHelper helper, ServerPlayer player) {
		leave(player);
		helper.succeed();
	}
}
