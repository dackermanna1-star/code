package com.ordnance.weapon;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.entity.GrenadeEntity;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.explosion.OrdnanceExplosion;
import com.ordnance.registry.ModSounds;
import java.util.function.Consumer;
import net.minecraft.component.type.TooltipDisplayComponent;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.consume.UseAction;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.stat.Stats;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * Hand grenade. Press use to pull the pin, release to throw: a quick tap lobs it, holding winds up a full throw.
 * With cooking enabled the fuse burns from the moment the pin is pulled, so holding shortens the time to detonation
 * after the throw; hold past the fuse and it detonates in hand.
 */
public class GrenadeItem extends Item implements ExplosiveItem {
	private static final int FULL_THROW_TICKS = 14;
	private final ExplosionProfile profile;

	public GrenadeItem(Settings settings, ExplosionProfile profile) {
		super(settings);
		this.profile = profile;
	}

	@Override
	public ExplosionProfile profile() {
		return this.profile;
	}

	private boolean cooks() {
		return ConfigManager.get().weapons.grenades.cooking && !this.profile.style().isSmoke();
	}

	@Override
	public ActionResult use(World world, PlayerEntity user, Hand hand) {
		if (user.getItemCooldownManager().isCoolingDown(user.getStackInHand(hand))) {
			return ActionResult.FAIL;
		}

		world.playSound(user, user.getX(), user.getY(), user.getZ(), ModSounds.GRENADE_PIN, SoundCategory.PLAYERS, 0.8F, 1.0F);
		user.setCurrentHand(hand);
		return ActionResult.CONSUME;
	}

	@Override
	public void usageTick(World world, LivingEntity user, ItemStack stack, int remainingUseTicks) {
		if (world.isClient() || !this.cooks()) {
			return;
		}

		int held = this.getMaxUseTime(stack, user) - remainingUseTicks;
		if (held >= ConfigManager.get().weapons.grenades.fuseTicks) {
			// Cooked too long: it goes off in hand.
			if (!(user instanceof PlayerEntity player) || !player.isInCreativeMode()) {
				stack.decrement(1);
			}

			user.clearActiveItem();
			Vec3d pos = user.getEyePos().add(user.getRotationVec(1.0F).multiply(0.4));
			OrdnanceExplosion.detonate((ServerWorld)world, pos, this.profile, null, user, new Vec3d(0.0, -1.0, 0.0));
		}
	}

	@Override
	public boolean onStoppedUsing(ItemStack stack, World world, LivingEntity user, int remainingUseTicks) {
		if (!(user instanceof PlayerEntity player)) {
			return false;
		}

		OrdnanceConfig.Grenades cfg = ConfigManager.get().weapons.grenades;
		int held = this.getMaxUseTime(stack, user) - remainingUseTicks;
		float strength = MathHelper.clamp(held / (float)FULL_THROW_TICKS, 0.3F, 1.0F);
		int fuse = this.cooks() ? Math.max(5, cfg.fuseTicks - held) : cfg.fuseTicks;
		world.playSound(user, user.getX(), user.getY(), user.getZ(), ModSounds.GRENADE_THROW, SoundCategory.PLAYERS, 0.7F, 0.9F + strength * 0.2F);
		if (world instanceof ServerWorld serverWorld) {
			GrenadeEntity grenade = new GrenadeEntity(serverWorld, user, stack, fuse);
			grenade.setVelocity(user, user.getPitch(), user.getYaw(), -8.0F * strength, cfg.throwSpeed * strength, 1.0F);
			serverWorld.spawnEntity(grenade);
		}

		player.incrementStat(Stats.USED.getOrCreateStat(this));
		player.swingHand(player.getActiveHand(), true);
		player.getItemCooldownManager().set(stack, 10);
		stack.decrementUnlessCreative(1, player);
		return true;
	}

	@Override
	public int getMaxUseTime(ItemStack stack, LivingEntity user) {
		return 72000;
	}

	@Override
	public UseAction getUseAction(ItemStack stack) {
		return UseAction.TRIDENT;
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, TooltipDisplayComponent displayComponent, Consumer<Text> textConsumer, TooltipType type) {
		textConsumer.accept(Text.translatable(this.getTranslationKey() + ".desc").formatted(Formatting.GRAY));
		float seconds = ConfigManager.get().weapons.grenades.fuseTicks / 20.0F;
		textConsumer.accept(Text.translatable("tooltip.ordnance.fuse", String.format("%.1f", seconds)).formatted(Formatting.DARK_GRAY));
		if (this.cooks()) {
			textConsumer.accept(Text.translatable("tooltip.ordnance.cook_hint").formatted(Formatting.DARK_GRAY));
		}
	}
}
