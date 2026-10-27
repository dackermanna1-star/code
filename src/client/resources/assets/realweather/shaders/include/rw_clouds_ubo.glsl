#version 330

layout(std140) uniform RealWeatherClouds {
    vec4 BoxMin;      // proxy box, camera relative
    vec4 BoxMax;
    vec4 Slab;        // x: base, y: top (camera relative), z: max distance, w: steps
    vec4 Shape;       // x: cover, y: density, z: storm, w: light steps
    vec4 LightDir;    // xyz: direction towards the light, w: intensity
    vec4 LightColor;  // rgb, w: ambient strength
    vec4 SkyTop;      // rgb: sky colour, w: time
    vec4 SkyBottom;   // rgb: ground bounce colour, w: frame counter
    vec4 Albedo;      // rgb, a: opacity
    vec4 FlashPos;    // xyz: lightning flash (camera relative), w: intensity
    vec4 Haze;        // rgb: haze colour, w: fade distance
    vec4 Detail;      // xy: detail drift, z: precipitation, w: camera inside layer
};
