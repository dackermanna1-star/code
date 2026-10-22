package dev.juukulius.client.render.player;

import dev.juukulius.character.JuliusAppearance;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.client.anim.AnimatorManager;
import dev.juukulius.client.anim.PlayerAnimator;
import dev.juukulius.registry.JuliusItems;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.util.Mth;
import org.jspecify.annotations.Nullable;

/**
 * Fills a player's render state with Julius data: the animation pose and the outfit/aura parameters, including the
 * materialize/dissolve transition (the outfit fades in from light, the skin swaps under the brightest moment of the
 * flash, and the reverse on revert).
 */
public final class JuliusPlayerRendering {
	/** Ticks after the transform starts before the outfit begins to appear, and how long it takes. */
	private static final float MATERIALIZE_START = 6.0F;
	private static final float MATERIALIZE_TICKS = 12.0F;
	private static final float SKIN_SWAP_TICK = 11.0F;
	private static final float DISSOLVE_START = 3.0F;
	private static final float DISSOLVE_TICKS = 10.0F;

	private JuliusPlayerRendering() {
	}

	public static void extract(AbstractClientPlayer player, AvatarRenderState state, float partialTick) {
		JuliusAppearance appearance = JuliusAttachments.appearance(player);
		long gameTime = player.level().getGameTime();
		float now = gameTime + partialTick;
		float sinceChange = now - appearance.changeTime();
		boolean transitioning = sinceChange < 40.0F;

		PlayerAnimator animator = appearance.transformed() || transitioning ? AnimatorManager.get(player.getId()) : AnimatorManager.peek(player.getId());
		if (animator != null && (appearance.transformed() || transitioning || animator.hasAction())) {
			animator.update(player, state.walkAnimationPos, state.walkAnimationSpeed, appearance, partialTick);
			state.setData(JuliusRenderInfo.POSE, animator.snapshot.active ? animator.snapshot : null);
		} else {
			state.setData(JuliusRenderInfo.POSE, null);
		}

		JuliusRenderInfo info = compute(player, appearance, animator, now, sinceChange);
		state.setData(JuliusRenderInfo.INFO, info);
	}

	public static @Nullable JuliusRenderInfo compute(AbstractClientPlayer player, JuliusAppearance appearance, @Nullable PlayerAnimator animator, float now,
		float sinceChange) {
		float outfit;
		boolean skin;
		if (appearance.transformed()) {
			outfit = Mth.clamp((sinceChange - MATERIALIZE_START) / MATERIALIZE_TICKS, 0.0F, 1.0F);
			skin = sinceChange >= SKIN_SWAP_TICK;
		} else {
			outfit = 1.0F - Mth.clamp((sinceChange - DISSOLVE_START) / DISSOLVE_TICKS, 0.0F, 1.0F);
			skin = sinceChange < DISSOLVE_START + DISSOLVE_TICKS * 0.5F;
		}

		float flash = 0.0F;
		if (sinceChange >= 0.0F && sinceChange < 24.0F) {
			float peak = appearance.transformed() ? SKIN_SWAP_TICK : DISSOLVE_START + DISSOLVE_TICKS * 0.5F;
			flash = Math.max(0.0F, 1.0F - Math.abs(sinceChange - peak) / 7.0F);
		}

		boolean ultimate = appearance.ultimateActive((long) Math.floor(now));
		float aura = ultimate ? 0.75F + 0.15F * Mth.sin(now * 0.25F) : 0.0F;
		aura = Math.max(aura, flash);
		if (outfit <= 0.001F && aura <= 0.001F && !skin) {
			return null;
		}

		JuliusRenderInfo info = new JuliusRenderInfo();
		info.outfit = outfit;
		info.juliusSkin = skin;
		info.aura = aura;
		info.time = now / 20.0F;
		info.holdingSword = player.getMainHandItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD);
		// When the sword is not in hand it rests in its scabbard (other players' inventories are not visible to clients).
		info.swordSheathed = !info.holdingSword && !player.getOffhandItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD);
		if (appearance.transformed()) {
			float charge = animator != null ? animator.chargeProgress : 0.0F;
			info.clad = outfit * (0.5F + charge * 0.5F + (ultimate ? 0.35F : 0.0F));
		}

		if (animator != null) {
			float partial = now - (float) Math.floor(now);
			info.coatPitch = animator.physics.coatPitch.get(partial);
			info.coatRoll = animator.physics.coatRoll.get(partial);
			info.hairPitch = animator.physics.hairPitch.get(partial);
			info.hairRoll = animator.physics.hairRoll.get(partial);
		}

		return info;
	}
}
