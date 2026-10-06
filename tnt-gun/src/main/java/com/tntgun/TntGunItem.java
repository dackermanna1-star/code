package com.tntgun;

import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.item.PrimedTnt;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

public class TntGunItem extends Item {
    private static final double SPEED = 1.8;
    private static final int FUSE_TICKS = 30;
    private static final int COOLDOWN_TICKS = 10;

    public TntGunItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        ItemStack gun = player.getItemInHand(hand);
        boolean creative = player.getAbilities().instabuild;

        if (!creative && !consumeTnt(player)) {
            level.playSound(null, player.getX(), player.getY(), player.getZ(),
                    SoundEvents.DISPENSER_FAIL, SoundSource.PLAYERS, 1.0F, 1.2F);
            return InteractionResult.FAIL;
        }

        if (!level.isClientSide()) {
            Vec3 look = player.getLookAngle();
            PrimedTnt tnt = new PrimedTnt(level,
                    player.getX() + look.x, player.getEyeY() - 0.3 + look.y, player.getZ() + look.z, player);
            tnt.setDeltaMovement(look.scale(SPEED));
            tnt.setFuse(FUSE_TICKS);
            level.addFreshEntity(tnt);
        }

        level.playSound(null, player.getX(), player.getY(), player.getZ(),
                SoundEvents.GENERIC_EXPLODE.value(), SoundSource.PLAYERS, 0.4F, 1.8F);
        player.getCooldowns().addCooldown(gun, COOLDOWN_TICKS);
        return InteractionResult.SUCCESS;
    }

    private static boolean consumeTnt(Player player) {
        var inventory = player.getInventory();
        for (int i = 0; i < inventory.getContainerSize(); i++) {
            ItemStack stack = inventory.getItem(i);
            if (stack.is(Items.TNT)) {
                stack.shrink(1);
                return true;
            }
        }
        return false;
    }
}
