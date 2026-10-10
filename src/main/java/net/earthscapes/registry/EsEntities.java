package net.earthscapes.registry;

import java.util.ArrayList;
import java.util.List;
import net.earthscapes.Earthscapes;
import net.earthscapes.entity.BactrianCamel;
import net.earthscapes.entity.EsAnimal;
import net.earthscapes.entity.Fennec;
import net.earthscapes.entity.RiverDolphin;
import net.earthscapes.entity.Species;
import net.earthscapes.entity.Toucan;
import net.earthscapes.entity.WildHorse;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.AgeableWaterCreature;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.animal.camel.Camel;
import net.minecraft.world.entity.animal.dolphin.Dolphin;
import net.minecraft.world.entity.animal.equine.AbstractHorse;
import net.minecraft.world.entity.animal.fox.Fox;
import net.minecraft.world.entity.animal.parrot.Parrot;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.levelgen.Heightmap;

/** The animals of the four worlds: entity types, attributes, spawn rules and spawn eggs. */
public final class EsEntities {
	public static final List<EntityType<?>> ALL = new ArrayList<>();
	public static final List<EntityType<EsAnimal>> ANIMALS = new ArrayList<>();
	public static final List<Item> SPAWN_EGGS = new ArrayList<>();

	/** Ground the animals spawn on: grass and soil, sand and drifts, gravel, rock and snow. */
	public static final TagKey<Block> ANIMALS_SPAWNABLE_ON = TagKey.create(Registries.BLOCK, Earthscapes.id("animals_spawnable_on"));
	/** Animals that the grazers flee from. */
	public static final TagKey<EntityType<?>> PREDATORS = entityTag("predators");
	public static final TagKey<EntityType<?>> LION_PREY = entityTag("lion_prey");
	public static final TagKey<EntityType<?>> JAGUAR_PREY = entityTag("jaguar_prey");
	public static final TagKey<EntityType<?>> SNOW_LEOPARD_PREY = entityTag("snow_leopard_prey");
	public static final TagKey<EntityType<?>> CROCODILE_PREY = entityTag("crocodile_prey");

	public static final TagKey<Item> GRAZER_FOOD = itemTag("grazer_food");
	public static final TagKey<Item> BROWSER_FOOD = itemTag("browser_food");
	public static final TagKey<Item> ELEPHANT_FOOD = itemTag("elephant_food");
	public static final TagKey<Item> MEAT = itemTag("meat");
	public static final TagKey<Item> CROCODILE_FOOD = itemTag("crocodile_food");
	public static final TagKey<Item> CAPYBARA_FOOD = itemTag("capybara_food");
	public static final TagKey<Item> FRUIT = itemTag("fruit");
	public static final TagKey<Item> MARMOT_FOOD = itemTag("marmot_food");
	public static final TagKey<Item> SEEDS = itemTag("seeds");

	// ---------------------------------------------------------------- savanna
	public static final EntityType<EsAnimal> ELEPHANT = animal("elephant", 2.6F, 3.0F, 2.4F);
	public static final EntityType<EsAnimal> GIRAFFE = animal("giraffe", 1.5F, 4.8F, 4.4F);
	public static final EntityType<WildHorse> ZEBRA = register("zebra",
		EntityType.Builder.of(WildHorse::new, MobCategory.CREATURE).sized(1.3964844F, 1.6F).eyeHeight(1.52F).passengerAttachments(1.44375F).clientTrackingRange(10));
	public static final EntityType<EsAnimal> WILDEBEEST = animal("wildebeest", 1.2F, 1.5F, 1.3F);
	public static final EntityType<EsAnimal> THOMSONS_GAZELLE = animal("thomsons_gazelle", 0.7F, 1.1F, 0.95F);
	public static final EntityType<EsAnimal> HIPPO = animal("hippo", 2.2F, 1.7F, 1.45F);
	public static final EntityType<EsAnimal> LION = animal("lion", 1.1F, 1.2F, 1.0F);
	public static final EntityType<EsAnimal> OSTRICH = animal("ostrich", 0.8F, 2.6F, 2.45F);
	public static final EntityType<EsAnimal> NILE_CROCODILE = animal("nile_crocodile", 1.4F, 0.6F, 0.4F);
	// ---------------------------------------------------------------- Sahara
	public static final EntityType<Fennec> FENNEC = register("fennec",
		EntityType.Builder.of(Fennec::new, MobCategory.CREATURE).sized(0.5F, 0.55F).eyeHeight(0.4F).clientTrackingRange(8));
	public static final EntityType<EsAnimal> ADDAX = animal("addax", 1.0F, 1.5F, 1.3F);
	public static final EntityType<EsAnimal> DORCAS_GAZELLE = animal("dorcas_gazelle", 0.7F, 1.1F, 0.95F);
	// ---------------------------------------------------------------- Amazon
	public static final EntityType<EsAnimal> JAGUAR = animal("jaguar", 1.0F, 1.0F, 0.85F);
	public static final EntityType<EsAnimal> CAPYBARA = animal("capybara", 0.8F, 0.8F, 0.7F);
	public static final EntityType<EsAnimal> TAPIR = animal("tapir", 1.2F, 1.2F, 1.0F);
	public static final EntityType<Toucan> TOUCAN = register("toucan",
		EntityType.Builder.of(Toucan::new, MobCategory.CREATURE).sized(0.5F, 0.8F).eyeHeight(0.6F).passengerAttachments(0.5F).clientTrackingRange(8));
	public static final EntityType<RiverDolphin> RIVER_DOLPHIN = register("river_dolphin",
		EntityType.Builder.of(RiverDolphin::new, MobCategory.WATER_CREATURE).sized(0.9F, 0.6F).eyeHeight(0.3F));
	public static final EntityType<EsAnimal> BLACK_CAIMAN = animal("black_caiman", 1.4F, 0.6F, 0.4F);
	// ---------------------------------------------------------------- steppe
	public static final EntityType<EsAnimal> YAK = animal("yak", 1.6F, 1.9F, 1.6F);
	public static final EntityType<EsAnimal> SAIGA = animal("saiga", 0.8F, 1.0F, 0.85F);
	public static final EntityType<EsAnimal> MONGOLIAN_GAZELLE = animal("mongolian_gazelle", 0.7F, 1.1F, 0.95F);
	public static final EntityType<EsAnimal> SNOW_LEOPARD = animal("snow_leopard", 0.9F, 0.9F, 0.75F);
	public static final EntityType<EsAnimal> MARMOT = animal("marmot", 0.5F, 0.5F, 0.4F);
	public static final EntityType<WildHorse> PRZEWALSKI_HORSE = register("przewalski_horse",
		EntityType.Builder.of(WildHorse::new, MobCategory.CREATURE).sized(1.3964844F, 1.6F).eyeHeight(1.52F).passengerAttachments(1.44375F).clientTrackingRange(10));
	public static final EntityType<BactrianCamel> BACTRIAN_CAMEL = register("bactrian_camel",
		EntityType.Builder.of(BactrianCamel::new, MobCategory.CREATURE).sized(1.7F, 2.375F).eyeHeight(2.275F).clientTrackingRange(10));

	private EsEntities() {
	}

	public static void init() {
		defineSpecies();
		defineAttributes();
		defineSpawnRules();
		for (EntityType<?> type : ALL) {
			ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, EntityType.getKey(type).withSuffix("_spawn_egg"));
			SPAWN_EGGS.add(Items.registerItem(key, SpawnEggItem::new, new Item.Properties().spawnEgg(type)));
		}
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.SPAWN_EGGS).register(entries -> SPAWN_EGGS.forEach(entries::accept));
		EsItems.ALL.addAll(SPAWN_EGGS);
	}

	private static void defineSpecies() {
		// African savanna
		new Species(ELEPHANT_FOOD).herd(14).neutral().grazes().speeds(1.4, 1.3)
			.sounds(SoundEvents.RAVAGER_AMBIENT, SoundEvents.RAVAGER_HURT, SoundEvents.RAVAGER_DEATH, SoundEvents.RAVAGER_STEP)
			.voice(1.35F, 1.4F, 300).action(0.4F, SoundEvents.RAVAGER_ROAR).bind(ELEPHANT);
		new Species(BROWSER_FOOD).herd(18).shy(10).prey().grazes().speeds(1.7, 1.2)
			.sounds(null, SoundEvents.LLAMA_HURT, SoundEvents.LLAMA_DEATH, SoundEvents.HORSE_STEP).voice(0.7F, 1.0F, 400).bind(GIRAFFE);
		new Species(GRAZER_FOOD).herd(10).shy(12).prey().grazes().speeds(1.9, 1.2)
			.sounds(SoundEvents.COW_AMBIENT, SoundEvents.COW_HURT, SoundEvents.COW_DEATH, SoundEvents.COW_STEP).voice(0.75F, 1.0F, 160).bind(WILDEBEEST);
		new Species(GRAZER_FOOD).herd(8).shy(14).prey().grazes().speeds(2.3, 1.2)
			.sounds(SoundEvents.GOAT_AMBIENT, SoundEvents.GOAT_HURT, SoundEvents.GOAT_DEATH, SoundEvents.GOAT_STEP).voice(1.4F, 0.8F, 240).bind(THOMSONS_GAZELLE);
		new Species(GRAZER_FOOD).herd(12).neutral().swims().grazes().speeds(1.4, 1.35)
			.sounds(SoundEvents.HOGLIN_AMBIENT, SoundEvents.HOGLIN_HURT, SoundEvents.HOGLIN_DEATH, SoundEvents.HOGLIN_STEP)
			.voice(0.6F, 1.3F, 240).action(0.5F, null).bind(HIPPO);
		new Species(MEAT).herd(16).neutral().hunts(LION_PREY).speeds(1.6, 1.45)
			.sounds(SoundEvents.POLAR_BEAR_AMBIENT, SoundEvents.POLAR_BEAR_HURT, SoundEvents.POLAR_BEAR_DEATH, SoundEvents.POLAR_BEAR_STEP)
			.voice(0.7F, 1.2F, 280).action(0.35F, SoundEvents.RAVAGER_ROAR)
			.variants((biome, random) -> random.nextFloat() < 0.35F ? 0 : 1).bind(LION);
		new Species(SEEDS).herd(10).shy(14).prey().grazes().speeds(2.4, 1.3)
			.sounds(SoundEvents.CHICKEN_AMBIENT, SoundEvents.CHICKEN_HURT, SoundEvents.CHICKEN_DEATH, SoundEvents.CHICKEN_STEP)
			.voice(0.45F, 1.0F, 240).variants((biome, random) -> random.nextBoolean() ? 0 : 1).bind(OSTRICH);
		new Species(CROCODILE_FOOD).swims().hunts(CROCODILE_PREY).ambushesInWater().speeds(1.4, 1.5)
			.sounds(SoundEvents.CAT_HISS, SoundEvents.TURTLE_HURT, SoundEvents.TURTLE_DEATH, SoundEvents.TURTLE_SHAMBLE)
			.voice(0.55F, 1.0F, 600).action(0.6F, null).bind(NILE_CROCODILE);
		// Sahara
		new Species(GRAZER_FOOD).herd(10).shy(12).prey().grazes().speeds(1.8, 1.2)
			.sounds(SoundEvents.GOAT_AMBIENT, SoundEvents.GOAT_HURT, SoundEvents.GOAT_DEATH, SoundEvents.GOAT_STEP).voice(1.0F, 0.9F, 240).bind(ADDAX);
		new Species(GRAZER_FOOD).herd(8).shy(14).prey().grazes().speeds(2.3, 1.2)
			.sounds(SoundEvents.GOAT_AMBIENT, SoundEvents.GOAT_HURT, SoundEvents.GOAT_DEATH, SoundEvents.GOAT_STEP).voice(1.45F, 0.8F, 240).bind(DORCAS_GAZELLE);
		// Amazon
		new Species(MEAT).neutral().swims().hunts(JAGUAR_PREY).speeds(1.6, 1.5)
			.sounds(SoundEvents.OCELOT_AMBIENT, SoundEvents.OCELOT_HURT, SoundEvents.OCELOT_DEATH, null)
			.voice(0.55F, 1.1F, 400).action(0.3F, SoundEvents.CAT_HISS).bind(JAGUAR);
		new Species(CAPYBARA_FOOD).herd(8).prey().swims().grazes().speeds(1.5, 1.2)
			.sounds(SoundEvents.ARMADILLO_AMBIENT, SoundEvents.ARMADILLO_HURT, SoundEvents.ARMADILLO_DEATH, SoundEvents.ARMADILLO_STEP)
			.voice(0.85F, 1.0F, 200).bind(CAPYBARA);
		new Species(FRUIT).shy(8).prey().swims().grazes().speeds(1.6, 1.2)
			.sounds(SoundEvents.SNIFFER_IDLE, SoundEvents.SNIFFER_HURT, SoundEvents.SNIFFER_DEATH, SoundEvents.SNIFFER_STEP)
			.voice(1.25F, 0.8F, 240).bind(TAPIR);
		new Species(CROCODILE_FOOD).swims().hunts(CROCODILE_PREY).ambushesInWater().speeds(1.4, 1.5)
			.sounds(SoundEvents.CAT_HISS, SoundEvents.TURTLE_HURT, SoundEvents.TURTLE_DEATH, SoundEvents.TURTLE_SHAMBLE)
			.voice(0.5F, 1.0F, 600).action(0.6F, null).bind(BLACK_CAIMAN);
		// Mongolian steppe
		new Species(GRAZER_FOOD).herd(12).neutral().prey().grazes().speeds(1.4, 1.3)
			.sounds(SoundEvents.COW_AMBIENT, SoundEvents.COW_HURT, SoundEvents.COW_DEATH, SoundEvents.COW_STEP).voice(0.6F, 1.2F, 200).bind(YAK);
		new Species(GRAZER_FOOD).herd(10).shy(14).prey().grazes().speeds(2.2, 1.2)
			.sounds(SoundEvents.GOAT_AMBIENT, SoundEvents.GOAT_HURT, SoundEvents.GOAT_DEATH, SoundEvents.GOAT_STEP).voice(0.85F, 0.9F, 200).bind(SAIGA);
		new Species(GRAZER_FOOD).herd(10).shy(14).prey().grazes().speeds(2.3, 1.2)
			.sounds(SoundEvents.GOAT_AMBIENT, SoundEvents.GOAT_HURT, SoundEvents.GOAT_DEATH, SoundEvents.GOAT_STEP).voice(1.35F, 0.8F, 240).bind(MONGOLIAN_GAZELLE);
		new Species(MEAT).shy(16).neutral().hunts(SNOW_LEOPARD_PREY).speeds(1.8, 1.5)
			.sounds(SoundEvents.OCELOT_AMBIENT, SoundEvents.OCELOT_HURT, SoundEvents.OCELOT_DEATH, null).voice(0.8F, 0.9F, 500).bind(SNOW_LEOPARD);
		new Species(MARMOT_FOOD).herd(6).shy(10).prey().grazes().speeds(1.8, 1.2)
			.sounds(SoundEvents.RABBIT_AMBIENT, SoundEvents.RABBIT_HURT, SoundEvents.RABBIT_DEATH, null).voice(1.1F, 0.9F, 200)
			.action(0.4F, SoundEvents.PARROT_AMBIENT).bind(MARMOT);
	}

	private static void defineAttributes() {
		attributes(ELEPHANT, 120, 0.2, 12, 1.6, 0.9, 1.1);
		attributes(GIRAFFE, 60, 0.24, 0, 0, 0.6, 1.1);
		attributes(WILDEBEEST, 24, 0.24, 0, 0, 0.2, 1.0);
		attributes(THOMSONS_GAZELLE, 14, 0.26, 0, 0, 0.0, 1.0);
		attributes(HIPPO, 100, 0.2, 10, 1.0, 0.8, 1.0);
		attributes(LION, 40, 0.28, 7, 0.3, 0.3, 1.0);
		attributes(OSTRICH, 24, 0.26, 0, 0, 0.1, 1.0);
		attributes(NILE_CROCODILE, 50, 0.18, 8, 0.4, 0.6, 0.6);
		attributes(ADDAX, 20, 0.22, 0, 0, 0.1, 1.0);
		attributes(DORCAS_GAZELLE, 14, 0.26, 0, 0, 0.0, 1.0);
		attributes(JAGUAR, 36, 0.28, 7, 0.2, 0.2, 1.0);
		attributes(CAPYBARA, 16, 0.2, 0, 0, 0.0, 1.0);
		attributes(TAPIR, 30, 0.2, 0, 0, 0.3, 1.0);
		attributes(BLACK_CAIMAN, 50, 0.18, 8, 0.4, 0.6, 0.6);
		attributes(YAK, 40, 0.2, 6, 0.8, 0.6, 1.0);
		attributes(SAIGA, 14, 0.26, 0, 0, 0.0, 1.0);
		attributes(MONGOLIAN_GAZELLE, 14, 0.26, 0, 0, 0.0, 1.0);
		attributes(SNOW_LEOPARD, 30, 0.3, 6, 0.2, 0.1, 1.2);
		attributes(MARMOT, 8, 0.24, 0, 0, 0.0, 1.0);
		FabricDefaultAttributeRegistry.register(ZEBRA, AbstractHorse.createBaseHorseAttributes());
		FabricDefaultAttributeRegistry.register(PRZEWALSKI_HORSE, AbstractHorse.createBaseHorseAttributes());
		FabricDefaultAttributeRegistry.register(FENNEC, Fox.createAttributes().add(Attributes.MAX_HEALTH, 8.0));
		FabricDefaultAttributeRegistry.register(TOUCAN, Parrot.createAttributes());
		FabricDefaultAttributeRegistry.register(RIVER_DOLPHIN, Dolphin.createAttributes());
		FabricDefaultAttributeRegistry.register(BACTRIAN_CAMEL, Camel.createAttributes());
	}

	private static void attributes(EntityType<EsAnimal> type, double health, double speed, double damage, double knockback, double knockbackResistance,
		double stepHeight) {
		AttributeSupplier.Builder builder = Animal.createAnimalAttributes()
			.add(Attributes.MAX_HEALTH, health)
			.add(Attributes.MOVEMENT_SPEED, speed)
			.add(Attributes.KNOCKBACK_RESISTANCE, knockbackResistance)
			.add(Attributes.STEP_HEIGHT, stepHeight)
			.add(Attributes.FOLLOW_RANGE, 24.0);
		if (damage > 0) {
			builder.add(Attributes.ATTACK_DAMAGE, damage).add(Attributes.ATTACK_KNOCKBACK, knockback);
		}
		FabricDefaultAttributeRegistry.register(type, builder);
	}

	private static void defineSpawnRules() {
		for (EntityType<EsAnimal> animal : ANIMALS) {
			SpawnPlacements.register(animal, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, EsAnimal::checkSpawnRules);
		}
		SpawnPlacements.register(ZEBRA, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, EsEntities::surfaceSpawn);
		SpawnPlacements.register(PRZEWALSKI_HORSE, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, EsEntities::surfaceSpawn);
		SpawnPlacements.register(FENNEC, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, EsEntities::surfaceSpawn);
		SpawnPlacements.register(BACTRIAN_CAMEL, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, EsEntities::surfaceSpawn);
		SpawnPlacements.register(TOUCAN, SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING,
			(type, level, reason, pos, random) -> level.getBlockState(pos.below()).is(BlockTags.PARROTS_SPAWNABLE_ON));
		SpawnPlacements.register(RIVER_DOLPHIN, SpawnPlacementTypes.IN_WATER, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
			AgeableWaterCreature::checkSurfaceAgeableWaterCreatureSpawnRules);
	}

	/** Open ground of the kinds the animals live on, at the surface. */
	public static <T extends Mob> boolean surfaceSpawn(EntityType<T> type, LevelAccessor level, EntitySpawnReason reason, BlockPos pos, RandomSource random) {
		if (!level.getBlockState(pos.below()).is(ANIMALS_SPAWNABLE_ON)) {
			return false;
		}
		return EntitySpawnReason.ignoresLightRequirements(reason)
			|| pos.getY() >= level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, pos.getX(), pos.getZ()) - 1;
	}

	private static EntityType<EsAnimal> animal(String name, float width, float height, float eyeHeight) {
		EntityType<EsAnimal> type = register(name,
			EntityType.Builder.of(EsAnimal::new, MobCategory.CREATURE).sized(width, height).eyeHeight(eyeHeight).clientTrackingRange(10));
		ANIMALS.add(type);
		return type;
	}

	private static <T extends Mob> EntityType<T> register(String name, EntityType.Builder<T> builder) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, Earthscapes.id(name));
		EntityType<T> type = Registry.register(BuiltInRegistries.ENTITY_TYPE, key, builder.build(key));
		ALL.add(type);
		return type;
	}

	private static TagKey<EntityType<?>> entityTag(String name) {
		return TagKey.create(Registries.ENTITY_TYPE, Earthscapes.id(name));
	}

	private static TagKey<Item> itemTag(String name) {
		return TagKey.create(Registries.ITEM, Earthscapes.id(name));
	}
}
