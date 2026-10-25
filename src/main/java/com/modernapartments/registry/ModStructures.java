package com.modernapartments.registry;

import com.modernapartments.ModernApartments;
import com.modernapartments.world.ApartmentPiece;
import com.modernapartments.world.ApartmentStructure;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.levelgen.structure.StructureType;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType;

public final class ModStructures {
	public static StructureType<ApartmentStructure> APARTMENT_COMPLEX;
	public static StructurePieceType APARTMENT_PIECE;

	private ModStructures() {
	}

	public static void init() {
		APARTMENT_COMPLEX = Registry.register(BuiltInRegistries.STRUCTURE_TYPE, ModernApartments.id("apartment_complex"),
			() -> ApartmentStructure.CODEC);
		APARTMENT_PIECE = Registry.register(BuiltInRegistries.STRUCTURE_PIECE, ModernApartments.id("apartment_piece"),
			(StructurePieceType.ContextlessType) ApartmentPiece::new);
	}
}
