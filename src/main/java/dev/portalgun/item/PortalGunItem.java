package dev.portalgun.item;

import dev.portalgun.dimension.Destination;
import dev.portalgun.dimension.Destinations;
import dev.portalgun.entity.PortalShotEntity;
import dev.portalgun.registry.ModComponents;
import dev.portalgun.registry.ModItems;
import dev.portalgun.registry.ModSounds;
import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.Level;

public class PortalGunItem extends Item {
	public static final int MAX_CHARGES = 64;
	public static final int CHARGES_PER_FLUID = 16;
	public static final int START_CHARGES = 32;

	/** Set by the client entrypoint so sneak-using the gun opens the dial screen. */
	public static Consumer<InteractionHand> openDialHook = hand -> {
	};

	public PortalGunItem(Properties properties) {
		super(properties);
	}

	public static Identifier getDestination(ItemStack stack) {
		return stack.getOrDefault(ModComponents.DESTINATION, Destinations.HOME);
	}

	public static int getCharges(ItemStack stack) {
		return stack.getOrDefault(ModComponents.CHARGES, START_CHARGES);
	}

	public static void setCharges(ItemStack stack, int charges) {
		stack.set(ModComponents.CHARGES, Mth.clamp(charges, 0, MAX_CHARGES));
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (player.isShiftKeyDown()) {
			if (level.isClientSide()) {
				openDialHook.accept(hand);
			}
			return InteractionResult.SUCCESS;
		}
		Identifier dest = getDestination(stack);
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		ServerLevel server = (ServerLevel) level;
		Destination destination = Destinations.get(dest);
		if (destination == null || server.getServer().getLevel(destination.key()) == null) {
			player.displayClientMessage(Component.translatable("message.portalgun.unknown_dimension", dest.toString()).withStyle(ChatFormatting.RED), true);
			return InteractionResult.FAIL;
		}
		if (server.dimension().equals(destination.key())) {
			player.displayClientMessage(Component.translatable("message.portalgun.same_dimension", destination.name()).withStyle(ChatFormatting.YELLOW), true);
			level.playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.GUN_EMPTY, SoundSource.PLAYERS, 0.8F, 1.3F);
			return InteractionResult.FAIL;
		}
		if (!player.getAbilities().instabuild) {
			if (getCharges(stack) <= 0 && !reload(player, stack)) {
				player.displayClientMessage(Component.translatable("message.portalgun.empty").withStyle(ChatFormatting.RED), true);
				level.playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.GUN_EMPTY, SoundSource.PLAYERS, 1.0F, 1.0F);
				player.getCooldowns().addCooldown(stack, 10);
				return InteractionResult.FAIL;
			}
			setCharges(stack, getCharges(stack) - 1);
		}
		PortalShotEntity shot = new PortalShotEntity(server, player, dest);
		shot.shootFromRotation(player, player.getXRot(), player.getYRot(), 0.0F, 2.6F, 0.0F);
		server.addFreshEntity(shot);
		level.playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.GUN_FIRE, SoundSource.PLAYERS, 1.0F, 0.95F + level.getRandom().nextFloat() * 0.1F);
		player.getCooldowns().addCooldown(stack, 12);
		player.awardStat(Stats.ITEM_USED.get(this));
		return InteractionResult.SUCCESS_SERVER;
	}

	/** Pours a bottle of portal fluid from the inventory into the gun. */
	public static boolean reload(Player player, ItemStack gun) {
		for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
			ItemStack s = player.getInventory().getItem(i);
			if (s.is(ModItems.PORTAL_FLUID)) {
				s.shrink(1);
				ItemStack bottle = new ItemStack(Items.GLASS_BOTTLE);
				if (!player.getInventory().add(bottle)) {
					player.drop(bottle, false);
				}
				setCharges(gun, getCharges(gun) + CHARGES_PER_FLUID);
				player.level().playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.GUN_RELOAD, SoundSource.PLAYERS, 1.0F, 1.0F);
				player.displayClientMessage(Component.translatable("message.portalgun.reloaded", getCharges(gun)).withStyle(ChatFormatting.GREEN), true);
				return true;
			}
		}
		return false;
	}

	@Override
	public boolean isBarVisible(ItemStack stack) {
		return getCharges(stack) < MAX_CHARGES;
	}

	@Override
	public int getBarWidth(ItemStack stack) {
		return Math.round(13.0F * getCharges(stack) / MAX_CHARGES);
	}

	@Override
	public int getBarColor(ItemStack stack) {
		return 0x7CE84A;
	}

	@Override
	public void appendHoverText(ItemStack stack, TooltipContext context, TooltipDisplay display, Consumer<Component> out, TooltipFlag flag) {
		Destination d = Destinations.getOrHome(getDestination(stack));
		out.accept(Component.translatable("tooltip.portalgun.destination",
			Component.literal(d.code()).withStyle(ChatFormatting.GREEN),
			Component.literal(d.name()).withStyle(s -> s.withColor(d.color()))).withStyle(ChatFormatting.GRAY));
		out.accept(Component.literal("  " + d.tagline()).withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.ITALIC));
		out.accept(Component.translatable("tooltip.portalgun.charges", getCharges(stack), MAX_CHARGES).withStyle(ChatFormatting.GRAY));
		out.accept(Component.translatable("tooltip.portalgun.controls").withStyle(ChatFormatting.DARK_AQUA));
	}
}
