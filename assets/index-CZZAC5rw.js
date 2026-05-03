(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const o of s)if(o.type==="childList")for(const a of o.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function t(s){const o={};return s.integrity&&(o.integrity=s.integrity),s.referrerPolicy&&(o.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?o.credentials="include":s.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function n(s){if(s.ep)return;s.ep=!0;const o=t(s);fetch(s.href,o)}})();const ae=`struct Uniforms {
  rotateX: f32,
  rotateY: f32,
  lensDensity: f32,
  imageAspectRatio: f32,
  canvasAspectRatio: f32,
  cardScale: f32,
  glareIntensity: f32,
  glossiness: f32,
  glitterIntensity: f32,
  holoIntensity: f32,
  radiantIntensity: f32,
  radiantScale: f32,
  radiantBrightness: f32,
  radiantArtworkIntensity: f32,
  time: f32,
  pokemonVIntensity: f32,
  pokemonVBrightness: f32,
  pokemonVScale: f32,
  pokemonVStripWidth: f32,
  pokemonVStripSoftness: f32,
  pokemonVArtworkAlpha: f32,
  lensTransition: f32,
  lensRidgeIntensity: f32,
  lensSwing: f32,
  pokemonVFingerprintScale: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var t0: texture_2d<f32>;
@group(0) @binding(3) var t1: texture_2d<f32>;
@group(0) @binding(4) var t2: texture_2d<f32>;
@group(0) @binding(5) var tFingerprint: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldPos: vec3f,
};

fn rotationX(angle: f32) -> mat3x3f {
  let c = cos(angle);
  let s = sin(angle);
  return mat3x3f(
    vec3f(1.0, 0.0, 0.0),
    vec3f(0.0, c, -s),
    vec3f(0.0, s, c)
  );
}

fn rotationY(angle: f32) -> mat3x3f {
  let c = cos(angle);
  let s = sin(angle);
  return mat3x3f(
    vec3f(c, 0.0, s),
    vec3f(0.0, 1.0, 0.0),
    vec3f(-s, 0.0, c)
  );
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Subdivided grid for proper perspective (16x16 grid = 256 cells = 1536 vertices)
  let gridSize = 16u;
  let cellIndex = vertexIndex / 6u;
  let vertInCell = vertexIndex % 6u;

  let cellX = cellIndex % gridSize;
  let cellY = cellIndex / gridSize;

  // Local vertex position within cell (2 triangles per cell)
  var localOffset: vec2f;
  switch(vertInCell) {
    case 0u: { localOffset = vec2f(0.0, 0.0); }
    case 1u: { localOffset = vec2f(1.0, 0.0); }
    case 2u: { localOffset = vec2f(1.0, 1.0); }
    case 3u: { localOffset = vec2f(0.0, 0.0); }
    case 4u: { localOffset = vec2f(1.0, 1.0); }
    case 5u, default: { localOffset = vec2f(0.0, 1.0); }
  }

  let gridF = f32(gridSize);
  let normalizedPos = (vec2f(f32(cellX), f32(cellY)) + localOffset) / gridF;

  // Map to [-1, 1] for position, [0, 1] for UV
  let pos2d = normalizedPos * 2.0 - 1.0;
  let uv = vec2f(normalizedPos.x, 1.0 - normalizedPos.y);

  // Card size based on image aspect ratio
  let cardHeight = uniforms.cardScale;
  let cardWidth = cardHeight * uniforms.imageAspectRatio;
  var pos3d = vec3f(pos2d.x * cardWidth, pos2d.y * cardHeight, 0.0);

  // Apply rotation
  let rotX = rotationX(uniforms.rotateX);
  let rotY = rotationY(uniforms.rotateY);
  pos3d = rotY * rotX * pos3d;

  // Perspective projection with proper depth handling
  let cameraZ = 4.0;
  let near = 0.1;
  let far = 10.0;
  let viewZ = pos3d.z + cameraZ;
  let perspectiveScale = 1.0 / viewZ;

  // Normalize depth to [0, 1] range for proper clipping
  let normalizedZ = (viewZ - near) / (far - near);

  // Apply canvas aspect ratio correction
  var projX = pos3d.x * perspectiveScale * cameraZ;
  var projY = pos3d.y * perspectiveScale * cameraZ;

  // Correct for canvas aspect ratio (so card doesn't stretch)
  if (uniforms.canvasAspectRatio > 1.0) {
    projX = projX / uniforms.canvasAspectRatio;
  } else {
    projY = projY * uniforms.canvasAspectRatio;
  }

  var out: VertexOutput;
  out.position = vec4f(projX, projY, normalizedZ, 1.0);
  out.uv = uv;
  out.worldPos = pos3d;
  return out;
}

// Blend mode functions
fn blendOverlay(base: vec3f, blend: vec3f) -> vec3f {
  return mix(
    2.0 * base * blend,
    1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
    step(vec3f(0.5), base)
  );
}

fn blendColorDodge(base: vec3f, blend: vec3f) -> vec3f {
  return min(base / max(1.0 - blend, vec3f(0.001)), vec3f(1.0));
}

fn blendSoftLight(base: vec3f, blend: vec3f) -> vec3f {
  return mix(
    2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
    sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
    step(vec3f(0.5), blend)
  );
}

fn blendExclusion(base: vec3f, blend: vec3f) -> vec3f {
  return base + blend - 2.0 * base * blend;
}

fn blendDarken(base: vec3f, blend: vec3f) -> vec3f {
  return min(base, blend);
}

fn blendHardLight(base: vec3f, blend: vec3f) -> vec3f {
  return mix(
    2.0 * base * blend,
    1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
    step(vec3f(0.5), blend)
  );
}

fn blendScreen(base: vec3f, blend: vec3f) -> vec3f {
  return 1.0 - (1.0 - base) * (1.0 - blend);
}

// Hash functions for noise
fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.x, p.y, p.x) * 0.13);
  let p3dot = dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z + p3dot);
}

fn hash2(p: vec2f) -> vec2f {
  return vec2f(hash(p), hash(p + vec2f(127.1, 311.7)));
}

// Shape functions for different glitter types
fn circleShape(localPos: vec2f, center: vec2f, size: f32) -> f32 {
  let dist = length(localPos - center);
  return 1.0 - smoothstep(0.0, size, dist);
}

fn diamondShape(localPos: vec2f, center: vec2f, size: f32) -> f32 {
  let d = abs(localPos - center);
  let dist = d.x + d.y;
  return 1.0 - smoothstep(0.0, size * 1.4, dist);
}

fn starShape(localPos: vec2f, center: vec2f, size: f32) -> f32 {
  let p = localPos - center;
  let angle = atan2(p.y, p.x);
  let radius = length(p);
  // 4-pointed star
  let star = abs(cos(angle * 2.0)) * 0.5 + 0.5;
  let targetRadius = size * (0.3 + star * 0.7);
  return 1.0 - smoothstep(0.0, targetRadius, radius);
}

// Glitter effect with multiple shapes (cosmos style)
fn cosmosGlitter(uv: vec2f, offset: vec2f, density: f32, viewAngle: vec2f) -> f32 {
  let scaledUV = uv * density + offset;
  let gridPos = floor(scaledUV);
  let localPos = fract(scaledUV);

  // Random values for this cell
  let cellHash = hash(gridPos);
  let cellHash2 = hash2(gridPos);

  // Only some cells have glitter
  if (cellHash < 0.5) {
    return 0.0;
  }

  // Random position within cell
  let glitterPos = cellHash2 * 0.6 + 0.2;

  // Choose shape based on hash (0: circle, 1: diamond, 2: star)
  let shapeType = i32(floor(cellHash * 3.0));
  let size = 0.1 + cellHash2.x * 0.1;

  var shape: f32;
  if (shapeType == 0) {
    shape = circleShape(localPos, glitterPos, size);
  } else if (shapeType == 1) {
    shape = diamondShape(localPos, glitterPos, size);
  } else {
    shape = starShape(localPos, glitterPos, size * 1.5);
  }

  // Glitter visibility depends on view angle matching the "facet" angle
  let facetAngle = cellHash2 * 2.0 - 1.0;
  let angleDiff = length(viewAngle - facetAngle);
  let angleMatch = 1.0 - smoothstep(0.0, 1.2, angleDiff);

  // Twinkle
  let twinkle = sin(cellHash * 50.0 + viewAngle.x * 8.0 + viewAngle.y * 6.0) * 0.4 + 0.6;

  return shape * angleMatch * twinkle;
}

// Check if UV is in the artwork/actor area
fn isInArtworkArea(uv: vec2f) -> f32 {
  // Artwork area bounds (adjust these to match your card layout)
  let left = 0.08;
  let right = 0.92;
  let top = 0.20;
  let bottom = 0.62;

  let inX = smoothstep(left - 0.02, left + 0.02, uv.x) * (1.0 - smoothstep(right - 0.02, right + 0.02, uv.x));
  let inY = smoothstep(top - 0.02, top + 0.02, uv.y) * (1.0 - smoothstep(bottom - 0.02, bottom + 0.02, uv.y));

  return inX * inY;
}

// Vertical Holo Beam effect (Regular Holo Rare)
fn holoBeamEffect(uv: vec2f, pointerPos: vec2f, time: f32) -> vec3f {
  // Move beams based on rotation
  let relX = 0.5 - pointerPos.x;
  let relY = 0.5 - pointerPos.y;
  
  // Two layers of slanted beams for perspective and depth
  // Layer 1: Slanted based on vertical pointer position
  let beamX1 = uv.x + (relX * 1.5) + (pointerPos.y * 0.4);
  // Layer 2: Slanted differently
  let beamX2 = uv.x + (relX * -0.8) - (pointerPos.y * 0.6);
  
  // Create grouped vertical beams for each layer
  var beams1 = 0.0;
  beams1 += smoothstep(0.12, 0.0, abs(fract(beamX1 * 2.0 + 0.1) - 0.5));
  beams1 += smoothstep(0.08, 0.0, abs(fract(beamX1 * 4.0 + 0.5) - 0.5)) * 0.7;
  beams1 += smoothstep(0.04, 0.0, abs(fract(beamX1 * 10.0 + 0.8) - 0.5)) * 0.5;

  var beams2 = 0.0;
  beams2 += smoothstep(0.12, 0.0, abs(fract(beamX2 * 1.5 + 0.3) - 0.5));
  beams2 += smoothstep(0.08, 0.0, abs(fract(beamX2 * 5.0 + 0.7) - 0.5)) * 0.7;
  beams2 += smoothstep(0.04, 0.0, abs(fract(beamX2 * 12.0 + 0.2) - 0.5)) * 0.5;
  
  let combinedBeams = max(beams1, beams2);

  // Rainbow color mapped to the primary movement
  let hue = fract(beamX1 * 0.1 + uv.y * 0.05 + time * 0.01);
  let rainbow = vec3f(
    0.5 + 0.5 * sin(hue * 6.28),
    0.5 + 0.5 * sin(hue * 6.28 + 2.09),
    0.5 + 0.5 * sin(hue * 6.28 + 4.18)
  );

  // GLARE RESPONSE: Mask beams so they are strongest near the glare
  let glareDist = length(uv - pointerPos);
  let glareMask = smoothstep(1.0, 0.2, glareDist);
  
  // VERTICAL VARIATION: Make them less uniform top-to-bottom
  let verticalNoise = sin(uv.y * 8.0 + beamX1 * 5.0 + time * 0.5) * 0.15 + 0.85;

  // Sharp vertical scanlines/stripes
  let scanline = step(0.6, fract(uv.x * 250.0)) * 0.4 + 0.6;
  
  // Add a "core" brightness to beams where they are most intense
  let beamCore = pow(combinedBeams, 4.0) * glareMask * 2.5;
  
  // Combine everything
  let finalHolo = (rainbow * combinedBeams * glareMask * verticalNoise + vec3f(beamCore * 0.4)) * scanline;
  
  return finalHolo * 1.2;
}

fn getRadiantBars(pos: f32) -> f32 {
  let p = fract(pos);
  // Boosted Pyramid: 0.15 -> 0.3 -> 0.5 -> 0.65 -> 0.8 -> 0.65 -> 0.5 -> 0.3 -> 0.15 -> 0.0
  let s = floor(p * 10.0);
  var v: f32;
  if (s == 0.0) { v = 0.15; }
  else if (s == 1.0) { v = 0.3; }
  else if (s == 2.0) { v = 0.5; }
  else if (s == 3.0) { v = 0.65; }
  else if (s == 4.0) { v = 0.8; }
  else if (s == 5.0) { v = 0.65; }
  else if (s == 6.0) { v = 0.5; }
  else if (s == 7.0) { v = 0.3; }
  else if (s == 8.0) { v = 0.15; }
  else { v = 0.0; }
  return v;
}

// Radiant Holo effect based on the CSS reference:
// Uses exclusion and darken blend modes with a radial spotlight and diagonal bars.
fn radiantHoloEffect(uv: vec2f, pointerPos: vec2f, time: f32) -> vec3f {
  let view = (pointerPos - 0.5) * 2.0;
  
  // The CSS uses background-position with 1.5 multiplier
  let backgroundShift = view * 0.75;
  
  // Frequency inversely proportional to scale (higher scale = larger bars)
  let freq = 8.33 / uniforms.radiantScale;
  
  // Layer 3: -45deg linear gradient
  let barPos3 = (uv.x - uv.y) * freq + backgroundShift.x - backgroundShift.y;
  let bars3 = getRadiantBars(barPos3);
  
  // Layer 2: 45deg linear gradient
  let barPos2 = (uv.x + uv.y) * freq + backgroundShift.x + backgroundShift.y;
  let bars2 = getRadiantBars(barPos2);
  
  // Layer 1: Radial gradient (spotlight)
  let spotlightCenter = pointerPos * 0.5 + 0.25;
  let dist = length(uv - spotlightCenter);
  // Bright center, fading out but keeping a base glow
  let radial = mix(1.0, 0.4, smoothstep(0.1, 0.8, dist));
  
  // Blending the layers (following CSS background-blend-mode: exclusion, darken)
  // To make the "top" strips stronger, we can use a weighted average or a max blend for highlights
  let blend23 = min(bars2, bars3);
  let highlights = max(bars2, bars3) * 0.4; // Subtle secondary layer
  let combinedBars = blend23 + highlights;
  
  let shine = blendExclusion(vec3f(radial), vec3f(combinedBars));
  
  // Filter: Re-balanced to be less "strong" overall but keeping the strips sharp
  var filteredShine = shine * 0.7; // Lower base brightness
  filteredShine = (filteredShine - 0.45) * 2.2 + 0.5; // High contrast for sharpness
  
  return clamp(filteredShine, vec3f(0.0), vec3f(1.0)) * uniforms.radiantBrightness;
}

fn rainbowColor(t: f32) -> vec3f {
  let p = fract(t);
  let c1 = vec3f(1.0, 0.2, 0.6); // Pink
  let c2 = vec3f(0.6, 0.2, 0.9); // Purple
  let c3 = vec3f(0.1, 0.4, 1.0); // Blue
  let c4 = vec3f(0.1, 1.0, 0.4); // Green
  let c5 = vec3f(1.0, 0.9, 0.2); // Yellow
  let c6 = vec3f(1.0, 0.4, 0.1); // Orange

  if (p < 1.0 / 6.0) {
    return mix(c1, c2, p * 6.0);
  } else if (p < 2.0 / 6.0) {
    return mix(c2, c3, (p - 1.0 / 6.0) * 6.0);
  } else if (p < 3.0 / 6.0) {
    return mix(c3, c4, (p - 2.0 / 6.0) * 6.0);
  } else if (p < 4.0 / 6.0) {
    return mix(c4, c5, (p - 3.0 / 6.0) * 6.0);
  } else if (p < 5.0 / 6.0) {
    return mix(c5, c6, (p - 4.0 / 6.0) * 6.0);
  }
  return mix(c6, c1, (p - 5.0 / 6.0) * 6.0);
}

// HSL to RGB conversion
fn hsl2rgb(h: f32, s: f32, l: f32) -> vec3f {
  let c = (1.0 - abs(2.0 * l - 1.0)) * s;
  let x = c * (1.0 - abs(fract(h / 60.0) * 2.0 - 1.0));
  let m = l - c / 2.0;
  var rgb: vec3f;
  let hue = fract(h / 360.0) * 360.0;
  if (hue < 60.0) {
    rgb = vec3f(c, x, 0.0);
  } else if (hue < 120.0) {
    rgb = vec3f(x, c, 0.0);
  } else if (hue < 180.0) {
    rgb = vec3f(0.0, c, x);
  } else if (hue < 240.0) {
    rgb = vec3f(0.0, x, c);
  } else if (hue < 300.0) {
    rgb = vec3f(x, 0.0, c);
  } else {
    rgb = vec3f(c, 0.0, x);
  }
  return rgb + vec3f(m);
}

// Scattered color set: purple, green, yellow
fn sunpillarColor(t: f32) -> vec3f {
  let p = fract(t);
  // 3 main colors that cycle with high contrast
  let purple = hsl2rgb(280.0, 1.0, 0.50);  // Vibrant purple
  let green = hsl2rgb(120.0, 1.0, 0.45);   // Bright green
  let yellow = hsl2rgb(55.0, 1.0, 0.50);   // Golden yellow

  if (p < 1.0 / 3.0) {
    return mix(purple, green, p * 3.0);
  } else if (p < 2.0 / 3.0) {
    return mix(green, yellow, (p - 1.0 / 3.0) * 3.0);
  }
  return mix(yellow, purple, (p - 2.0 / 3.0) * 3.0);
}

// Procedural fingerprint/illusion pattern - wavy concentric lines
fn fingerprintPattern(uv: vec2f, scale: f32) -> f32 {
  let p = uv * scale;

  // Multiple center points for the wavy pattern
  let center1 = vec2f(0.3, 0.3);
  let center2 = vec2f(0.7, 0.7);
  let center3 = vec2f(0.5, 0.5);

  // Distance from each center with wave distortion
  let d1 = length(p - center1 * scale);
  let d2 = length(p - center2 * scale);
  let d3 = length(p - center3 * scale);

  // Add wavy distortion based on angle
  let angle1 = atan2(p.y - center1.y * scale, p.x - center1.x * scale);
  let angle2 = atan2(p.y - center2.y * scale, p.x - center2.x * scale);

  let wave1 = d1 + sin(angle1 * 3.0) * 0.3 + sin(angle1 * 7.0) * 0.15;
  let wave2 = d2 + sin(angle2 * 4.0 + 1.0) * 0.25 + sin(angle2 * 5.0) * 0.1;
  let wave3 = d3 + sin(d3 * 0.5) * 0.2;

  // Create concentric rings from each center
  let rings1 = sin(wave1 * 12.0) * 0.5 + 0.5;
  let rings2 = sin(wave2 * 10.0 + 2.0) * 0.5 + 0.5;
  let rings3 = sin(wave3 * 8.0 + 1.5) * 0.5 + 0.5;

  // Combine the patterns
  let combined = (rings1 + rings2 + rings3) / 3.0;

  // Sharpen to create distinct lines
  return smoothstep(0.4, 0.6, combined);
}

fn vDiagonalBand(pos: f32) -> f32 {
  let p = fract(pos);
  let leadingEdge = smoothstep(0.315, 0.37, p);
  let trailingEdge = 1.0 - smoothstep(0.43, 0.49, p);
  let core = exp(-pow((p - 0.405) * 26.0, 2.0));
  let shoulder = smoothstep(0.08, 0.0, abs(p - 0.405)) * 0.55;
  return clamp(leadingEdge * trailingEdge + core * 1.25 + shoulder, 0.0, 1.0);
}

// Hue blend mode - shifts the hue of base to match blend
fn blendHue(base: vec3f, blend: vec3f) -> vec3f {
  // Simplified hue blending: multiply base luminance by blend color normalized
  let baseLum = dot(base, vec3f(0.299, 0.587, 0.114));
  let blendLum = dot(blend, vec3f(0.299, 0.587, 0.114));
  if (blendLum < 0.01) { return base; }
  return blend * (baseLum / blendLum);
}

// Single strip layer - color based on light angle for holographic effect
fn pokemonVStrips(uv: vec2f, pointerPos: vec2f, direction: f32, scale: f32) -> vec4f {
  let view = (pointerPos - 0.5) * 2.0;

  // Background position shift - strips move based on pointer
  let bgShift = view * direction * 0.6;

  // Diagonal strips at 133 degrees
  let angle133 = radians(133.0);
  let diagDir = vec2f(cos(angle133), sin(angle133));
  let diagPos = dot(uv + bgShift * 0.5, diagDir) * 3.0 / scale;

  // Strip pattern with adjustable width and softness
  let fp = fract(diagPos);
  let stripW = uniforms.pokemonVStripWidth;
  let softness = uniforms.pokemonVStripSoftness;
  let bandStart = 0.04;
  let bandEnd = bandStart + stripW;
  let stripMask = smoothstep(bandStart - softness, bandStart + softness, fp) *
                  (1.0 - smoothstep(bandEnd - softness, bandEnd + softness, fp));

  // Color based on light angle - shifts as you tilt the card
  let lightAngle = atan2(view.y, view.x) / 6.28 + 0.5; // Normalize to 0-1
  let viewMagnitude = length(view);

  // Combine light angle with position for rainbow shift effect
  let colorShift = lightAngle + viewMagnitude * 0.3 + direction * 0.15;
  var stripColor = sunpillarColor(colorShift);

  // Boost color vibrancy and add dazzle
  stripColor = stripColor * 1.8;

  // Add white highlight for extra shine
  let highlight = pow(stripMask, 2.0) * 0.3;
  stripColor = stripColor + vec3f(highlight);

  return vec4f(stripColor, stripMask);
}

fn pokemonVLayer(uv: vec2f, pointerPos: vec2f, direction: f32, scale: f32) -> vec3f {
  let view = (pointerPos - 0.5) * 2.0;

  // === TWO SETS OF STRIPS moving in opposite directions ===
  let strips1 = pokemonVStrips(uv, pointerPos, direction, scale);
  let strips2 = pokemonVStrips(uv, pointerPos, -direction, scale * 0.85);

  // Offset the second set slightly for visual variety
  let strips2Offset = pokemonVStrips(uv + vec2f(0.05, -0.03), pointerPos, -direction * 0.7, scale * 1.1);

  // Additive color blending - colors mix where strips overlap
  var totalColor = vec3f(0.0);
  var totalAlpha = 0.0;

  // Accumulate colors with their alpha weights
  totalColor += strips1.rgb * strips1.a;
  totalAlpha += strips1.a;

  totalColor += strips2.rgb * strips2.a;
  totalAlpha += strips2.a;

  totalColor += strips2Offset.rgb * strips2Offset.a * 0.6;
  totalAlpha += strips2Offset.a * 0.6;

  // Blend the accumulated colors (additive blend creates color mixing)
  let blendedColor = totalColor / max(totalAlpha, 0.01);
  let blendIntensity = min(totalAlpha, 1.0);

  // Screen blend for brightness where strips overlap
  var result = blendedColor * blendIntensity + totalColor * 0.3;

  // === Apply single fingerprint mask to all combined strips ===
  let fpUV = uv * uniforms.pokemonVFingerprintScale; // Tile the texture
  let fingerprint = textureSample(tFingerprint, s, fpUV).r;
  result = result * fingerprint;

  // === Radial Spotlight ===
  let lightCenter = pointerPos;
  let radialDist = length(uv - lightCenter);
  let spotlightMask = 1.0 - smoothstep(0.0, 0.9, radialDist) * 0.25;

  result = result * spotlightMask;

  // === Grain texture ===
  let grain = hash(uv * 500.0 + direction * 17.3) * 0.08;
  result += vec3f(grain * blendIntensity);

  // Boost saturation for vibrant colors
  let grey = dot(result, vec3f(0.299, 0.587, 0.114));
  result = mix(vec3f(grey), result, 2.8);

  // Contrast and brightness boost for dazzling effect
  result = (result - 0.1) * 1.5 + 0.1;

  // Add bloom/glow effect
  let glow = pow(max(result, vec3f(0.0)), vec3f(0.8)) * 0.2;
  result = result + glow;

  return clamp(result, vec3f(0.0), vec3f(1.0));
}

fn pokemonVEffect(uv: vec2f, pointerPos: vec2f) -> vec3f {
  // Main layer with two crossing strip sets built-in
  let mainLayer = pokemonVLayer(uv, pointerPos, 1.0, uniforms.pokemonVScale);

  let edgeMask = smoothstep(0.0, 0.018, uv.x) * (1.0 - smoothstep(0.982, 1.0, uv.x)) *
                 smoothstep(0.0, 0.018, uv.y) * (1.0 - smoothstep(0.982, 1.0, uv.y));
  return clamp(mainLayer * uniforms.pokemonVBrightness * edgeMask, vec3f(0.0), vec3f(1.0));
}

// Cosmos/Galaxy glitter effect
fn cosmosEffect(uv: vec2f, pointerPos: vec2f, time: f32) -> vec3f {
  let viewAngle = (pointerPos - 0.5) * 2.0;

  // Multiple layers at different densities
  let layer1 = cosmosGlitter(uv, viewAngle * 0.15, 25.0, viewAngle);
  let layer2 = cosmosGlitter(uv, vec2f(0.33, 0.33) + viewAngle * 0.2, 20.0, viewAngle * 0.9);
  let layer3 = cosmosGlitter(uv, vec2f(0.66, 0.66) + viewAngle * 0.1, 30.0, viewAngle * 1.1);

  let combined = max(max(layer1, layer2), layer3);

  // Rainbow/holographic color
  let hue = fract(uv.x * 0.5 + uv.y * 0.5 + viewAngle.x * 0.3 + time * 0.1);
  let glitterColor = vec3f(
    0.5 + 0.5 * sin(hue * 6.28),
    0.5 + 0.5 * sin(hue * 6.28 + 2.09),
    0.5 + 0.5 * sin(hue * 6.28 + 4.18)
  );

  // Make it brighter and more white-ish
  let finalColor = mix(vec3f(1.0), glitterColor, 0.6);

  return finalColor * combined;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let uv = in.uv;

  // Sample all textures
  let c0 = textureSample(t0, s, uv);
  let c1 = textureSample(t1, s, uv);
  let c2 = textureSample(t2, s, uv);

  // Lenticular effect based on Y rotation (horizontal tilt)
  let angle = clamp(uniforms.rotateY / 0.6, -1.0, 1.0);
  let t = (angle + 1.0) * 0.5;

  // Create lenticular strips
  let stripPhase = fract(uv.x * uniforms.lensDensity + angle * uniforms.lensDensity * 0.5);

  // Combine global angle with local strip position
  let lensAngle = t + (stripPhase - 0.5) * uniforms.lensSwing;
  let normalizedAngle = clamp(lensAngle, 0.0, 1.0);

  // Smooth transitions between 3 images
  let transitionWidth = uniforms.lensTransition;
  let mask0 = 1.0 - smoothstep(0.33 - transitionWidth, 0.33 + transitionWidth, normalizedAngle);
  let mask1 = smoothstep(0.33 - transitionWidth, 0.33 + transitionWidth, normalizedAngle) *
              (1.0 - smoothstep(0.66 - transitionWidth, 0.66 + transitionWidth, normalizedAngle));
  let mask2 = smoothstep(0.66 - transitionWidth, 0.66 + transitionWidth, normalizedAngle);

  var color = c0 * mask0 + c1 * mask1 + c2 * mask2;

  // Lens ridge effect
  let ridgeHighlight = exp(-pow(stripPhase - 0.5, 2.0) * 30.0) * 0.08 * uniforms.lensRidgeIntensity;
  let ridgeShadow = 1.0 - pow(abs(stripPhase - 0.5) * 2.0, 0.7) * 0.06 * uniforms.lensRidgeIntensity;
  color = color * ridgeShadow;
  color += vec4f(ridgeHighlight, ridgeHighlight, ridgeHighlight, 0.0);

  // ============ HOLOGRAPHIC EFFECTS ============

  // Pointer position from rotation (normalized 0-1)
  let pointerX = (uniforms.rotateY / 0.5 + 1.0) * 0.5;
  let pointerY = (-uniforms.rotateX / 0.3 + 1.0) * 0.5;
  let pointerPos = vec2f(pointerX, pointerY);

  // Distance from center for intensity calculations
  let pointerFromCenter = length(pointerPos - vec2f(0.5, 0.5)) * 2.0;

  // --- 1. Glare/Shine Effect ---
  if (uniforms.glareIntensity > 0.0) {
    // Radial gradient from pointer position
    let glareCenter = pointerPos;
    let glareDist = length(uv - glareCenter);

    // Soft radial glare
    let glare = 1.0 - smoothstep(0.0, 0.8, glareDist);
    let glareColor = vec3f(1.0, 1.0, 1.0) * glare * glare;

    // Apply with overlay
    let glareBlend = blendOverlay(color.rgb, glareColor);
    color = vec4f(mix(color.rgb, glareBlend, uniforms.glareIntensity * glare), color.a);

    // Edge darkening
    let edgeDark = smoothstep(0.3, 1.0, glareDist) * 0.2;
    color = vec4f(color.rgb * (1.0 - edgeDark * uniforms.glareIntensity), color.a);
  }

  // --- 2. Holographic Effects ---
  let artworkMask = isInArtworkArea(uv);
  
  // 2a. Cosmos Glitter
  if (uniforms.glitterIntensity > 0.0) {
    let glitterValue = cosmosEffect(uv, pointerPos, uniforms.time);
    
    // Glitter is strictly restricted to the artwork area
    let mask = artworkMask;

    if (mask > 0.0) {
      // Apply with color-dodge blend for bright sparkles
      let glitterBlend = blendColorDodge(color.rgb, glitterValue * mask);
      color = vec4f(mix(color.rgb, glitterBlend, uniforms.glitterIntensity), color.a);

      // Add soft-light layer for subtler effect
      let softGlitter = blendSoftLight(color.rgb, glitterValue * 0.5 * mask);
      color = vec4f(mix(color.rgb, softGlitter, uniforms.glitterIntensity * 0.3), color.a);
    }
  }

  // 2b. Vertical Holo Beams (artwork area only)
  if (artworkMask > 0.0 && uniforms.holoIntensity > 0.0) {
    let holoBeamValue = holoBeamEffect(uv, pointerPos, uniforms.time);
    let holoBeamBlend = blendColorDodge(color.rgb, holoBeamValue);
    color = vec4f(mix(color.rgb, holoBeamBlend, uniforms.holoIntensity * artworkMask), color.a);
  }

  // 2c. Radiant Holo (Criss-cross) - applies to the whole card
  if (uniforms.radiantIntensity > 0.0) {
    // Card mask to keep it inside the borders (rounded corners feel)
    let cardMask = smoothstep(0.0, 0.02, uv.x) * (1.0 - smoothstep(0.98, 1.0, uv.x)) *
                   smoothstep(0.0, 0.02, uv.y) * (1.0 - smoothstep(0.98, 1.0, uv.y));
                   
    let intensity = uniforms.radiantIntensity * cardMask;
    
    // Radiant Shine layer (monochromatic grid)
    let radiantShine = radiantHoloEffect(uv, pointerPos, uniforms.time);
    
    // Control intensity in the artwork area via uniform
    let localIntensity = mix(intensity, intensity * uniforms.radiantArtworkIntensity, artworkMask);
    
    color = vec4f(blendColorDodge(color.rgb, radiantShine * localIntensity), color.a);
  }

  // 2d. Pokemon V diagonal foil: two color-dodge shine layers moving in opposite directions.
  if (uniforms.pokemonVIntensity > 0.0) {
    let vShine = pokemonVEffect(uv, pointerPos);
    // Reduce intensity in artwork area based on artwork alpha
    let vIntensity = mix(uniforms.pokemonVIntensity, uniforms.pokemonVIntensity * uniforms.pokemonVArtworkAlpha, artworkMask);
    // Apply pure color-dodge for the high-intensity holographic look
    let dodged = blendColorDodge(color.rgb, vShine * vIntensity);
    color = vec4f(dodged, color.a);
  }

  // --- 4. Glossy Reflection / Fresnel Effect ---
  if (uniforms.glossiness > 0.0) {
    // Fresnel: more reflective at glancing angles (edges when tilted)
    let viewAngle = length(vec2f(uniforms.rotateX, uniforms.rotateY));
    let fresnel = pow(1.0 - cos(viewAngle), 2.0) * 0.5 * uniforms.glossiness;

    // Smooth gradient reflection based on rotation
    let reflectY = (uniforms.rotateX / 0.3) * 0.5 + 0.5;
    let reflectGradient = smoothstep(0.0, 1.0, uv.y * (1.0 - reflectY) + (1.0 - uv.y) * reflectY);
    let reflection = reflectGradient * fresnel;

    // Add soft white reflection
    color = vec4f(color.rgb + vec3f(reflection * 0.4), color.a);

    // Glossy highlight band that moves with tilt
    let highlightPos = 0.5 - uniforms.rotateX * 1.5;
    let highlightBand = exp(-pow((uv.y - highlightPos) * 3.0, 2.0)) * 0.2 * uniforms.glossiness;
    color = vec4f(color.rgb + vec3f(highlightBand), color.a);

    // Edge highlight for that laminated card look
    let edgeFresnel = pow(1.0 - abs(uv.x - 0.5) * 2.0, 0.5) * pow(1.0 - abs(uv.y - 0.5) * 2.0, 0.5);
    let edgeHighlight = (1.0 - edgeFresnel) * 0.1 * uniforms.glossiness * (1.0 + fresnel);
    color = vec4f(color.rgb + vec3f(edgeHighlight), color.a);
  }

  // --- 5. Subtle grain texture ---
  let grain = (hash(uv * 500.0 + uniforms.time) - 0.5) * 0.02;
  color = vec4f(color.rgb + grain, color.a);

  // --- 6. Dynamic brightness/contrast based on rotation ---
  let dynamicBrightness = 1.0 + pointerFromCenter * 0.05;
  color = vec4f(color.rgb * dynamicBrightness, color.a);

  // --- 7. Overall glossy sheen ---
  let sheen = pow(max(0.0, 1.0 - pointerFromCenter), 3.0) * 0.1 * uniforms.glossiness;
  color = vec4f(color.rgb + vec3f(sheen), color.a);

  return color;
}
`,de=`@group(0) @binding(0) var bgSampler: sampler;
@group(0) @binding(1) var bgTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> aspectRatios: vec2f; // canvas, image

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0)
  );

  var out: VertexOutput;
  out.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  out.uv = uvs[vertexIndex];
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  var uv = in.uv;

  let canvasAR = aspectRatios.x;
  let imageAR = aspectRatios.y;

  // Cover mode - fill the entire canvas
  if (canvasAR > imageAR) {
    let scale = canvasAR / imageAR;
    uv.y = (uv.y - 0.5) / scale + 0.5;
  } else {
    let scale = imageAR / canvasAR;
    uv.x = (uv.x - 0.5) / scale + 0.5;
  }

  let color = textureSample(bgTexture, bgSampler, uv);

  // Slight darkening/vignette for better card visibility
  let vignette = 1.0 - length(in.uv - 0.5) * 0.3;

  return vec4f(color.rgb * vignette * 0.8, 1.0);
}
`,ce=`struct Uniforms {
  rotateX: f32,
  rotateY: f32,
  cardScale: f32,
  imageAspectRatio: f32,
  canvasAspectRatio: f32,
  shadowOpacity: f32,
  shadowSoftness: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn rotationX(angle: f32) -> mat3x3f {
  let c = cos(angle);
  let s = sin(angle);
  return mat3x3f(
    vec3f(1.0, 0.0, 0.0),
    vec3f(0.0, c, -s),
    vec3f(0.0, s, c)
  );
}

fn rotationY(angle: f32) -> mat3x3f {
  let c = cos(angle);
  let s = sin(angle);
  return mat3x3f(
    vec3f(c, 0.0, s),
    vec3f(0.0, 1.0, 0.0),
    vec3f(-s, 0.0, c)
  );
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Same grid as card for consistent shape
  let gridSize = 16u;
  let cellIndex = vertexIndex / 6u;
  let vertInCell = vertexIndex % 6u;

  let cellX = cellIndex % gridSize;
  let cellY = cellIndex / gridSize;

  var localOffset: vec2f;
  switch(vertInCell) {
    case 0u: { localOffset = vec2f(0.0, 0.0); }
    case 1u: { localOffset = vec2f(1.0, 0.0); }
    case 2u: { localOffset = vec2f(1.0, 1.0); }
    case 3u: { localOffset = vec2f(0.0, 0.0); }
    case 4u: { localOffset = vec2f(1.0, 1.0); }
    case 5u, default: { localOffset = vec2f(0.0, 1.0); }
  }

  let gridF = f32(gridSize);
  let normalizedPos = (vec2f(f32(cellX), f32(cellY)) + localOffset) / gridF;
  let pos2d = normalizedPos * 2.0 - 1.0;
  let uv = vec2f(normalizedPos.x, 1.0 - normalizedPos.y);

  // Card size
  let cardHeight = uniforms.cardScale;
  let cardWidth = cardHeight * uniforms.imageAspectRatio;
  var pos3d = vec3f(pos2d.x * cardWidth, pos2d.y * cardHeight, 0.0);

  // Apply same rotation as card
  let rotX = rotationX(uniforms.rotateX);
  let rotY = rotationY(uniforms.rotateY);
  pos3d = rotY * rotX * pos3d;

  // Shadow offset based on rotation (opposite to light direction)
  // Light comes from rotation direction, shadow falls opposite
  let shadowOffsetX = -uniforms.rotateY * 0.5;
  let shadowOffsetY = uniforms.rotateX * 0.5 - 0.12; // Opposite + always slightly below
  pos3d.x += shadowOffsetX;
  pos3d.y += shadowOffsetY;
  pos3d.z -= 0.5; // Push shadow back

  // Perspective projection
  let cameraZ = 4.0;
  let viewZ = pos3d.z + cameraZ;
  let perspectiveScale = 1.0 / viewZ;
  let normalizedZ = (viewZ - 0.1) / 9.9;

  var projX = pos3d.x * perspectiveScale * cameraZ;
  var projY = pos3d.y * perspectiveScale * cameraZ;

  if (uniforms.canvasAspectRatio > 1.0) {
    projX = projX / uniforms.canvasAspectRatio;
  } else {
    projY = projY * uniforms.canvasAspectRatio;
  }

  var out: VertexOutput;
  out.position = vec4f(projX, projY, normalizedZ, 1.0);
  out.uv = uv;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // Distance from edge for soft shadow
  let edgeDistX = min(in.uv.x, 1.0 - in.uv.x);
  let edgeDistY = min(in.uv.y, 1.0 - in.uv.y);
  let edgeDist = min(edgeDistX, edgeDistY);

  // Soft edge falloff
  let softness = uniforms.shadowSoftness;
  let alpha = smoothstep(0.0, softness, edgeDist) * uniforms.shadowOpacity;

  // Gradient fade from center
  let centerDist = length(in.uv - 0.5);
  let centerFade = 1.0 - smoothstep(0.3, 0.7, centerDist);

  return vec4f(0.0, 0.0, 0.0, alpha * centerFade);
}
`;/**
 * lil-gui
 * https://lil-gui.georgealways.com
 * @version 0.21.0
 * @author George Michael Brower
 * @license MIT
 */class m{constructor(e,t,n,s,o="div"){this.parent=e,this.object=t,this.property=n,this._disabled=!1,this._hidden=!1,this.initialValue=this.getValue(),this.domElement=document.createElement(o),this.domElement.classList.add("lil-controller"),this.domElement.classList.add(s),this.$name=document.createElement("div"),this.$name.classList.add("lil-name"),m.nextNameID=m.nextNameID||0,this.$name.id=`lil-gui-name-${++m.nextNameID}`,this.$widget=document.createElement("div"),this.$widget.classList.add("lil-widget"),this.$disable=this.$widget,this.domElement.appendChild(this.$name),this.domElement.appendChild(this.$widget),this.domElement.addEventListener("keydown",a=>a.stopPropagation()),this.domElement.addEventListener("keyup",a=>a.stopPropagation()),this.parent.children.push(this),this.parent.controllers.push(this),this.parent.$children.appendChild(this.domElement),this._listenCallback=this._listenCallback.bind(this),this.name(n)}name(e){return this._name=e,this.$name.textContent=e,this}onChange(e){return this._onChange=e,this}_callOnChange(){this.parent._callOnChange(this),this._onChange!==void 0&&this._onChange.call(this,this.getValue()),this._changed=!0}onFinishChange(e){return this._onFinishChange=e,this}_callOnFinishChange(){this._changed&&(this.parent._callOnFinishChange(this),this._onFinishChange!==void 0&&this._onFinishChange.call(this,this.getValue())),this._changed=!1}reset(){return this.setValue(this.initialValue),this._callOnFinishChange(),this}enable(e=!0){return this.disable(!e)}disable(e=!0){return e===this._disabled?this:(this._disabled=e,this.domElement.classList.toggle("lil-disabled",e),this.$disable.toggleAttribute("disabled",e),this)}show(e=!0){return this._hidden=!e,this.domElement.style.display=this._hidden?"none":"",this}hide(){return this.show(!1)}options(e){const t=this.parent.add(this.object,this.property,e);return t.name(this._name),this.destroy(),t}min(e){return this}max(e){return this}step(e){return this}decimals(e){return this}listen(e=!0){return this._listening=e,this._listenCallbackID!==void 0&&(cancelAnimationFrame(this._listenCallbackID),this._listenCallbackID=void 0),this._listening&&this._listenCallback(),this}_listenCallback(){this._listenCallbackID=requestAnimationFrame(this._listenCallback);const e=this.save();e!==this._listenPrevValue&&this.updateDisplay(),this._listenPrevValue=e}getValue(){return this.object[this.property]}setValue(e){return this.getValue()!==e&&(this.object[this.property]=e,this._callOnChange(),this.updateDisplay()),this}updateDisplay(){return this}load(e){return this.setValue(e),this._callOnFinishChange(),this}save(){return this.getValue()}destroy(){this.listen(!1),this.parent.children.splice(this.parent.children.indexOf(this),1),this.parent.controllers.splice(this.parent.controllers.indexOf(this),1),this.parent.$children.removeChild(this.domElement)}}class he extends m{constructor(e,t,n){super(e,t,n,"lil-boolean","label"),this.$input=document.createElement("input"),this.$input.setAttribute("type","checkbox"),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$widget.appendChild(this.$input),this.$input.addEventListener("change",()=>{this.setValue(this.$input.checked),this._callOnFinishChange()}),this.$disable=this.$input,this.updateDisplay()}updateDisplay(){return this.$input.checked=this.getValue(),this}}function T(r){let e,t;return(e=r.match(/(#|0x)?([a-f0-9]{6})/i))?t=e[2]:(e=r.match(/rgb\(\s*(\d*)\s*,\s*(\d*)\s*,\s*(\d*)\s*\)/))?t=parseInt(e[1]).toString(16).padStart(2,0)+parseInt(e[2]).toString(16).padStart(2,0)+parseInt(e[3]).toString(16).padStart(2,0):(e=r.match(/^#?([a-f0-9])([a-f0-9])([a-f0-9])$/i))&&(t=e[1]+e[1]+e[2]+e[2]+e[3]+e[3]),t?"#"+t:!1}const ue={isPrimitive:!0,match:r=>typeof r=="string",fromHexString:T,toHexString:T},F={isPrimitive:!0,match:r=>typeof r=="number",fromHexString:r=>parseInt(r.substring(1),16),toHexString:r=>"#"+r.toString(16).padStart(6,0)},pe={isPrimitive:!1,match:r=>Array.isArray(r)||ArrayBuffer.isView(r),fromHexString(r,e,t=1){const n=F.fromHexString(r);e[0]=(n>>16&255)/255*t,e[1]=(n>>8&255)/255*t,e[2]=(n&255)/255*t},toHexString([r,e,t],n=1){n=255/n;const s=r*n<<16^e*n<<8^t*n<<0;return F.toHexString(s)}},fe={isPrimitive:!1,match:r=>Object(r)===r,fromHexString(r,e,t=1){const n=F.fromHexString(r);e.r=(n>>16&255)/255*t,e.g=(n>>8&255)/255*t,e.b=(n&255)/255*t},toHexString({r,g:e,b:t},n=1){n=255/n;const s=r*n<<16^e*n<<8^t*n<<0;return F.toHexString(s)}},ge=[ue,F,pe,fe];function me(r){return ge.find(e=>e.match(r))}class ve extends m{constructor(e,t,n,s){super(e,t,n,"lil-color"),this.$input=document.createElement("input"),this.$input.setAttribute("type","color"),this.$input.setAttribute("tabindex",-1),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$text=document.createElement("input"),this.$text.setAttribute("type","text"),this.$text.setAttribute("spellcheck","false"),this.$text.setAttribute("aria-labelledby",this.$name.id),this.$display=document.createElement("div"),this.$display.classList.add("lil-display"),this.$display.appendChild(this.$input),this.$widget.appendChild(this.$display),this.$widget.appendChild(this.$text),this._format=me(this.initialValue),this._rgbScale=s,this._initialValueHexString=this.save(),this._textFocused=!1,this.$input.addEventListener("input",()=>{this._setValueFromHexString(this.$input.value)}),this.$input.addEventListener("blur",()=>{this._callOnFinishChange()}),this.$text.addEventListener("input",()=>{const o=T(this.$text.value);o&&this._setValueFromHexString(o)}),this.$text.addEventListener("focus",()=>{this._textFocused=!0,this.$text.select()}),this.$text.addEventListener("blur",()=>{this._textFocused=!1,this.updateDisplay(),this._callOnFinishChange()}),this.$disable=this.$text,this.updateDisplay()}reset(){return this._setValueFromHexString(this._initialValueHexString),this}_setValueFromHexString(e){if(this._format.isPrimitive){const t=this._format.fromHexString(e);this.setValue(t)}else this._format.fromHexString(e,this.getValue(),this._rgbScale),this._callOnChange(),this.updateDisplay()}save(){return this._format.toHexString(this.getValue(),this._rgbScale)}load(e){return this._setValueFromHexString(e),this._callOnFinishChange(),this}updateDisplay(){return this.$input.value=this._format.toHexString(this.getValue(),this._rgbScale),this._textFocused||(this.$text.value=this.$input.value.substring(1)),this.$display.style.backgroundColor=this.$input.value,this}}class U extends m{constructor(e,t,n){super(e,t,n,"lil-function"),this.$button=document.createElement("button"),this.$button.appendChild(this.$name),this.$widget.appendChild(this.$button),this.$button.addEventListener("click",s=>{s.preventDefault(),this.getValue().call(this.object),this._callOnChange()}),this.$button.addEventListener("touchstart",()=>{},{passive:!0}),this.$disable=this.$button}}class be extends m{constructor(e,t,n,s,o,a){super(e,t,n,"lil-number"),this._initInput(),this.min(s),this.max(o);const h=a!==void 0;this.step(h?a:this._getImplicitStep(),h),this.updateDisplay()}decimals(e){return this._decimals=e,this.updateDisplay(),this}min(e){return this._min=e,this._onUpdateMinMax(),this}max(e){return this._max=e,this._onUpdateMinMax(),this}step(e,t=!0){return this._step=e,this._stepExplicit=t,this}updateDisplay(){const e=this.getValue();if(this._hasSlider){let t=(e-this._min)/(this._max-this._min);t=Math.max(0,Math.min(t,1)),this.$fill.style.width=t*100+"%"}return this._inputFocused||(this.$input.value=this._decimals===void 0?e:e.toFixed(this._decimals)),this}_initInput(){this.$input=document.createElement("input"),this.$input.setAttribute("type","text"),this.$input.setAttribute("aria-labelledby",this.$name.id),window.matchMedia("(pointer: coarse)").matches&&(this.$input.setAttribute("type","number"),this.$input.setAttribute("step","any")),this.$widget.appendChild(this.$input),this.$disable=this.$input;const t=()=>{let l=parseFloat(this.$input.value);isNaN(l)||(this._stepExplicit&&(l=this._snap(l)),this.setValue(this._clamp(l)))},n=l=>{const c=parseFloat(this.$input.value);isNaN(c)||(this._snapClampSetValue(c+l),this.$input.value=this.getValue())},s=l=>{l.key==="Enter"&&this.$input.blur(),l.code==="ArrowUp"&&(l.preventDefault(),n(this._step*this._arrowKeyMultiplier(l))),l.code==="ArrowDown"&&(l.preventDefault(),n(this._step*this._arrowKeyMultiplier(l)*-1))},o=l=>{this._inputFocused&&(l.preventDefault(),n(this._step*this._normalizeMouseWheel(l)))};let a=!1,h,v,S,f,u;const b=5,O=l=>{h=l.clientX,v=S=l.clientY,a=!0,f=this.getValue(),u=0,window.addEventListener("mousemove",A),window.addEventListener("mouseup",w)},A=l=>{if(a){const c=l.clientX-h,k=l.clientY-v;Math.abs(k)>b?(l.preventDefault(),this.$input.blur(),a=!1,this._setDraggingStyle(!0,"vertical")):Math.abs(c)>b&&w()}if(!a){const c=l.clientY-S;u-=c*this._step*this._arrowKeyMultiplier(l),f+u>this._max?u=this._max-f:f+u<this._min&&(u=this._min-f),this._snapClampSetValue(f+u)}S=l.clientY},w=()=>{this._setDraggingStyle(!1,"vertical"),this._callOnFinishChange(),window.removeEventListener("mousemove",A),window.removeEventListener("mouseup",w)},C=()=>{this._inputFocused=!0},d=()=>{this._inputFocused=!1,this.updateDisplay(),this._callOnFinishChange()};this.$input.addEventListener("input",t),this.$input.addEventListener("keydown",s),this.$input.addEventListener("wheel",o,{passive:!1}),this.$input.addEventListener("mousedown",O),this.$input.addEventListener("focus",C),this.$input.addEventListener("blur",d)}_initSlider(){this._hasSlider=!0,this.$slider=document.createElement("div"),this.$slider.classList.add("lil-slider"),this.$fill=document.createElement("div"),this.$fill.classList.add("lil-fill"),this.$slider.appendChild(this.$fill),this.$widget.insertBefore(this.$slider,this.$input),this.domElement.classList.add("lil-has-slider");const e=(d,l,c,k,H)=>(d-l)/(c-l)*(H-k)+k,t=d=>{const l=this.$slider.getBoundingClientRect();let c=e(d,l.left,l.right,this._min,this._max);this._snapClampSetValue(c)},n=d=>{this._setDraggingStyle(!0),t(d.clientX),window.addEventListener("mousemove",s),window.addEventListener("mouseup",o)},s=d=>{t(d.clientX)},o=()=>{this._callOnFinishChange(),this._setDraggingStyle(!1),window.removeEventListener("mousemove",s),window.removeEventListener("mouseup",o)};let a=!1,h,v;const S=d=>{d.preventDefault(),this._setDraggingStyle(!0),t(d.touches[0].clientX),a=!1},f=d=>{d.touches.length>1||(this._hasScrollBar?(h=d.touches[0].clientX,v=d.touches[0].clientY,a=!0):S(d),window.addEventListener("touchmove",u,{passive:!1}),window.addEventListener("touchend",b))},u=d=>{if(a){const l=d.touches[0].clientX-h,c=d.touches[0].clientY-v;Math.abs(l)>Math.abs(c)?S(d):(window.removeEventListener("touchmove",u),window.removeEventListener("touchend",b))}else d.preventDefault(),t(d.touches[0].clientX)},b=()=>{this._callOnFinishChange(),this._setDraggingStyle(!1),window.removeEventListener("touchmove",u),window.removeEventListener("touchend",b)},O=this._callOnFinishChange.bind(this),A=400;let w;const C=d=>{if(Math.abs(d.deltaX)<Math.abs(d.deltaY)&&this._hasScrollBar)return;d.preventDefault();const c=this._normalizeMouseWheel(d)*this._step;this._snapClampSetValue(this.getValue()+c),this.$input.value=this.getValue(),clearTimeout(w),w=setTimeout(O,A)};this.$slider.addEventListener("mousedown",n),this.$slider.addEventListener("touchstart",f,{passive:!1}),this.$slider.addEventListener("wheel",C,{passive:!1})}_setDraggingStyle(e,t="horizontal"){this.$slider&&this.$slider.classList.toggle("lil-active",e),document.body.classList.toggle("lil-dragging",e),document.body.classList.toggle(`lil-${t}`,e)}_getImplicitStep(){return this._hasMin&&this._hasMax?(this._max-this._min)/1e3:.1}_onUpdateMinMax(){!this._hasSlider&&this._hasMin&&this._hasMax&&(this._stepExplicit||this.step(this._getImplicitStep(),!1),this._initSlider(),this.updateDisplay())}_normalizeMouseWheel(e){let{deltaX:t,deltaY:n}=e;return Math.floor(e.deltaY)!==e.deltaY&&e.wheelDelta&&(t=0,n=-e.wheelDelta/120,n*=this._stepExplicit?1:10),t+-n}_arrowKeyMultiplier(e){let t=this._stepExplicit?1:10;return e.shiftKey?t*=10:e.altKey&&(t/=10),t}_snap(e){let t=0;return this._hasMin?t=this._min:this._hasMax&&(t=this._max),e-=t,e=Math.round(e/this._step)*this._step,e+=t,e=parseFloat(e.toPrecision(15)),e}_clamp(e){return e<this._min&&(e=this._min),e>this._max&&(e=this._max),e}_snapClampSetValue(e){this.setValue(this._clamp(this._snap(e)))}get _hasScrollBar(){const e=this.parent.root.$children;return e.scrollHeight>e.clientHeight}get _hasMin(){return this._min!==void 0}get _hasMax(){return this._max!==void 0}}class we extends m{constructor(e,t,n,s){super(e,t,n,"lil-option"),this.$select=document.createElement("select"),this.$select.setAttribute("aria-labelledby",this.$name.id),this.$display=document.createElement("div"),this.$display.classList.add("lil-display"),this.$select.addEventListener("change",()=>{this.setValue(this._values[this.$select.selectedIndex]),this._callOnFinishChange()}),this.$select.addEventListener("focus",()=>{this.$display.classList.add("lil-focus")}),this.$select.addEventListener("blur",()=>{this.$display.classList.remove("lil-focus")}),this.$widget.appendChild(this.$select),this.$widget.appendChild(this.$display),this.$disable=this.$select,this.options(s)}options(e){return this._values=Array.isArray(e)?e:Object.values(e),this._names=Array.isArray(e)?e:Object.keys(e),this.$select.replaceChildren(),this._names.forEach(t=>{const n=document.createElement("option");n.textContent=t,this.$select.appendChild(n)}),this.updateDisplay(),this}updateDisplay(){const e=this.getValue(),t=this._values.indexOf(e);return this.$select.selectedIndex=t,this.$display.textContent=t===-1?e:this._names[t],this}}class ye extends m{constructor(e,t,n){super(e,t,n,"lil-string"),this.$input=document.createElement("input"),this.$input.setAttribute("type","text"),this.$input.setAttribute("spellcheck","false"),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$input.addEventListener("input",()=>{this.setValue(this.$input.value)}),this.$input.addEventListener("keydown",s=>{s.code==="Enter"&&this.$input.blur()}),this.$input.addEventListener("blur",()=>{this._callOnFinishChange()}),this.$widget.appendChild(this.$input),this.$disable=this.$input,this.updateDisplay()}updateDisplay(){return this.$input.value=this.getValue(),this}}var xe=`.lil-gui {
  font-family: var(--font-family);
  font-size: var(--font-size);
  line-height: 1;
  font-weight: normal;
  font-style: normal;
  text-align: left;
  color: var(--text-color);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  --background-color: #1f1f1f;
  --text-color: #ebebeb;
  --title-background-color: #111111;
  --title-text-color: #ebebeb;
  --widget-color: #424242;
  --hover-color: #4f4f4f;
  --focus-color: #595959;
  --number-color: #2cc9ff;
  --string-color: #a2db3c;
  --font-size: 11px;
  --input-font-size: 11px;
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  --font-family-mono: Menlo, Monaco, Consolas, "Droid Sans Mono", monospace;
  --padding: 4px;
  --spacing: 4px;
  --widget-height: 20px;
  --title-height: calc(var(--widget-height) + var(--spacing) * 1.25);
  --name-width: 45%;
  --slider-knob-width: 2px;
  --slider-input-width: 27%;
  --color-input-width: 27%;
  --slider-input-min-width: 45px;
  --color-input-min-width: 45px;
  --folder-indent: 7px;
  --widget-padding: 0 0 0 3px;
  --widget-border-radius: 2px;
  --checkbox-size: calc(0.75 * var(--widget-height));
  --scrollbar-width: 5px;
}
.lil-gui, .lil-gui * {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
.lil-gui.lil-root {
  width: var(--width, 245px);
  display: flex;
  flex-direction: column;
  background: var(--background-color);
}
.lil-gui.lil-root > .lil-title {
  background: var(--title-background-color);
  color: var(--title-text-color);
}
.lil-gui.lil-root > .lil-children {
  overflow-x: hidden;
  overflow-y: auto;
}
.lil-gui.lil-root > .lil-children::-webkit-scrollbar {
  width: var(--scrollbar-width);
  height: var(--scrollbar-width);
  background: var(--background-color);
}
.lil-gui.lil-root > .lil-children::-webkit-scrollbar-thumb {
  border-radius: var(--scrollbar-width);
  background: var(--focus-color);
}
@media (pointer: coarse) {
  .lil-gui.lil-allow-touch-styles, .lil-gui.lil-allow-touch-styles .lil-gui {
    --widget-height: 28px;
    --padding: 6px;
    --spacing: 6px;
    --font-size: 13px;
    --input-font-size: 16px;
    --folder-indent: 10px;
    --scrollbar-width: 7px;
    --slider-input-min-width: 50px;
    --color-input-min-width: 65px;
  }
}
.lil-gui.lil-force-touch-styles, .lil-gui.lil-force-touch-styles .lil-gui {
  --widget-height: 28px;
  --padding: 6px;
  --spacing: 6px;
  --font-size: 13px;
  --input-font-size: 16px;
  --folder-indent: 10px;
  --scrollbar-width: 7px;
  --slider-input-min-width: 50px;
  --color-input-min-width: 65px;
}
.lil-gui.lil-auto-place, .lil-gui.autoPlace {
  max-height: 100%;
  position: fixed;
  top: 0;
  right: 15px;
  z-index: 1001;
}

.lil-controller {
  display: flex;
  align-items: center;
  padding: 0 var(--padding);
  margin: var(--spacing) 0;
}
.lil-controller.lil-disabled {
  opacity: 0.5;
}
.lil-controller.lil-disabled, .lil-controller.lil-disabled * {
  pointer-events: none !important;
}
.lil-controller > .lil-name {
  min-width: var(--name-width);
  flex-shrink: 0;
  white-space: pre;
  padding-right: var(--spacing);
  line-height: var(--widget-height);
}
.lil-controller .lil-widget {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: var(--widget-height);
}
.lil-controller.lil-string input {
  color: var(--string-color);
}
.lil-controller.lil-boolean {
  cursor: pointer;
}
.lil-controller.lil-color .lil-display {
  width: 100%;
  height: var(--widget-height);
  border-radius: var(--widget-border-radius);
  position: relative;
}
@media (hover: hover) {
  .lil-controller.lil-color .lil-display:hover:before {
    content: " ";
    display: block;
    position: absolute;
    border-radius: var(--widget-border-radius);
    border: 1px solid #fff9;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
  }
}
.lil-controller.lil-color input[type=color] {
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.lil-controller.lil-color input[type=text] {
  margin-left: var(--spacing);
  font-family: var(--font-family-mono);
  min-width: var(--color-input-min-width);
  width: var(--color-input-width);
  flex-shrink: 0;
}
.lil-controller.lil-option select {
  opacity: 0;
  position: absolute;
  width: 100%;
  max-width: 100%;
}
.lil-controller.lil-option .lil-display {
  position: relative;
  pointer-events: none;
  border-radius: var(--widget-border-radius);
  height: var(--widget-height);
  line-height: var(--widget-height);
  max-width: 100%;
  overflow: hidden;
  word-break: break-all;
  padding-left: 0.55em;
  padding-right: 1.75em;
  background: var(--widget-color);
}
@media (hover: hover) {
  .lil-controller.lil-option .lil-display.lil-focus {
    background: var(--focus-color);
  }
}
.lil-controller.lil-option .lil-display.lil-active {
  background: var(--focus-color);
}
.lil-controller.lil-option .lil-display:after {
  font-family: "lil-gui";
  content: "↕";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  padding-right: 0.375em;
}
.lil-controller.lil-option .lil-widget,
.lil-controller.lil-option select {
  cursor: pointer;
}
@media (hover: hover) {
  .lil-controller.lil-option .lil-widget:hover .lil-display {
    background: var(--hover-color);
  }
}
.lil-controller.lil-number input {
  color: var(--number-color);
}
.lil-controller.lil-number.lil-has-slider input {
  margin-left: var(--spacing);
  width: var(--slider-input-width);
  min-width: var(--slider-input-min-width);
  flex-shrink: 0;
}
.lil-controller.lil-number .lil-slider {
  width: 100%;
  height: var(--widget-height);
  background: var(--widget-color);
  border-radius: var(--widget-border-radius);
  padding-right: var(--slider-knob-width);
  overflow: hidden;
  cursor: ew-resize;
  touch-action: pan-y;
}
@media (hover: hover) {
  .lil-controller.lil-number .lil-slider:hover {
    background: var(--hover-color);
  }
}
.lil-controller.lil-number .lil-slider.lil-active {
  background: var(--focus-color);
}
.lil-controller.lil-number .lil-slider.lil-active .lil-fill {
  opacity: 0.95;
}
.lil-controller.lil-number .lil-fill {
  height: 100%;
  border-right: var(--slider-knob-width) solid var(--number-color);
  box-sizing: content-box;
}

.lil-dragging .lil-gui {
  --hover-color: var(--widget-color);
}
.lil-dragging * {
  cursor: ew-resize !important;
}
.lil-dragging.lil-vertical * {
  cursor: ns-resize !important;
}

.lil-gui .lil-title {
  height: var(--title-height);
  font-weight: 600;
  padding: 0 var(--padding);
  width: 100%;
  text-align: left;
  background: none;
  text-decoration-skip: objects;
}
.lil-gui .lil-title:before {
  font-family: "lil-gui";
  content: "▾";
  padding-right: 2px;
  display: inline-block;
}
.lil-gui .lil-title:active {
  background: var(--title-background-color);
  opacity: 0.75;
}
@media (hover: hover) {
  body:not(.lil-dragging) .lil-gui .lil-title:hover {
    background: var(--title-background-color);
    opacity: 0.85;
  }
  .lil-gui .lil-title:focus {
    text-decoration: underline var(--focus-color);
  }
}
.lil-gui.lil-root > .lil-title:focus {
  text-decoration: none !important;
}
.lil-gui.lil-closed > .lil-title:before {
  content: "▸";
}
.lil-gui.lil-closed > .lil-children {
  transform: translateY(-7px);
  opacity: 0;
}
.lil-gui.lil-closed:not(.lil-transition) > .lil-children {
  display: none;
}
.lil-gui.lil-transition > .lil-children {
  transition-duration: 300ms;
  transition-property: height, opacity, transform;
  transition-timing-function: cubic-bezier(0.2, 0.6, 0.35, 1);
  overflow: hidden;
  pointer-events: none;
}
.lil-gui .lil-children:empty:before {
  content: "Empty";
  padding: 0 var(--padding);
  margin: var(--spacing) 0;
  display: block;
  height: var(--widget-height);
  font-style: italic;
  line-height: var(--widget-height);
  opacity: 0.5;
}
.lil-gui.lil-root > .lil-children > .lil-gui > .lil-title {
  border: 0 solid var(--widget-color);
  border-width: 1px 0;
  transition: border-color 300ms;
}
.lil-gui.lil-root > .lil-children > .lil-gui.lil-closed > .lil-title {
  border-bottom-color: transparent;
}
.lil-gui + .lil-controller {
  border-top: 1px solid var(--widget-color);
  margin-top: 0;
  padding-top: var(--spacing);
}
.lil-gui .lil-gui .lil-gui > .lil-title {
  border: none;
}
.lil-gui .lil-gui .lil-gui > .lil-children {
  border: none;
  margin-left: var(--folder-indent);
  border-left: 2px solid var(--widget-color);
}
.lil-gui .lil-gui .lil-controller {
  border: none;
}

.lil-gui label, .lil-gui input, .lil-gui button {
  -webkit-tap-highlight-color: transparent;
}
.lil-gui input {
  border: 0;
  outline: none;
  font-family: var(--font-family);
  font-size: var(--input-font-size);
  border-radius: var(--widget-border-radius);
  height: var(--widget-height);
  background: var(--widget-color);
  color: var(--text-color);
  width: 100%;
}
@media (hover: hover) {
  .lil-gui input:hover {
    background: var(--hover-color);
  }
  .lil-gui input:active {
    background: var(--focus-color);
  }
}
.lil-gui input:disabled {
  opacity: 1;
}
.lil-gui input[type=text],
.lil-gui input[type=number] {
  padding: var(--widget-padding);
  -moz-appearance: textfield;
}
.lil-gui input[type=text]:focus,
.lil-gui input[type=number]:focus {
  background: var(--focus-color);
}
.lil-gui input[type=checkbox] {
  appearance: none;
  width: var(--checkbox-size);
  height: var(--checkbox-size);
  border-radius: var(--widget-border-radius);
  text-align: center;
  cursor: pointer;
}
.lil-gui input[type=checkbox]:checked:before {
  font-family: "lil-gui";
  content: "✓";
  font-size: var(--checkbox-size);
  line-height: var(--checkbox-size);
}
@media (hover: hover) {
  .lil-gui input[type=checkbox]:focus {
    box-shadow: inset 0 0 0 1px var(--focus-color);
  }
}
.lil-gui button {
  outline: none;
  cursor: pointer;
  font-family: var(--font-family);
  font-size: var(--font-size);
  color: var(--text-color);
  width: 100%;
  border: none;
}
.lil-gui .lil-controller button {
  height: var(--widget-height);
  text-transform: none;
  background: var(--widget-color);
  border-radius: var(--widget-border-radius);
}
@media (hover: hover) {
  .lil-gui .lil-controller button:hover {
    background: var(--hover-color);
  }
  .lil-gui .lil-controller button:focus {
    box-shadow: inset 0 0 0 1px var(--focus-color);
  }
}
.lil-gui .lil-controller button:active {
  background: var(--focus-color);
}

@font-face {
  font-family: "lil-gui";
  src: url("data:application/font-woff2;charset=utf-8;base64,d09GMgABAAAAAALkAAsAAAAABtQAAAKVAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHFQGYACDMgqBBIEbATYCJAMUCwwABCAFhAoHgQQbHAbIDiUFEYVARAAAYQTVWNmz9MxhEgodq49wYRUFKE8GWNiUBxI2LBRaVnc51U83Gmhs0Q7JXWMiz5eteLwrKwuxHO8VFxUX9UpZBs6pa5ABRwHA+t3UxUnH20EvVknRerzQgX6xC/GH6ZUvTcAjAv122dF28OTqCXrPuyaDER30YBA1xnkVutDDo4oCi71Ca7rrV9xS8dZHbPHefsuwIyCpmT7j+MnjAH5X3984UZoFFuJ0yiZ4XEJFxjagEBeqs+e1iyK8Xf/nOuwF+vVK0ur765+vf7txotUi0m3N0m/84RGSrBCNrh8Ee5GjODjF4gnWP+dJrH/Lk9k4oT6d+gr6g/wssA2j64JJGP6cmx554vUZnpZfn6ZfX2bMwPPrlANsB86/DiHjhl0OP+c87+gaJo/gY084s3HoYL/ZkWHTRfBXvvoHnnkHvngKun4KBE/ede7tvq3/vQOxDXB1/fdNz6XbPdcr0Vhpojj9dG+owuSKFsslCi1tgEjirjXdwMiov2EioadxmqTHUCIwo8NgQaeIasAi0fTYSPTbSmwbMOFduyh9wvBrESGY0MtgRjtgQR8Q1bRPohn2UoCRZf9wyYANMXFeJTysqAe0I4mrherOekFdKMrYvJjLvOIUM9SuwYB5DVZUwwVjJJOaUnZCmcEkIZZrKqNvRGRMvmFZsmhP4VMKCSXBhSqUBxgMS7h0cZvEd71AWkEhGWaeMFcNnpqyJkyXgYL7PQ1MoSq0wDAkRtJIijkZSmqYTiSImfLiSWXIZwhRh3Rug2X0kk1Dgj+Iu43u5p98ghopcpSo0Uyc8SnjlYX59WUeaMoDqmVD2TOWD9a4pCRAzf2ECgwGcrHjPOWY9bNxq/OL3I/QjwEAAAA=") format("woff2");
}`;function Se(r){const e=document.createElement("style");e.innerHTML=r;const t=document.querySelector("head link[rel=stylesheet], head style");t?document.head.insertBefore(e,t):document.head.appendChild(e)}let ne=!1;class G{constructor({parent:e,autoPlace:t=e===void 0,container:n,width:s,title:o="Controls",closeFolders:a=!1,injectStyles:h=!0,touchStyles:v=!0}={}){if(this.parent=e,this.root=e?e.root:this,this.children=[],this.controllers=[],this.folders=[],this._closed=!1,this._hidden=!1,this.domElement=document.createElement("div"),this.domElement.classList.add("lil-gui"),this.$title=document.createElement("button"),this.$title.classList.add("lil-title"),this.$title.setAttribute("aria-expanded",!0),this.$title.addEventListener("click",()=>this.openAnimated(this._closed)),this.$title.addEventListener("touchstart",()=>{},{passive:!0}),this.$children=document.createElement("div"),this.$children.classList.add("lil-children"),this.domElement.appendChild(this.$title),this.domElement.appendChild(this.$children),this.title(o),this.parent){this.parent.children.push(this),this.parent.folders.push(this),this.parent.$children.appendChild(this.domElement);return}this.domElement.classList.add("lil-root"),v&&this.domElement.classList.add("lil-allow-touch-styles"),!ne&&h&&(Se(xe),ne=!0),n?n.appendChild(this.domElement):t&&(this.domElement.classList.add("lil-auto-place","autoPlace"),document.body.appendChild(this.domElement)),s&&this.domElement.style.setProperty("--width",s+"px"),this._closeFolders=a}add(e,t,n,s,o){if(Object(n)===n)return new we(this,e,t,n);const a=e[t];switch(typeof a){case"number":return new be(this,e,t,n,s,o);case"boolean":return new he(this,e,t);case"string":return new ye(this,e,t);case"function":return new U(this,e,t)}console.error(`gui.add failed
	property:`,t,`
	object:`,e,`
	value:`,a)}addColor(e,t,n=1){return new ve(this,e,t,n)}addFolder(e){const t=new G({parent:this,title:e});return this.root._closeFolders&&t.close(),t}load(e,t=!0){return e.controllers&&this.controllers.forEach(n=>{n instanceof U||n._name in e.controllers&&n.load(e.controllers[n._name])}),t&&e.folders&&this.folders.forEach(n=>{n._title in e.folders&&n.load(e.folders[n._title])}),this}save(e=!0){const t={controllers:{},folders:{}};return this.controllers.forEach(n=>{if(!(n instanceof U)){if(n._name in t.controllers)throw new Error(`Cannot save GUI with duplicate property "${n._name}"`);t.controllers[n._name]=n.save()}}),e&&this.folders.forEach(n=>{if(n._title in t.folders)throw new Error(`Cannot save GUI with duplicate folder "${n._title}"`);t.folders[n._title]=n.save()}),t}open(e=!0){return this._setClosed(!e),this.$title.setAttribute("aria-expanded",!this._closed),this.domElement.classList.toggle("lil-closed",this._closed),this}close(){return this.open(!1)}_setClosed(e){this._closed!==e&&(this._closed=e,this._callOnOpenClose(this))}show(e=!0){return this._hidden=!e,this.domElement.style.display=this._hidden?"none":"",this}hide(){return this.show(!1)}openAnimated(e=!0){return this._setClosed(!e),this.$title.setAttribute("aria-expanded",!this._closed),requestAnimationFrame(()=>{const t=this.$children.clientHeight;this.$children.style.height=t+"px",this.domElement.classList.add("lil-transition");const n=o=>{o.target===this.$children&&(this.$children.style.height="",this.domElement.classList.remove("lil-transition"),this.$children.removeEventListener("transitionend",n))};this.$children.addEventListener("transitionend",n);const s=e?this.$children.scrollHeight:0;this.domElement.classList.toggle("lil-closed",!e),requestAnimationFrame(()=>{this.$children.style.height=s+"px"})}),this}title(e){return this._title=e,this.$title.textContent=e,this}reset(e=!0){return(e?this.controllersRecursive():this.controllers).forEach(n=>n.reset()),this}onChange(e){return this._onChange=e,this}_callOnChange(e){this.parent&&this.parent._callOnChange(e),this._onChange!==void 0&&this._onChange.call(this,{object:e.object,property:e.property,value:e.getValue(),controller:e})}onFinishChange(e){return this._onFinishChange=e,this}_callOnFinishChange(e){this.parent&&this.parent._callOnFinishChange(e),this._onFinishChange!==void 0&&this._onFinishChange.call(this,{object:e.object,property:e.property,value:e.getValue(),controller:e})}onOpenClose(e){return this._onOpenClose=e,this}_callOnOpenClose(e){this.parent&&this.parent._callOnOpenClose(e),this._onOpenClose!==void 0&&this._onOpenClose.call(this,e)}destroy(){this.parent&&(this.parent.children.splice(this.parent.children.indexOf(this),1),this.parent.folders.splice(this.parent.folders.indexOf(this),1)),this.domElement.parentElement&&this.domElement.parentElement.removeChild(this.domElement),Array.from(this.children).forEach(e=>e.destroy())}controllersRecursive(){let e=Array.from(this.controllers);return this.folders.forEach(t=>{e=e.concat(t.controllersRecursive())}),e}foldersRecursive(){let e=Array.from(this.folders);return this.folders.forEach(t=>{e=e.concat(t.foldersRecursive())}),e}}async function _e(){const r=document.querySelector("#app-canvas");if(!navigator.gpu)throw new Error("WebGPU not supported on this browser.");const e=await navigator.gpu.requestAdapter();if(!e)throw new Error("No appropriate GPU adapter found.");const t=await e.requestDevice(),n=r.getContext("webgpu"),s=navigator.gpu.getPreferredCanvasFormat();n.configure({device:t,format:s,alphaMode:"premultiplied"});const o=async p=>{const g=await(await fetch(p)).blob(),x=await createImageBitmap(g),D=t.createTexture({size:[x.width,x.height,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return t.queue.copyExternalImageToTexture({source:x},{texture:D},[x.width,x.height]),D},a="/lenticular-lens/",[h,v,S,f,u]=await Promise.all([o(`${a}assets/boa.png`),o(`${a}assets/nico.png`),o(`${a}assets/nami.png`),o(`${a}assets/background.jpg`),o(`${a}assets/illusion-mask.png`)]),b=t.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"repeat",addressModeV:"repeat"}),A=t.createBuffer({size:112,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),w=t.createShaderModule({code:ae}),C=t.createRenderPipeline({layout:"auto",vertex:{module:w,entryPoint:"vs_main"},fragment:{module:w,entryPoint:"fs_main",targets:[{format:s,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}}),d=t.createBindGroup({layout:C.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:A}},{binding:1,resource:b},{binding:2,resource:h.createView()},{binding:3,resource:v.createView()},{binding:4,resource:S.createView()},{binding:5,resource:u.createView()}]}),l=t.createShaderModule({code:de}),c=t.createBuffer({size:8,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),k=t.createRenderPipeline({layout:"auto",vertex:{module:l,entryPoint:"vs_main"},fragment:{module:l,entryPoint:"fs_main",targets:[{format:s}]},primitive:{topology:"triangle-list"}}),H=t.createBindGroup({layout:k.getBindGroupLayout(0),entries:[{binding:0,resource:b},{binding:1,resource:f.createView()},{binding:2,resource:{buffer:c}}]}),ie=f.width/f.height,j=t.createShaderModule({code:ce}),W=t.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),N=t.createRenderPipeline({layout:"auto",vertex:{module:j,entryPoint:"vs_main"},fragment:{module:j,entryPoint:"fs_main",targets:[{format:s,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}}),se=t.createBindGroup({layout:N.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:W}}]});let I=0,R=0,X=0,Y=0;const Z=h.width/h.height,i={lensDensity:70,lensTransition:.12,lensRidgeIntensity:1,lensSwing:.3,cardScale:.8,autoRotate:!0,rotateSpeed:1,glareEnabled:!1,glareIntensity:1,glossiness:.7,glitterEnabled:!1,glitterIntensity:.6,holoEnabled:!1,holoIntensity:.5,radiantEnabled:!1,radiantIntensity:.5,radiantScale:2.5,radiantBrightness:.8,radiantArtworkIntensity:.2,pokemonVEnabled:!1,pokemonVIntensity:.7,pokemonVBrightness:.85,pokemonVScale:1.5,pokemonVStripWidth:.13,pokemonVStripSoftness:.075,pokemonVArtworkAlpha:.2,pokemonVFingerprintScale:5,shadowOpacity:.5,shadowSoftness:.15},$=new G({title:"Controls"});$.close();const L=$.addFolder("Lenticular");L.add(i,"lensDensity",5,100,1).name("Strip Density"),L.add(i,"lensTransition",.01,.3,.01).name("Transition"),L.add(i,"lensRidgeIntensity",0,2,.05).name("Ridge Strength"),L.add(i,"lensSwing",0,1,.05).name("Lens Swing");const V=$.addFolder("Holographic"),q=V.addFolder("Glare");q.add(i,"glareEnabled").name("Enabled"),q.add(i,"glareIntensity",0,1,.05).name("Intensity");const K=V.addFolder("Glitter");K.add(i,"glitterEnabled").name("Enabled"),K.add(i,"glitterIntensity",0,1,.05).name("Intensity");const J=V.addFolder("Holo Beans");J.add(i,"holoEnabled").name("Enabled"),J.add(i,"holoIntensity",0,1,.05).name("Intensity");const P=V.addFolder("Radiant Holofoil");P.add(i,"radiantEnabled").name("Enabled"),P.add(i,"radiantIntensity",0,1,.05).name("Intensity"),P.add(i,"radiantScale",.35,2.5,.05).name("Scale"),P.add(i,"radiantBrightness",.4,2,.05).name("Brightness"),P.add(i,"radiantArtworkIntensity",0,1,.05).name("Artwork Alpha");const _=V.addFolder("Pokemon V");_.add(i,"pokemonVEnabled").name("Enabled"),_.add(i,"pokemonVIntensity",0,1,.05).name("Intensity"),_.add(i,"pokemonVBrightness",.2,1.5,.05).name("Brightness"),_.add(i,"pokemonVScale",.5,2,.05).name("Scale"),_.add(i,"pokemonVStripWidth",.01,.15,.005).name("Strip Width"),_.add(i,"pokemonVStripSoftness",.005,.08,.005).name("Strip Softness"),_.add(i,"pokemonVArtworkAlpha",0,1,.05).name("Artwork Alpha"),_.add(i,"pokemonVFingerprintScale",1,10,.1).name("Fingerprint Scale");const E=$.addFolder("Card");E.add(i,"glossiness",0,1,.05).name("Glossiness"),E.add(i,"cardScale",.3,1.5,.05).name("Scale"),E.add(i,"autoRotate").name("Auto Rotate"),E.add(i,"rotateSpeed",.1,3,.1).name("Rotate Speed"),E.add(i,"shadowOpacity",0,1,.05).name("Shadow"),E.add(i,"shadowSoftness",.05,.3,.01).name("Shadow Soft");const Q=document.querySelector("#ui");Q&&Q.remove();function re(p){i.autoRotate&&(Y=Math.sin(p*.001*i.rotateSpeed)*.5,X=Math.sin(p*7e-4*i.rotateSpeed)*.2),I+=(X-I)*.08,R+=(Y-R)*.08;const y=r.width/r.height,g=new Float32Array([I,R,i.lensDensity,Z,y,i.cardScale,i.glareEnabled?i.glareIntensity:0,i.glossiness,i.glitterEnabled?i.glitterIntensity:0,i.holoEnabled?i.holoIntensity:0,i.radiantEnabled?i.radiantIntensity:0,i.radiantScale,i.radiantBrightness,i.radiantArtworkIntensity,p*.001,i.pokemonVEnabled?i.pokemonVIntensity:0,i.pokemonVBrightness,i.pokemonVScale,i.pokemonVStripWidth,i.pokemonVStripSoftness,i.pokemonVArtworkAlpha,i.lensTransition,i.lensRidgeIntensity,i.lensSwing,i.pokemonVFingerprintScale,0,0,0]);t.queue.writeBuffer(A,0,g)}function ee(p){re(p);const y=r.width/r.height;t.queue.writeBuffer(c,0,new Float32Array([y,ie]));const g=t.createCommandEncoder(),x=n.getCurrentTexture().createView(),D={colorAttachments:[{view:x,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]},B=g.beginRenderPass(D);B.setPipeline(k),B.setBindGroup(0,H),B.draw(3,1,0,0),B.end(),t.queue.writeBuffer(W,0,new Float32Array([I,R,i.cardScale,Z,y,i.shadowOpacity,i.shadowSoftness,0]));const le={colorAttachments:[{view:x,loadOp:"load",storeOp:"store"}]},M=g.beginRenderPass(le);M.setPipeline(N),M.setBindGroup(0,se),M.draw(1536,1,0,0),M.end();const oe={colorAttachments:[{view:x,loadOp:"load",storeOp:"store"}]},z=g.beginRenderPass(oe);z.setPipeline(C),z.setBindGroup(0,d),z.draw(1536,1,0,0),z.end(),t.queue.submit([g.finish()]),requestAnimationFrame(ee)}window.addEventListener("pointermove",p=>{if(!i.autoRotate){const y=p.clientX/window.innerWidth*2-1,g=p.clientY/window.innerHeight*2-1;Y=y*.5,X=-g*.3}}),r.addEventListener("pointerdown",()=>{var p;i.autoRotate&&(i.autoRotate=!1,(p=$.controllersRecursive().find(y=>y.property==="autoRotate"))==null||p.updateDisplay())});function te(){r.width=window.innerWidth*window.devicePixelRatio,r.height=window.innerHeight*window.devicePixelRatio}window.addEventListener("resize",te),te(),requestAnimationFrame(ee)}_e().catch(r=>{console.error(r)});
