struct Uniforms {
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
  time: f32,
  padding1: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var t0: texture_2d<f32>;
@group(0) @binding(3) var t1: texture_2d<f32>;
@group(0) @binding(4) var t2: texture_2d<f32>;

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
  let lensAngle = t + (stripPhase - 0.5) * 0.3;
  let normalizedAngle = clamp(lensAngle, 0.0, 1.0);

  // Smooth transitions between 3 images
  let transitionWidth = 0.12;
  let mask0 = 1.0 - smoothstep(0.33 - transitionWidth, 0.33 + transitionWidth, normalizedAngle);
  let mask1 = smoothstep(0.33 - transitionWidth, 0.33 + transitionWidth, normalizedAngle) *
              (1.0 - smoothstep(0.66 - transitionWidth, 0.66 + transitionWidth, normalizedAngle));
  let mask2 = smoothstep(0.66 - transitionWidth, 0.66 + transitionWidth, normalizedAngle);

  var color = c0 * mask0 + c1 * mask1 + c2 * mask2;

  // Lens ridge effect
  let ridgeHighlight = exp(-pow(stripPhase - 0.5, 2.0) * 30.0) * 0.08;
  let ridgeShadow = 1.0 - pow(abs(stripPhase - 0.5) * 2.0, 0.7) * 0.06;
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

  // --- 2. Holographic Effects (artwork area only) ---
  let artworkMask = isInArtworkArea(uv);
  if (artworkMask > 0.0) {
    // 2a. Cosmos Glitter
    if (uniforms.glitterIntensity > 0.0) {
      let glitterValue = cosmosEffect(uv, pointerPos, uniforms.time);

      // Apply with color-dodge blend for bright sparkles
      let glitterBlend = blendColorDodge(color.rgb, glitterValue);
      color = vec4f(mix(color.rgb, glitterBlend, uniforms.glitterIntensity * artworkMask), color.a);

      // Add soft-light layer for subtler effect
      let softGlitter = blendSoftLight(color.rgb, glitterValue * 0.5);
      color = vec4f(mix(color.rgb, softGlitter, uniforms.glitterIntensity * 0.3 * artworkMask), color.a);
    }

    // 2b. Vertical Holo Beams
    if (uniforms.holoIntensity > 0.0) {
      let holoBeamValue = holoBeamEffect(uv, pointerPos, uniforms.time);
      let holoBeamBlend = blendColorDodge(color.rgb, holoBeamValue);
      color = vec4f(mix(color.rgb, holoBeamBlend, uniforms.holoIntensity * artworkMask), color.a);
    }
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
