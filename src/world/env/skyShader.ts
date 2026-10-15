// Sky dome shader: Preetham daylight scattering (adapted from three's Sky addon), overcast greying, night sky with
// stars and moon, a procedural animated cloud layer, and horizon fog matched to the global height fog.
import { HEIGHT_FOG_GLSL } from '../../render/fog';

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize( position );
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww; // on the far plane
}
`;

export const skyFragment = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform float uTurbidity;
uniform float uRayleigh;
uniform float uMieCoef;
uniform float uMieG;
uniform float uSkyScale;
uniform float uSkyIntensity;
uniform float uSkyGrey;
uniform float uNight;
uniform float uCloudCover;
uniform float uCloudDark;
uniform float uCloudTime;
uniform vec2 uWind;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform vec3 uCamPos;
uniform vec3 uGround;
uniform float uStars;
uniform float uSunDisc;
uniform sampler2D tNoise;
varying vec3 vDir;

${HEIGHT_FOG_GLSL}

const float pi = 3.141592653589793;
const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;

float sunIntensity( float zenithAngleCos ) {
  zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
  return EE * max( 0.0, 1.0 - exp( -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
}
float rayleighPhase( float c ) { return 0.05968310365946075 * ( 1.0 + c * c ); }
float hgPhase( float c, float g ) {
  float g2 = g * g;
  return 0.07957747154594767 * ( 1.0 - g2 ) / pow( 1.0 - 2.0 * g * c + g2, 1.5 );
}

vec3 preetham( vec3 dir, vec3 sunDir ) {
  float sunE = sunIntensity( sunDir.y );
  vec3 betaR = totalRayleigh * uRayleigh;
  vec3 betaM = 0.434 * ( 0.2 * uTurbidity ) * 10E-18 * MieConst * uMieCoef;
  float zenithAngle = acos( max( 0.0, dir.y ) );
  float inv = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( max( 93.885 - zenithAngle * 180.0 / pi, 0.001 ), -1.253 ) );
  vec3 Fex = exp( -( betaR * 8.4E3 * inv + betaM * 1.25E3 * inv ) );
  float cosTheta = dot( dir, sunDir );
  vec3 betaRTheta = betaR * rayleighPhase( cosTheta * 0.5 + 0.5 );
  vec3 betaMTheta = betaM * hgPhase( cosTheta, uMieG );
  vec3 Lin = pow( sunE * ( ( betaRTheta + betaMTheta ) / ( betaR + betaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ), pow( sunE * ( ( betaRTheta + betaMTheta ) / ( betaR + betaM ) ) * Fex, vec3( 0.5 ) ),
              clamp( pow( 1.0 - sunDir.y, 5.0 ), 0.0, 1.0 ) );
  vec3 L0 = vec3( 0.1 ) * Fex;
  float sundisk = smoothstep( 0.99995, 0.99999, cosTheta );
  L0 += 3000.0 * Fex * sundisk * uSunDisc; // HDR disc (kept well inside half-float range for bloom/IBL)
  return ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
}

float hash13( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.zyx + 31.32 );
  return fract( ( p.x + p.y ) * p.z );
}

float stars( vec3 d ) {
  vec3 p = d * 260.0;
  vec3 c = floor( p );
  float h = hash13( c );
  if ( h < 0.9965 ) return 0.0;
  vec3 starPos = c + 0.5 + ( vec3( hash13( c + 1.3 ), hash13( c + 2.7 ), hash13( c + 4.1 ) ) - 0.5 ) * 0.6;
  float dd = length( p - starPos );
  float tw = 0.75 + 0.25 * sin( uCloudTime * ( 1.5 + h * 7.0 ) + h * 40.0 );
  return smoothstep( 0.35, 0.0, dd ) * ( h - 0.9965 ) / 0.0035 * tw;
}

float cloudDensity( vec2 uv ) {
  float n = texture2D( tNoise, uv ).r * 0.6 + texture2D( tNoise, uv * 2.7 + 0.31 ).g * 0.28 + texture2D( tNoise, uv * 7.3 - 0.17 ).b * 0.12;
  float t = mix( 0.66, 0.22, clamp( uCloudCover, 0.0, 1.0 ) );
  return smoothstep( t, t + 0.16, n );
}

void main() {
  vec3 dir = normalize( vDir );
  vec3 sd = normalize( uSunDir );
  // daylight scattering (evaluate above the horizon; mirror below for a plausible lower hemisphere)
  vec3 dUp = vec3( dir.x, max( dir.y, 0.0 ), dir.z );
  // three's Sky addon output curve (pow 1/2.4) keeps sunsets/zenith hues natural; scaled into scene radiance
  vec3 day = pow( max( preetham( normalize( dUp + vec3( 0.0, 0.0001, 0.0 ) ), sd ), 0.0 ), vec3( 1.0 / 2.4 ) ) * uSkyScale;
  // night sky
  float horizonGlow = pow( 1.0 - max( dir.y, 0.0 ), 3.0 );
  vec3 night = mix( vec3( 0.0012, 0.0022, 0.0055 ), vec3( 0.006, 0.009, 0.016 ), horizonGlow );
  float moonCos = dot( dir, normalize( uMoonDir ) );
  night += vec3( 0.05, 0.065, 0.09 ) * pow( max( moonCos, 0.0 ), 60.0 ) * 0.25;
  night += vec3( 0.7, 0.75, 0.85 ) * stars( dir ) * uStars * smoothstep( 0.0, 0.15, dir.y ) * ( 1.0 - uCloudCover );
  float moonDisc = smoothstep( 0.99985, 0.99992, moonCos );
  float moonTex = 0.75 + 0.25 * texture2D( tNoise, vec2( dir.x, dir.z ) * 40.0 ).g;
  night += vec3( 1.6, 1.62, 1.7 ) * moonDisc * moonTex * ( 1.0 - uCloudCover * 0.8 );
  vec3 col = mix( day, night, uNight );
  // overcast greying
  float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 grey = vec3( lum ) * vec3( 0.96, 0.98, 1.02 ) * ( 0.8 + 0.4 * max( dir.y, 0.0 ) );
  col = mix( col, grey, uSkyGrey ) * uSkyIntensity;

  // clouds on a plane ~1800 m above the camera
  if ( dir.y > 0.0 && uCloudCover > 0.01 ) {
    float t = ( 1800.0 - min( uCamPos.y, 1500.0 ) ) / max( dir.y, 0.02 );
    vec2 p = uCamPos.xz + dir.xz * t;
    vec2 uv = p / 9000.0 + uWind * uCloudTime;
    float dens = cloudDensity( uv );
    float shadow = cloudDensity( uv + sd.xz * 0.012 );
    float cosT = dot( dir, sd );
    float phase = hgPhase( cosT, 0.55 ) * 4.0 + 0.6;
    vec3 sunLit = uSunColor * ( 1.0 - uNight ) * phase * mix( 1.0, 0.35, shadow );
    vec3 amb = mix( vec3( 0.55, 0.62, 0.72 ), vec3( 0.45 ), uSkyGrey ) * uSkyScale * 0.9 * ( 1.0 - uNight * 0.97 ) + vec3( 0.004, 0.005, 0.008 ) * uNight;
    vec3 cloudCol = ( amb + sunLit * 0.55 ) * mix( 1.0, 0.32, uCloudDark ) * uSkyIntensity;
    float fade = smoothstep( 0.0, 0.18, dir.y );
    col = mix( col, cloudCol, dens * fade * mix( 0.9, 0.98, uCloudCover ) );
  }

  // below the horizon: ground/sea albedo lit by the sky (used by the IBL; normally hidden by terrain/ocean)
  if ( dir.y < 0.0 ) {
    vec3 groundCol = uGround * ( dot( day, vec3( 0.33 ) ) * ( 1.0 - uNight ) + 0.01 ) * uSkyIntensity;
    col = mix( col, groundCol, smoothstep( 0.0, -0.08, dir.y ) );
  }

  // horizon fog consistent with the scene's height fog (ray to ~6 km)
  vec3 rel = dir * 6000.0;
  float fogF = heightFogFactor( rel, uCamPos.y, uFogDensity, uFogFalloff );
  fogF = max( fogF, smoothstep( 0.2, -0.06, dir.y ) * min( 1.0, uFogDensity * 900.0 ) );
  col = mix( col, uFogColor, fogF * 0.97 );

  gl_FragColor = vec4( min( col, vec3( 2000.0 ) ), 1.0 );
}
`;
