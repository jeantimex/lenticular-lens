struct Uniforms {
  rotateX: f32,
  rotateY: f32,
  lensDensity: f32,
  imageAspectRatio: f32,
  canvasAspectRatio: f32,
  cardScale: f32,
  holoIntensity: f32,
  glareIntensity: f32,
  sparkleIntensity: f32,
  glossiness: f32,
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

// Hash function for noise
fn hash(p: vec2f) -> f32 {
  let p3 = fract(vec3f(p.x, p.y, p.x) * 0.13);
  let p3dot = dot(p3, vec3f(p3.y, p3.z, p3.x) + 33.33);
  return fract((p3.x + p3.y) * p3.z + p3dot);
}

// Sparkle noise
fn sparkle(uv: vec2f, time: f32) -> f32 {
  let grid = floor(uv * 80.0);
  let h = hash(grid + floor(time * 2.0));
  let sparkleThreshold = 0.97;
  if (h > sparkleThreshold) {
    let localUV = fract(uv * 80.0) - 0.5;
    let dist = length(localUV);
    let twinkle = sin(time * 10.0 + h * 100.0) * 0.5 + 0.5;
    return (1.0 - smoothstep(0.0, 0.3, dist)) * twinkle;
  }
  return 0.0;
}

// Rainbow holo gradient
fn rainbowGradient(t: f32) -> vec3f {
  let colors = array<vec3f, 6>(
    vec3f(0.97, 0.05, 0.21),  // Red
    vec3f(0.93, 0.87, 0.06),  // Yellow
    vec3f(0.13, 0.91, 0.52),  // Green
    vec3f(0.05, 0.74, 0.91),  // Cyan
    vec3f(0.47, 0.32, 0.95),  // Blue
    vec3f(0.79, 0.16, 0.95)   // Violet
  );

  let index = t * 5.0;
  let i = i32(floor(index)) % 6;
  let nextI = (i + 1) % 6;
  let f = fract(index);

  return mix(colors[i], colors[nextI], f);
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

  // --- 1. Rainbow Holographic Gradient ---
  if (uniforms.holoIntensity > 0.0) {
    // Diagonal rainbow that shifts with rotation
    let rainbowShift = (uv.x + uv.y) * 2.0 + (pointerX - 0.5) * 3.0 + (pointerY - 0.5) * 2.0;
    let rainbow = rainbowGradient(fract(rainbowShift));

    // Apply with overlay blend mode
    let holoBlend = blendOverlay(color.rgb, rainbow);
    color = vec4f(mix(color.rgb, holoBlend, uniforms.holoIntensity * 0.5), color.a);

    // Add color dodge for extra shine
    let dodgeBlend = blendColorDodge(color.rgb, rainbow * 0.3);
    color = vec4f(mix(color.rgb, dodgeBlend, uniforms.holoIntensity * 0.3), color.a);
  }

  // --- 2. Glare/Shine Effect ---
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

  // --- 3. Sparkle Effect ---
  if (uniforms.sparkleIntensity > 0.0) {
    let sparkleValue = sparkle(uv, uniforms.time);
    let sparkleColor = vec3f(1.0, 1.0, 1.0) * sparkleValue;

    // Add sparkles with color dodge for bright points
    let sparkleBlend = blendColorDodge(color.rgb, sparkleColor);
    color = vec4f(mix(color.rgb, sparkleBlend, uniforms.sparkleIntensity * sparkleValue), color.a);
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
  let dynamicBrightness = 1.0 + pointerFromCenter * 0.1 * uniforms.holoIntensity;
  color = vec4f(color.rgb * dynamicBrightness, color.a);

  // --- 7. Overall glossy sheen ---
  let sheen = pow(max(0.0, 1.0 - pointerFromCenter), 3.0) * 0.1 * uniforms.glossiness;
  color = vec4f(color.rgb + vec3f(sheen), color.a);

  return color;
}
