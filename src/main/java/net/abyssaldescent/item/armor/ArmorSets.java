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
 * Armour set bonuses. Counts equipped pieces every half second and applies the attribute modifiers; event-driven
 * bonuses (Deathward, Veil) are queried from the combat hooks.
 */
public final class ArmorSets {
	public static final String GRAVEWARDEN = "gravewarden";
	public static final String MOURNER = "mourner";
	/** Cursed set: strong offence paid for with lower health and higher damage taken. */
	public static final String WRAITHBOUND = "wraithbound";
	private static final Identifier GRAVEWARDEN_HEALTH = AbyssalDescent.id("set_gravewarden_health");
	private static final Identifier MOURNER_SPEED = AbyssalDescent.id("set_mourner_speed");
	private static final Identifier WRAITHBOUND_DAMAGE = AbyssalDescent.id("set_wraithbound_damage");
	private static final Identifier WRAITHBOUND_CURSE = AbyssalDescent.id("set_wraithbound_curse");
	private static final int VEIL_TICKS = 60;
	private static final int DEATHWARD_COOLDOWN = 20 * 90;
	private static final Map<UUID, Long> LAST_HURT = new HashMap<>();
	/**
	 * Game time Deathward was last spent. The DEATHWARD_SPENT effect is only its indicator: milk, a totem or a command
	 * would clear it.
	 */
	private static final Map<UUID, Long> DEATHWARD_SPENT_AT = new HashMap<>();

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
		boolean wraith = count(player, WRAITHBOUND) >= 2;
		toggle(player, Attributes.ATTACK_DAMAGE, WRAITHBOUND_DAMAGE, wraith, 0.15, AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL);
		toggle(player, Attributes.MAX_HEALTH, WRAITHBOUND_CURSE, wraith, -4.0, AttributeModifier.Operation.ADD_VALUE);
		if (count(player, MOURNER) >= 4 && veilReady(player) && player.level() instanceof ServerLevel level) {
			level.sendParticles(ParticleTypes.SMOKE, player.getX(), player.getY() + 0.2, player.getZ(), 2, 0.25, 0.05, 0.25, 0.0);
		}
		if (player.getHealth() > player.getMaxHealth()) {
			player.setHealth(player.getMaxHealth());
		}
		// The indicator and the cooldown restore each other: the saved effect after a restart, the effect after milk.
		MobEffectInstance indicator = player.getEffect(ModEffects.DEATHWARD_SPENT);
		long cooldown = deathwardCooldown(player);
		if (cooldown > 0 && indicator == null) {
			player.addEffect(deathwardSpent((int) cooldown));
		} else if (cooldown <= 0 && indicator != null && !indicator.isInfiniteDuration()) {
			DEATHWARD_SPENT_AT.put(player.getUUID(), player.level().getGameTime() - DEATHWARD_COOLDOWN + indicator.getDuration());
		} else if (cooldown <= 0) {
			DEATHWARD_SPENT_AT.remove(player.getUUID());
		}
	}

	/**
	 * Adds or removes a set modifier. The modifier is saved with the player (like vanilla's effect modifiers), so a
	 * health bonus is already in place when the saved health is loaded and is not clamped away on a relog.
	 */
	private static void toggle(ServerPlayer player, net.minecraft.core.Holder<net.minecraft.world.entity.ai.attributes.Attribute> attribute, Identifier id,
		boolean on, double amount, AttributeModifier.Operation op) {
		AttributeInstance instance = player.getAttribute(attribute);
		if (instance == null) {
			return;
		}
		AttributeModifier current = instance.getModifier(id);
		if (on && (current == null || current.amount() != amount || current.operation() != op)) {
			instance.addOrReplacePermanentModifier(new AttributeModifier(id, amount, op));
		} else if (!on && current != null) {
			instance.removeModifier(id);
		}
	}

	/** Gravewarden 4pc: survive a lethal blow once every 90 seconds. Returns true if death was prevented. */
	public static boolean tryDeathward(ServerPlayer player) {
		if (count(player, GRAVEWARDEN) < 4 || deathwardCooldown(player) > 0 || player.hasEffect(ModEffects.DEATHWARD_SPENT)) {
			return false;
		}
		ServerLevel level = (ServerLevel) player.level();
		player.setHealth(2.0F);
		player.addEffect(new MobEffectInstance(MobEffects.ABSORPTION, 100, 1));
		DEATHWARD_SPENT_AT.put(player.getUUID(), level.getGameTime());
		player.addEffect(deathwardSpent(DEATHWARD_COOLDOWN));
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

	/** Ticks until Deathward is ready again (0 when ready). */
	private static long deathwardCooldown(Player player) {
		Long spent = DEATHWARD_SPENT_AT.get(player.getUUID());
		return spent == null ? 0 : Math.max(0, spent + DEATHWARD_COOLDOWN - player.level().getGameTime());
	}

	private static MobEffectInstance deathwardSpent(int ticks) {
		return new MobEffectInstance(ModEffects.DEATHWARD_SPENT, ticks, 0, false, false, true);
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

	public static boolean isCursed(String set) {
		return WRAITHBOUND.equals(set);
	}

	/** Wraithbound 4pc curse: +15% damage taken. */
	public static boolean hunted(Player player) {
		return count(player, WRAITHBOUND) >= 4;
	}

	/** Wraithbound 4pc: a kill feeds the armour, restoring 1.5 hearts and granting a burst of speed. */
	public static void onKill(ServerPlayer killer, LivingEntity victim) {
		if (count(killer, WRAITHBOUND) < 4 || !(killer.level() instanceof ServerLevel level)) {
			return;
		}
		killer.heal(3.0F);
		killer.addEffect(new MobEffectInstance(MobEffects.SPEED, 50, 0, false, false, true));
		Vec3 from = victim.position().add(0, victim.getBbHeight() * 0.6, 0);
		Vec3 to = killer.position().add(0, 1.0, 0);
		for (int i = 0; i <= 8; i++) {
			Vec3 p = from.lerp(to, i / 8.0);
			level.sendParticles(ModParticles.CURSE_MOTE, p.x, p.y, p.z, 1, 0.05, 0.05, 0.05, 0.0);
		}
	}

	public static void appendSetTooltip(ItemStack stack, String set, Consumer<Component> out) {
		String base = "set." + AbyssalDescent.MOD_ID + "." + set;
		out.accept(Component.translatable(base).withStyle(ChatFormatting.GOLD));
		if (isCursed(set)) {
			out.accept(Component.translatable("tooltip.abyssal_descent.cursed_set").withStyle(ChatFormatting.DARK_RED));
		}
		out.accept(Component.literal("  ").append(Component.translatable(base + ".two")).withStyle(ChatFormatting.GRAY));
		out.accept(Component.literal("  ").append(Component.translatable(base + ".four")).withStyle(ChatFormatting.GRAY));
	}
}
