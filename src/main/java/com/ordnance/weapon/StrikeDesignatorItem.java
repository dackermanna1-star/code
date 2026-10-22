package com.ordnance.weapon;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.registry.ModItems;
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
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;
import net.minecraft.world.World;
import org.jspecify.annotations.Nullable;

/**
 * Laser target designator. Hold use to paint a target; keep the laser steady until it locks, then release to call
 * in a hypersonic missile (consumes one Hypersonic Missile from the inventory). Releasing early cancels.
 */
public class StrikeDesignatorItem extends Item {
	/**
	 * Lock state per player. The same rule runs on the client (HUD) and on the server (authority); singleplayer runs
	 * both in one JVM, so each side keeps its own map.
	 */
	private static final java.util.Map<java.util.UUID, Lock> CLIENT_LOCKS = new java.util.concurrent.ConcurrentHashMap<>();
	private static final java.util.Map<java.util.UUID, Lock> SERVER_LOCKS = new java.util.concurrent.ConcurrentHashMap<>();

	public StrikeDesignatorItem(Settings settings) {
		super(settings.maxCount(1));
	}

	@Nullable
	public static BlockHitResult raycastTarget(PlayerEntity player, float tickProgress) {
		int range = ConfigManager.get().weapons.missileStrike.maxRange;
		Vec3d eye = player.getCameraPosVec(tickProgress);
		Vec3d end = eye.add(player.getRotationVec(tickProgress).multiply(range));
		BlockHitResult hit = player.getEntityWorld().raycast(new RaycastContext(eye, end, RaycastContext.ShapeType.OUTLINE, RaycastContext.FluidHandling.ANY, player));
		return hit.getType() == HitResult.Type.MISS ? null : hit;
	}

	private static java.util.Map<java.util.UUID, Lock> locks(World world) {
		return world.isClient() ? CLIENT_LOCKS : SERVER_LOCKS;
	}

	/** Lock progress 0..1 for the player on its own side. */
	public static float lockProgress(PlayerEntity player) {
		Lock lock = locks(player.getEntityWorld()).get(player.getUuid());
		return lock == null ? 0.0F : Math.min(1.0F, lock.ticks / (float)ConfigManager.get().weapons.missileStrike.lockTicks);
	}

	@Nullable
	public static Vec3d lockedTarget(PlayerEntity player) {
		Lock lock = locks(player.getEntityWorld()).get(player.getUuid());
		return lock == null ? null : lock.target;
	}

	@Override
	public ActionResult use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);
		if (user.getItemCooldownManager().isCoolingDown(stack)) {
			return ActionResult.FAIL;
		}

		locks(world).remove(user.getUuid());
		user.setCurrentHand(hand);
		return ActionResult.CONSUME;
	}

	@Override
	public void usageTick(World world, LivingEntity user, ItemStack stack, int remainingUseTicks) {
		if (!(user instanceof PlayerEntity player)) {
			return;
		}

		BlockHitResult hit = raycastTarget(player, 1.0F);
		Lock lock = locks(world).computeIfAbsent(player.getUuid(), uuid -> new Lock());
		OrdnanceConfig.MissileStrike cfg = ConfigManager.get().weapons.missileStrike;
		if (hit == null) {
			lock.target = null;
			lock.ticks = 0;
			return;
		}

		Vec3d point = hit.getPos();
		if (lock.target != null && lock.target.squaredDistanceTo(point) < 2.5 * 2.5) {
			lock.ticks++;
		} else {
			lock.target = point;
			lock.ticks = 0;
		}

		if (!world.isClient()) {
			if (lock.ticks == cfg.lockTicks) {
				world.playSound(null, user.getX(), user.getY(), user.getZ(), ModSounds.DESIGNATOR_LOCK, SoundCategory.PLAYERS, 0.8F, 1.0F);
			} else if (lock.ticks < cfg.lockTicks && lock.ticks % 8 == 0) {
				world.playSound(null, user.getX(), user.getY(), user.getZ(), ModSounds.DESIGNATOR_BEEP, SoundCategory.PLAYERS, 0.5F, 1.0F + lock.ticks / (float)cfg.lockTicks);
			}
		}
	}

	@Override
	public boolean onStoppedUsing(ItemStack stack, World world, LivingEntity user, int remainingUseTicks) {
		if (!(user instanceof PlayerEntity player)) {
			return false;
		}

		Lock lock = locks(world).remove(player.getUuid());
		OrdnanceConfig.MissileStrike cfg = ConfigManager.get().weapons.missileStrike;
		if (world.isClient() || lock == null || lock.target == null || lock.ticks < cfg.lockTicks) {
			return false;
		}

		if (!WeaponHelper.consume(player, ModItems.HYPERSONIC_MISSILE)) {
			player.sendMessage(Text.translatable("message.ordnance.no_missile").formatted(Formatting.RED), true);
			return false;
		}

		MissileStrikeManager.schedule((ServerWorld)world, lock.target, player);
		player.getItemCooldownManager().set(stack, cfg.designatorCooldownTicks);
		world.playSound(null, user.getX(), user.getY(), user.getZ(), ModSounds.DESIGNATOR_CONFIRM, SoundCategory.PLAYERS, 1.0F, 1.0F);
		player.sendMessage(Text.translatable("message.ordnance.strike_confirmed", String.format("%.1f", cfg.countdownTicks / 20.0F)).formatted(Formatting.RED), true);
		return true;
	}

	@Override
	public int getMaxUseTime(ItemStack stack, LivingEntity user) {
		return 72000;
	}

	@Override
	public UseAction getUseAction(ItemStack stack) {
		return UseAction.SPYGLASS;
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, TooltipDisplayComponent displayComponent, Consumer<Text> textConsumer, TooltipType type) {
		textConsumer.accept(Text.translatable("item.ordnance.strike_designator.desc").formatted(Formatting.GRAY));
		textConsumer.accept(Text.translatable("tooltip.ordnance.designator_hint").formatted(Formatting.DARK_GRAY));
	}

	private static final class Lock {
		@Nullable
		Vec3d target;
		int ticks;
	}
}
