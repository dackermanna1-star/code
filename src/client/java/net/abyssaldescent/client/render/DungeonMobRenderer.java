package net.abyssaldescent.client.render;

import java.util.function.Function;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.client.render.state.DungeonMobRenderState;
import net.abyssaldescent.entity.DungeonMonster;
import net.abyssaldescent.entity.EliteAffix;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.layers.LivingEntityEmissiveLayer;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.AnimationState;

/**
 * Renderer for custom-rigged dungeon enemies. Up to three action animations are mirrored into the render state by a
 * per-entity extractor; a fullbright glow layer adds eyes, runes and soul fire.
 */
public class DungeonMobRenderer<T extends DungeonMonster, M extends EntityModel<DungeonMobRenderState>> extends MobRenderer<T, DungeonMobRenderState, M> {
	public interface ActionStates<T> {
		AnimationState[] states(T entity);
	}

	private final Identifier texture;
	private final ActionStates<T> actions;

	public DungeonMobRenderer(EntityRendererProvider.Context context, M model, float shadow, String name, ActionStates<T> actions, boolean pulse) {
		super(context, model, shadow);
		this.texture = AbyssalDescent.id("textures/entity/" + name + ".png");
		this.actions = actions;
		Identifier glow = AbyssalDescent.id("textures/entity/" + name + (name.equals("crypt_ghoul") ? "_eyes" : "_glow") + ".png");
		Function<Identifier, net.minecraft.client.renderer.rendertype.RenderType> type = RenderTypes::entityTranslucentEmissive;
		addLayer(new LivingEntityEmissiveLayer<>(this, s -> glow,
			(s, t) -> pulse ? 0.75F + 0.25F * Mth.sin(t * 0.15F) : 1.0F, model, type, false));
	}

	@Override
	public Identifier getTextureLocation(DungeonMobRenderState state) {
		return texture;
	}

	@Override
	public DungeonMobRenderState createRenderState() {
		return new DungeonMobRenderState();
	}

	@Override
	public void extractRenderState(T entity, DungeonMobRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		AnimationState[] source = actions.states(entity);
		AnimationState[] target = {state.actionA, state.actionB, state.actionC};
		for (int i = 0; i < target.length; i++) {
			if (i < source.length) {
				target[i].copyFrom(source[i]);
			} else {
				target[i].stop();
			}
		}
		state.action = entity.action();
		EliteAffix affix = entity.affix();
		state.elite = affix != null;
		state.eliteColor = affix == null ? 0 : affix.color();
	}
}
