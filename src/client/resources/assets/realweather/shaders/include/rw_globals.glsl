#version 330

// Vanilla's Globals block, extended by RealWeather with weather data appended after the vanilla fields.
// The UBO is enlarged accordingly, so vanilla shaders that declare the shorter block keep working unchanged.
layout(std140) uniform Globals {
    ivec3 CameraBlockPos;
    vec3 CameraOffset;
    vec2 ScreenSize;
    float GlintAlpha;
    float GameTime;
    int MenuBlurRadius;
    int UseRgss;

    ivec4 RW_CloudOrigin; // xy: integer noise-space position of the camera, z: noise period, w: feature flags
    vec4 RW_CloudFrac;    // xy: fractional noise-space position of the camera, z: time (s), w: daylight
    vec4 RW_Cloud;        // x: cover, y: cloud base (camera relative), z: thickness, w: shadow strength
    vec4 RW_Wind;         // xy: wind direction (x, z), z: wind speed incl. gusts (m/s), w: sway strength
    vec4 RW_Surface;      // x: wetness, y: wave phase, z: flutter phase, w: storm
    vec4 RW_Sun;          // xyz: direction towards the sun, w: sun visibility
};

const int RW_FLAG_SWAY = 1;
const int RW_FLAG_WET = 2;
const int RW_FLAG_SHADOWS = 4;

vec2 rw_noise_position(vec3 cameraRelative) {
    return vec2(RW_CloudOrigin.xy) + RW_CloudFrac.xy + cameraRelative.xz;
}
