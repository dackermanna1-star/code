package com.ordnance.test;

import com.ordnance.Ordnance;
import com.ordnance.entity.GrenadeEntity;
import com.ordnance.entity.LauncherGrenadeEntity;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.explosion.OrdnanceExplosion;
import com.ordnance.explosion.TerrainEffects;
import com.ordnance.registry.ModBlocks;
import com.ordnance.registry.ModComponents;
import com.ordnance.registry.ModDamageTypes;
import com.ordnance.registry.ModEntities;
import com.ordnance.registry.ModItems;
import com.ordnance.weapon.FlameStreamManager;
import com.ordnance.weapon.MagazineComponent;
import com.ordnance.weapon.MagazineWeaponItem;
import java.util.List;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.damage.DamageType;
import net.minecraft.entity.passive.PigEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.server.MinecraftServer;
import net.minecraft.test.TestContext;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Hand;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.GameMode;
import net.minecraft.world.World;

/**
 * Server-side gameplay tests, run with {@code ./gradlew runGameTest}. Each test builds its own scene inside the
 * default empty 8x8x8 structure, which is walled in by barriers so blasts cannot reach neighbouring tests.
 */
public class OrdnanceGameTests {
	private static final Vec3d DOWN = new Vec3d(0.0, -1.0, 0.0);
	private static final String[] RECIPES = {
		"explosive_charge", "frag_grenade", "incendiary_grenade", "smoke_grenade", "rpg7", "pg7v_rocket", "tbg7v_rocket",
		"grenade_launcher", "grenade_40mm_he", "grenade_40mm_incendiary", "grenade_40mm_smoke", "flamethrower", "fuel_canister",
		"strike_designator", "hypersonic_missile",
	};

	@GameTest
	public void dataPackContentLoads(TestContext context) {
		MinecraftServer server = context.getWorld().getServer();
		for (String recipe : RECIPES) {
			context.assertTrue(server.getRecipeManager().get(RegistryKey.of(RegistryKeys.RECIPE, Ordnance.id(recipe))).isPresent(), "recipe failed to load: " + recipe);
		}

		var damageTypes = context.getWorld().getRegistryManager().getOrThrow(RegistryKeys.DAMAGE_TYPE);
		for (RegistryKey<DamageType> key : List.of(ModDamageTypes.BLAST, ModDamageTypes.SHRAPNEL, ModDamageTypes.INCINERATED, ModDamageTypes.MISSILE_STRIKE, ModDamageTypes.BACKBLAST)) {
			context.assertTrue(damageTypes.contains(key), "damage type failed to load: " + key.getValue());
		}

		context.assertTrue(server.getAdvancementLoader().get(Ordnance.id("recipes/arsenal")) != null, "recipe advancement failed to load");
		context.complete();
	}

	@GameTest
	public void magazineIsFirstInFirstOut(TestContext context) {
		MagazineComponent magazine = MagazineComponent.EMPTY
			.withLoaded(ModItems.GRENADE_40MM_HE.getRegistryEntry())
			.withLoaded(ModItems.GRENADE_40MM_SMOKE.getRegistryEntry());
		context.assertEquals(2, magazine.size(), "rounds loaded");
		context.assertTrue(magazine.next().value() == ModItems.GRENADE_40MM_HE, "first round loaded fires first");
		MagazineComponent afterShot = magazine.withoutNext();
		context.assertTrue(afterShot.next().value() == ModItems.GRENADE_40MM_SMOKE, "second round is next");
		context.assertTrue(afterShot.withoutNext().isEmpty(), "magazine empties");
		context.complete();
	}

	@GameTest(maxTicks = 40)
	public void fragBlastBreaksBlocksAndHurtsMobs(TestContext context) {
		floor(context, Blocks.STONE);
		BlockPos center = new BlockPos(3, 1, 3);
		context.setBlockState(center.north(), Blocks.DIRT);
		context.setBlockState(center.south(), Blocks.DIRT);
		PigEntity pig = context.spawnMob(EntityType.PIG, new Vec3d(6.5, 1.0, 3.5));
		pig.setAiDisabled(true);

		OrdnanceExplosion.detonate(context.getWorld(), context.getAbsolute(Vec3d.ofCenter(center)), ExplosionProfile.FRAG_GRENADE, null, null, DOWN);
		context.expectBlock(Blocks.AIR, center.north());
		context.expectBlock(Blocks.AIR, center.south());
		// Damage arrives with the blast front rather than instantly; fragments hit at once.
		context.addInstantFinalTask(() -> context.assertTrue(!pig.isAlive() || pig.getHealth() < pig.getMaxHealth(), "pig was not hurt by the blast"));
	}

	@GameTest(maxTicks = 20)
	public void heatJetPenetratesWalls(TestContext context) {
		floor(context, Blocks.STONE);
		for (int x = 4; x <= 6; x++) {
			for (int y = 1; y <= 3; y++) {
				for (int z = 2; z <= 4; z++) {
					context.setBlockState(x, y, z, Blocks.STONE);
				}
			}
		}

		Vec3d impact = context.getAbsolute(new Vec3d(3.95, 2.5, 3.5));
		OrdnanceExplosion.detonate(context.getWorld(), impact, ExplosionProfile.RPG_HEAT, null, null, new Vec3d(1.0, 0.0, 0.0));
		// The third block of stone is out of reach of both the blast and the crater; only the jet gets there.
		context.expectBlock(Blocks.AIR, new BlockPos(6, 2, 3));
		context.complete();
	}

	@GameTest(maxTicks = 60)
	public void thermobaricWarheadStartsFires(TestContext context) {
		floor(context, Blocks.OAK_PLANKS);
		OrdnanceExplosion.detonate(context.getWorld(), context.getAbsolute(new Vec3d(3.5, 1.2, 3.5)), ExplosionProfile.RPG_THERMOBARIC, null, null, DOWN);
		context.addInstantFinalTask(() -> context.assertTrue(count(context, OrdnanceGameTests::isFire) > 0, "no fire after a thermobaric blast"));
	}

	@GameTest(maxTicks = 160)
	public void incendiaryGrenadeCooksOffAndBurns(TestContext context) {
		floor(context, Blocks.OAK_PLANKS);
		GrenadeEntity grenade = context.spawnEntity(ModEntities.GRENADE, new Vec3d(3.5, 3.0, 3.5));
		grenade.setItem(new ItemStack(ModItems.INCENDIARY_GRENADE));
		grenade.setVelocity(0.1, 0.2, 0.05);
		context.addInstantFinalTask(() -> {
			context.assertTrue(grenade.isRemoved(), "grenade has not detonated");
			context.assertTrue(count(context, OrdnanceGameTests::isFire) > 0, "incendiary grenade left no fire");
		});
	}

	@GameTest(maxTicks = 140)
	public void smokeGrenadeVentsInsteadOfExploding(TestContext context) {
		floor(context, Blocks.STONE);
		context.setBlockState(4, 1, 3, Blocks.GLASS);
		GrenadeEntity grenade = context.spawnEntity(ModEntities.GRENADE, new Vec3d(3.5, 1.5, 3.5));
		grenade.setItem(new ItemStack(ModItems.SMOKE_GRENADE));
		context.addInstantFinalTask(() -> {
			context.assertTrue(grenade.isEmitting() && !grenade.isRemoved(), "smoke grenade is not venting");
			context.expectBlock(Blocks.GLASS, new BlockPos(4, 1, 3));
		});
	}

	@GameTest(maxTicks = 60)
	public void rpgFiresRocketThatBlastsTheWall(TestContext context) {
		floor(context, Blocks.STONE);
		for (int y = 1; y <= 4; y++) {
			for (int z = 0; z <= 7; z++) {
				context.setBlockState(7, y, z, Blocks.STONE);
			}
		}

		PlayerEntity player = shooter(context, new Vec3d(1.5, 1.0, 3.5));
		ItemStack rpg = new ItemStack(ModItems.RPG7);
		rpg.set(ModComponents.MAGAZINE, MagazineComponent.EMPTY.withLoaded(ModItems.PG7V_ROCKET.getRegistryEntry()));
		player.setStackInHand(Hand.MAIN_HAND, rpg);
		ActionResult result = rpg.use(context.getWorld(), player, Hand.MAIN_HAND);
		context.assertTrue(result.isAccepted(), "RPG refused to fire: " + result);
		context.assertTrue(MagazineWeaponItem.magazine(rpg).isEmpty(), "rocket still in the tube after firing");
		context.assertEquals(1, context.getEntities(ModEntities.ROCKET).size(), "rockets in flight");
		context.addInstantFinalTask(() -> {
			context.assertTrue(context.getEntities(ModEntities.ROCKET).isEmpty(), "rocket never detonated");
			context.assertTrue(countIn(context, 7, 7, state -> !state.isOf(Blocks.STONE)) > 0, "the wall is intact");
		});
	}

	@GameTest(maxTicks = 80)
	public void grenadeLauncherLobsExplodingRounds(TestContext context) {
		floor(context, Blocks.STONE);
		for (int y = 1; y <= 4; y++) {
			for (int z = 0; z <= 7; z++) {
				context.setBlockState(7, y, z, Blocks.DIRT);
			}
		}

		PlayerEntity player = shooter(context, new Vec3d(0.5, 1.0, 3.5));
		ItemStack launcher = new ItemStack(ModItems.GRENADE_LAUNCHER);
		launcher.set(ModComponents.MAGAZINE, MagazineComponent.EMPTY.withLoaded(ModItems.GRENADE_40MM_HE.getRegistryEntry()));
		player.setStackInHand(Hand.MAIN_HAND, launcher);
		context.assertTrue(launcher.use(context.getWorld(), player, Hand.MAIN_HAND).isAccepted(), "launcher refused to fire");
		List<LauncherGrenadeEntity> rounds = context.getEntities(ModEntities.LAUNCHER_GRENADE);
		context.assertEquals(1, rounds.size(), "40mm rounds in flight");
		context.addInstantFinalTask(() -> {
			context.assertTrue(context.getEntities(ModEntities.LAUNCHER_GRENADE).isEmpty(), "40mm round never detonated");
			context.assertTrue(countIn(context, 7, 7, state -> !state.isOf(Blocks.DIRT)) > 0, "the dirt wall is intact");
		});
	}

	@GameTest(maxTicks = 80)
	public void flameStreamIgnitesWood(TestContext context) {
		floor(context, Blocks.STONE);
		for (int z = 2; z <= 4; z++) {
			context.setBlockState(6, 1, z, Blocks.OAK_PLANKS);
			context.setBlockState(6, 2, z, Blocks.OAK_PLANKS);
		}

		Vec3d nozzle = context.getAbsolute(new Vec3d(1.5, 2.0, 3.5));
		for (int i = 0; i < 12; i++) {
			FlameStreamManager.spawnGlob(context.getWorld(), nozzle, new Vec3d(0.7, 0.05, (i % 3 - 1) * 0.05), null, false);
		}

		context.addInstantFinalTask(() -> context.assertTrue(count(context, OrdnanceGameTests::isFire) > 0, "the flame stream lit nothing"));
	}

	@GameTest(maxTicks = 400)
	public void burningFuelBurnsOut(TestContext context) {
		floor(context, Blocks.STONE);
		BlockPos pos = new BlockPos(3, 1, 3);
		context.setBlockState(pos, ModBlocks.BURNING_FUEL);
		context.expectBlock(ModBlocks.BURNING_FUEL, pos);
		context.addInstantFinalTask(() -> context.checkBlockState(pos, state -> !state.isOf(ModBlocks.BURNING_FUEL), state -> Text.literal("fuel is still burning: " + state)));
	}

	@GameTest(maxTicks = 30)
	public void vanillaTntGetsDebrisAndScorchMarks(TestContext context) {
		// Thick enough that the crater never reaches the bottom of the test area, where scorch marks would land
		// outside it.
		for (int y = 0; y <= 4; y++) {
			for (int x = 0; x < 8; x++) {
				for (int z = 0; z < 8; z++) {
					context.setBlockState(x, y, z, y == 4 ? Blocks.GRASS_BLOCK : Blocks.DIRT);
				}
			}
		}

		Vec3d pos = context.getAbsolute(new Vec3d(3.5, 5.0, 3.5));
		context.getWorld().createExplosion(null, pos.x, pos.y, pos.z, 4.0F, World.ExplosionSourceType.TNT);
		context.assertTrue(!context.getEntities(ModEntities.DEBRIS).isEmpty(), "vanilla explosion threw no debris");
		context.assertTrue(count(context, state -> state.isOf(ModBlocks.SCORCHED_EARTH)) > 0, "vanilla explosion left no scorch marks");
		context.complete();
	}

	@GameTest
	public void scorchMarksReachTheFloorUnderARoof(TestContext context) {
		floor(context, Blocks.GRASS_BLOCK);
		for (int x = 0; x < 8; x++) {
			for (int z = 0; z < 8; z++) {
				context.setBlockState(x, 3, z, Blocks.STONE);
			}
		}

		TerrainEffects.scorch(context.getWorld(), context.getAbsolute(new Vec3d(3.5, 1.2, 3.5)), 3.0F, context.getWorld().getRandom(), null, 1.0F);
		int floor = 0;
		int roof = 0;
		for (int x = 0; x < 8; x++) {
			for (int z = 0; z < 8; z++) {
				floor += context.getBlockState(new BlockPos(x, 0, z)).isOf(ModBlocks.SCORCHED_EARTH) ? 1 : 0;
				roof += context.getBlockState(new BlockPos(x, 3, z)).isOf(Blocks.STONE) ? 0 : 1;
			}
		}

		context.assertTrue(floor > 0, "the floor under the roof was not scorched");
		context.assertEquals(0, roof, "roof blocks changed by a blast below them");
		context.complete();
	}

	// ---------------------------------------------------------------- helpers

	private static void floor(TestContext context, Block block) {
		for (int x = 0; x < 8; x++) {
			for (int z = 0; z < 8; z++) {
				context.setBlockState(x, 0, z, block);
			}
		}
	}

	/** A creative mock player standing at {@code pos}, looking along +X. */
	private static PlayerEntity shooter(TestContext context, Vec3d pos) {
		PlayerEntity player = context.createMockPlayer(GameMode.CREATIVE);
		Vec3d abs = context.getAbsolute(pos);
		player.refreshPositionAndAngles(abs.x, abs.y, abs.z, -90.0F, 0.0F);
		player.setHeadYaw(-90.0F);
		return player;
	}

	private static boolean isFire(BlockState state) {
		return state.isIn(BlockTags.FIRE) || state.isOf(ModBlocks.BURNING_FUEL);
	}

	private static int count(TestContext context, Predicate<BlockState> predicate) {
		int[] count = {0};
		context.forEachRelativePos(pos -> {
			if (predicate.test(context.getBlockState(pos))) {
				count[0]++;
			}
		});
		return count[0];
	}

	private static int countIn(TestContext context, int minX, int maxX, Predicate<BlockState> predicate) {
		int count = 0;
		for (int x = minX; x <= maxX; x++) {
			for (int y = 1; y <= 4; y++) {
				for (int z = 0; z <= 7; z++) {
					if (predicate.test(context.getBlockState(new BlockPos(x, y, z)))) {
						count++;
					}
				}
			}
		}

		return count;
	}
}
