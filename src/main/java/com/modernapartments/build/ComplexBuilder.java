package com.modernapartments.build;

/** Generates one apartment complex into a fresh {@link BlockBuffer}. */
public interface ComplexBuilder {
	BlockBuffer build(long seed);
}
