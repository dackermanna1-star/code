package net.abyssaldescent.item.armor;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.item.GearItem;
import net.abyssaldescent.registry.ModDamageTypes;
import net.abyssaldescent.registry.ModEffects;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/**
 * Armour set bonuses. Counts equipped pieces every half second and applies transient modifiers; event-driven bonuses
 * (Deathward, Veil) are queried from the combat hooks.
 */
public final class ArmorSets {
	public static final String GRAVEWARDEN = "gravewarden";
	public static final String MOURNER = "mourner";
	private static final Identifier GRAVEWARDEN_HEALTH = AbyssalDescent.id("set_gravewarden_health");
	private static final Identifier MOURNER_SPEED = AbyssalDescent.id("set_mourner_speed");
	private static final int VEIL_TICKS = 60;
	private static final Map<UUID, Long> LAST_HURT = new HashMap<>();

	private ArmorSets() {
	}

	public static int count(LivingEntity entity, String set) {
		int n = 0;
		for (EquipmentSlot slot : new EquipmentSlot[] {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET}) {
			ItemStack stack = entity.getItemBySlot(slot);
			if (stack.getItem() instanceof GearItem gear && set.equals(gear.spec().set())) {
				n++;
			}
		}
		return n;
	}

	public static void tick(ServerPlayer player) {
		toggle(player, Attributes.MAX_HEALTH, GRAVEWARDEN_HEALTH, count(player, GRAVEWARDEN) >= 2, 4.0, AttributeModifier.Operation.ADD_VALUE);
		toggle(player, Attributes.MOVEMENT_SPEED, MOURNER_SPEED, count(player, MOURNER) >= 2, 0.08, AttributeModifier.Operation.ADD_MULTIPLIED_BASE);
		if (count(player, MOURNER) >= 4 && veilReady(player) && player.tickCount % 10 == 0 && player.level() instanceof ServerLevel level) {
			level.sendParticles(ParticleTypes.SMOKE, player.getX(), player.getY() + 0.2, player.getZ(), 2, 0.25, 0.05, 0.25, 0.0);
		}
		if (player.getHealth() > player.getMaxHealth()) {
			player.setHealth(player.getMaxHealth());
		}
	}

	private static void toggle(ServerPlayer player, net.minecraft.core.Holder<net.minecraft.world.entity.ai.attributes.Attribute> attribute, Identifier id,
		boolean on, double amount, AttributeModifier.Operation op) {
		AttributeInstance instance = player.getAttribute(attribute);
		if (instance == null) {
			return;
		}
		boolean has = instance.hasModifier(id);
		if (on && !has) {
			instance.addTransientModifier(new AttributeModifier(id, amount, op));
		} else if (!on && has) {
			instance.removeModifier(id);
		}
	}

	/** Gravewarden 4pc: survive a lethal blow once every 90 seconds. Returns true if death was prevented. */
	public static boolean tryDeathward(ServerPlayer player) {
		if (count(player, GRAVEWARDEN) < 4 || player.hasEffect(ModEffects.DEATHWARD_SPENT)) {
			return false;
		}
		ServerLevel level = (ServerLevel) player.level();
		player.setHealth(2.0F);
		player.addEffect(new MobEffectInstance(MobEffects.ABSORPTION, 100, 1));
		player.addEffect(new MobEffectInstance(ModEffects.DEATHWARD_SPENT, 20 * 90, 0, false, false, true));
		for (LivingEntity e : level.getEntitiesOfClass(LivingEntity.class, player.getBoundingBox().inflate(4.0), e -> e instanceof Enemy && e.isAlive())) {
			e.hurtServer(level, level.damageSources().source(ModDamageTypes.SOUL_MAGIC, player), 4.0F);
			Vec3 push = e.position().subtract(player.position()).normalize();
			e.push(push.x * 1.2, 0.4, push.z * 1.2);
		}
		level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, player.getX(), player.getY() + 1, player.getZ(), 60, 1.0, 0.8, 1.0, 0.15);
		level.sendParticles(ModParticles.SHOCK_RING, player.getX(), player.getY() + 0.05, player.getZ(), 1, 0, 0, 0, 0);
		level.playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.DEATHWARD, SoundSource.PLAYERS, 1.5F, 1.0F);
		player.displayClientMessage(Component.translatable("message.abyssal_descent.deathward").withStyle(ChatFormatting.AQUA), true);
		return true;
	}

	public static void onPlayerHurt(Player player) {
		LAST_HURT.put(player.getUUID(), player.level().getGameTime());
	}

	private static boolean veilReady(Player player) {
		Long last = LAST_HURT.get(player.getUUID());
		return last == null || player.level().getGameTime() - last >= VEIL_TICKS;
	}

	/** Mourner 4pc: the first melee hit after three unharmed seconds deals +40%. Consumes the charge. */
	public static boolean consumeVeil(Player player) {
		if (count(player, MOURNER) >= 4 && veilReady(player)) {
			LAST_HURT.put(player.getUUID(), player.level().getGameTime());
			return true;
		}
		return false;
	}

	public static void appendSetTooltip(ItemStack stack, String set, Consumer<Component> out) {
		String base = "set." + AbyssalDescent.MOD_ID + "." + set;
		out.accept(Component.translatable(base).withStyle(ChatFormatting.GOLD));
		out.accept(Component.literal("  ").append(Component.translatable(base + ".two")).withStyle(ChatFormatting.GRAY));
		out.accept(Component.literal("  ").append(Component.translatable(base + ".four")).withStyle(ChatFormatting.GRAY));
	}
}
