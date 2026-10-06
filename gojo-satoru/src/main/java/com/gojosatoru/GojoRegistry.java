package com.gojosatoru;

import com.gojosatoru.block.VoidBarrierBlock;
import com.gojosatoru.entity.BlueOrbEntity;
import com.gojosatoru.entity.HollowPurpleEntity;
import com.gojosatoru.entity.RedOrbEntity;
import com.gojosatoru.particle.GlowParticleOptions;
import com.gojosatoru.power.GojoForm;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentSyncPredicate;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.gamerule.v1.GameRuleBuilder;
import net.fabricmc.fabric.api.particle.v1.FabricParticleTypes;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.gamerules.GameRule;
import net.minecraft.world.level.gamerules.GameRuleCategory;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;
import org.jspecify.annotations.Nullable;

public final class GojoRegistry {
    private GojoRegistry() {
    }

    // --- particles ---------------------------------------------------------------------------
    public static final ParticleType<GlowParticleOptions> GLOW = Registry.register(
            BuiltInRegistries.PARTICLE_TYPE, GojoMod.id("glow"),
            FabricParticleTypes.complex(false, GlowParticleOptions.CODEC, GlowParticleOptions.STREAM_CODEC));

    // --- entities ----------------------------------------------------------------------------
    public static final EntityType<BlueOrbEntity> BLUE = entity("blue",
            EntityType.Builder.<BlueOrbEntity>of(BlueOrbEntity::new, MobCategory.MISC)
                    .sized(1.0F, 1.0F).clientTrackingRange(10).updateInterval(1).fireImmune().noSave().noSummon());
    public static final EntityType<RedOrbEntity> RED = entity("red",
            EntityType.Builder.<RedOrbEntity>of(RedOrbEntity::new, MobCategory.MISC)
                    .sized(0.8F, 0.8F).clientTrackingRange(10).updateInterval(1).fireImmune().noSave().noSummon());
    public static final EntityType<HollowPurpleEntity> HOLLOW_PURPLE = entity("hollow_purple",
            EntityType.Builder.<HollowPurpleEntity>of(HollowPurpleEntity::new, MobCategory.MISC)
                    .sized(2.0F, 2.0F).clientTrackingRange(16).updateInterval(1).fireImmune().noSave().noSummon());

    // --- blocks ------------------------------------------------------------------------------
    public static final ResourceKey<Block> VOID_BARRIER_KEY = ResourceKey.create(Registries.BLOCK, GojoMod.id("void_barrier"));
    public static final Block VOID_BARRIER = Registry.register(BuiltInRegistries.BLOCK, VOID_BARRIER_KEY,
            new VoidBarrierBlock(BlockBehaviour.Properties.of()
                    .setId(VOID_BARRIER_KEY)
                    .mapColor(MapColor.COLOR_BLACK)
                    .strength(-1.0F, 3600000.0F)
                    .noLootTable()
                    .sound(SoundType.AMETHYST)
                    .emissiveRendering((state, level, pos) -> true)
                    .isValidSpawn(Blocks::never)
                    .pushReaction(PushReaction.BLOCK)));

    // --- damage types ------------------------------------------------------------------------
    public static final ResourceKey<DamageType> BLUE_DAMAGE = damageType("blue");
    public static final ResourceKey<DamageType> RED_DAMAGE = damageType("red");
    public static final ResourceKey<DamageType> PURPLE_DAMAGE = damageType("hollow_purple");
    public static final ResourceKey<DamageType> VOID_DAMAGE = damageType("infinite_void");

    // --- attachments -------------------------------------------------------------------------
    public static final AttachmentType<GojoForm> FORM = AttachmentRegistry.create(GojoMod.id("form"), builder -> builder
            .persistent(GojoForm.CODEC)
            .syncWith(GojoForm.STREAM_CODEC, AttachmentSyncPredicate.all())
            .copyOnDeath());

    // --- game rules --------------------------------------------------------------------------
    /** {@code /gamerule gojo:block_destruction false} keeps Blue, Red and Hollow Purple from wrecking terrain. */
    public static final GameRule<Boolean> BLOCK_DESTRUCTION = GameRuleBuilder.forBoolean(true)
            .category(GameRuleCategory.MISC)
            .buildAndRegister(GojoMod.id("block_destruction"));

    public static void init() {
        // Loading this class runs the static registrations above.
    }

    public static boolean blockDestruction(ServerLevel level) {
        return level.getGameRules().get(BLOCK_DESTRUCTION);
    }

    public static DamageSource damage(ServerLevel level, ResourceKey<DamageType> type, @Nullable Entity direct, @Nullable Entity cause) {
        return new DamageSource(level.registryAccess().lookupOrThrow(Registries.DAMAGE_TYPE).getOrThrow(type), direct, cause);
    }

    private static <T extends Entity> EntityType<T> entity(String name, EntityType.Builder<T> builder) {
        ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, GojoMod.id(name));
        return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, builder.build(key));
    }

    private static ResourceKey<DamageType> damageType(String name) {
        return ResourceKey.create(Registries.DAMAGE_TYPE, GojoMod.id(name));
    }
}
