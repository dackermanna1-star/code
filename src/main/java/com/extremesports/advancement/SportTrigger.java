package com.extremesports.advancement;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.Optional;
import net.minecraft.advancements.criterion.ContextAwarePredicate;
import net.minecraft.advancements.criterion.EntityPredicate;
import net.minecraft.advancements.criterion.SimpleCriterionTrigger;
import net.minecraft.server.level.ServerPlayer;

/**
 * Advancement criterion fired by gameplay events, e.g. {"event": "combo", "min": 5000} or {"event": "trick:skateboard.kickflip"}.
 */
public class SportTrigger extends SimpleCriterionTrigger<SportTrigger.TriggerInstance> {
	@Override
	public Codec<TriggerInstance> codec() {
		return TriggerInstance.CODEC;
	}

	public void trigger(ServerPlayer player, String event, int value) {
		this.trigger(player, instance -> instance.event.equals(event) && value >= instance.min);
	}

	public record TriggerInstance(Optional<ContextAwarePredicate> player, String event, int min) implements SimpleCriterionTrigger.SimpleInstance {
		public static final Codec<TriggerInstance> CODEC = RecordCodecBuilder.create(instance -> instance.group(
			EntityPredicate.ADVANCEMENT_CODEC.optionalFieldOf("player").forGetter(TriggerInstance::player),
			Codec.STRING.fieldOf("event").forGetter(TriggerInstance::event),
			Codec.INT.optionalFieldOf("min", 0).forGetter(TriggerInstance::min)
		).apply(instance, TriggerInstance::new));
	}
}
