(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))i(n);new MutationObserver(n=>{for(const l of n)if(l.type==="childList")for(const a of l.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&i(a)}).observe(document,{childList:!0,subtree:!0});function t(n){const l={};return n.integrity&&(l.integrity=n.integrity),n.referrerPolicy&&(l.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?l.credentials="include":n.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function i(n){if(n.ep)return;n.ep=!0;const l=t(n);fetch(n.href,l)}})();const te=`struct Uniforms {
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
`,ie=`@group(0) @binding(0) var bgSampler: sampler;
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
`,ne=`struct Uniforms {
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
 */class m{constructor(e,t,i,n,l="div"){this.parent=e,this.object=t,this.property=i,this._disabled=!1,this._hidden=!1,this.initialValue=this.getValue(),this.domElement=document.createElement(l),this.domElement.classList.add("lil-controller"),this.domElement.classList.add(n),this.$name=document.createElement("div"),this.$name.classList.add("lil-name"),m.nextNameID=m.nextNameID||0,this.$name.id=`lil-gui-name-${++m.nextNameID}`,this.$widget=document.createElement("div"),this.$widget.classList.add("lil-widget"),this.$disable=this.$widget,this.domElement.appendChild(this.$name),this.domElement.appendChild(this.$widget),this.domElement.addEventListener("keydown",a=>a.stopPropagation()),this.domElement.addEventListener("keyup",a=>a.stopPropagation()),this.parent.children.push(this),this.parent.controllers.push(this),this.parent.$children.appendChild(this.domElement),this._listenCallback=this._listenCallback.bind(this),this.name(i)}name(e){return this._name=e,this.$name.textContent=e,this}onChange(e){return this._onChange=e,this}_callOnChange(){this.parent._callOnChange(this),this._onChange!==void 0&&this._onChange.call(this,this.getValue()),this._changed=!0}onFinishChange(e){return this._onFinishChange=e,this}_callOnFinishChange(){this._changed&&(this.parent._callOnFinishChange(this),this._onFinishChange!==void 0&&this._onFinishChange.call(this,this.getValue())),this._changed=!1}reset(){return this.setValue(this.initialValue),this._callOnFinishChange(),this}enable(e=!0){return this.disable(!e)}disable(e=!0){return e===this._disabled?this:(this._disabled=e,this.domElement.classList.toggle("lil-disabled",e),this.$disable.toggleAttribute("disabled",e),this)}show(e=!0){return this._hidden=!e,this.domElement.style.display=this._hidden?"none":"",this}hide(){return this.show(!1)}options(e){const t=this.parent.add(this.object,this.property,e);return t.name(this._name),this.destroy(),t}min(e){return this}max(e){return this}step(e){return this}decimals(e){return this}listen(e=!0){return this._listening=e,this._listenCallbackID!==void 0&&(cancelAnimationFrame(this._listenCallbackID),this._listenCallbackID=void 0),this._listening&&this._listenCallback(),this}_listenCallback(){this._listenCallbackID=requestAnimationFrame(this._listenCallback);const e=this.save();e!==this._listenPrevValue&&this.updateDisplay(),this._listenPrevValue=e}getValue(){return this.object[this.property]}setValue(e){return this.getValue()!==e&&(this.object[this.property]=e,this._callOnChange(),this.updateDisplay()),this}updateDisplay(){return this}load(e){return this.setValue(e),this._callOnFinishChange(),this}save(){return this.getValue()}destroy(){this.listen(!1),this.parent.children.splice(this.parent.children.indexOf(this),1),this.parent.controllers.splice(this.parent.controllers.indexOf(this),1),this.parent.$children.removeChild(this.domElement)}}class se extends m{constructor(e,t,i){super(e,t,i,"lil-boolean","label"),this.$input=document.createElement("input"),this.$input.setAttribute("type","checkbox"),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$widget.appendChild(this.$input),this.$input.addEventListener("change",()=>{this.setValue(this.$input.checked),this._callOnFinishChange()}),this.$disable=this.$input,this.updateDisplay()}updateDisplay(){return this.$input.checked=this.getValue(),this}}function X(s){let e,t;return(e=s.match(/(#|0x)?([a-f0-9]{6})/i))?t=e[2]:(e=s.match(/rgb\(\s*(\d*)\s*,\s*(\d*)\s*,\s*(\d*)\s*\)/))?t=parseInt(e[1]).toString(16).padStart(2,0)+parseInt(e[2]).toString(16).padStart(2,0)+parseInt(e[3]).toString(16).padStart(2,0):(e=s.match(/^#?([a-f0-9])([a-f0-9])([a-f0-9])$/i))&&(t=e[1]+e[1]+e[2]+e[2]+e[3]+e[3]),t?"#"+t:!1}const re={isPrimitive:!0,match:s=>typeof s=="string",fromHexString:X,toHexString:X},O={isPrimitive:!0,match:s=>typeof s=="number",fromHexString:s=>parseInt(s.substring(1),16),toHexString:s=>"#"+s.toString(16).padStart(6,0)},le={isPrimitive:!1,match:s=>Array.isArray(s)||ArrayBuffer.isView(s),fromHexString(s,e,t=1){const i=O.fromHexString(s);e[0]=(i>>16&255)/255*t,e[1]=(i>>8&255)/255*t,e[2]=(i&255)/255*t},toHexString([s,e,t],i=1){i=255/i;const n=s*i<<16^e*i<<8^t*i<<0;return O.toHexString(n)}},oe={isPrimitive:!1,match:s=>Object(s)===s,fromHexString(s,e,t=1){const i=O.fromHexString(s);e.r=(i>>16&255)/255*t,e.g=(i>>8&255)/255*t,e.b=(i&255)/255*t},toHexString({r:s,g:e,b:t},i=1){i=255/i;const n=s*i<<16^e*i<<8^t*i<<0;return O.toHexString(n)}},ae=[re,O,le,oe];function de(s){return ae.find(e=>e.match(s))}class ce extends m{constructor(e,t,i,n){super(e,t,i,"lil-color"),this.$input=document.createElement("input"),this.$input.setAttribute("type","color"),this.$input.setAttribute("tabindex",-1),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$text=document.createElement("input"),this.$text.setAttribute("type","text"),this.$text.setAttribute("spellcheck","false"),this.$text.setAttribute("aria-labelledby",this.$name.id),this.$display=document.createElement("div"),this.$display.classList.add("lil-display"),this.$display.appendChild(this.$input),this.$widget.appendChild(this.$display),this.$widget.appendChild(this.$text),this._format=de(this.initialValue),this._rgbScale=n,this._initialValueHexString=this.save(),this._textFocused=!1,this.$input.addEventListener("input",()=>{this._setValueFromHexString(this.$input.value)}),this.$input.addEventListener("blur",()=>{this._callOnFinishChange()}),this.$text.addEventListener("input",()=>{const l=X(this.$text.value);l&&this._setValueFromHexString(l)}),this.$text.addEventListener("focus",()=>{this._textFocused=!0,this.$text.select()}),this.$text.addEventListener("blur",()=>{this._textFocused=!1,this.updateDisplay(),this._callOnFinishChange()}),this.$disable=this.$text,this.updateDisplay()}reset(){return this._setValueFromHexString(this._initialValueHexString),this}_setValueFromHexString(e){if(this._format.isPrimitive){const t=this._format.fromHexString(e);this.setValue(t)}else this._format.fromHexString(e,this.getValue(),this._rgbScale),this._callOnChange(),this.updateDisplay()}save(){return this._format.toHexString(this.getValue(),this._rgbScale)}load(e){return this._setValueFromHexString(e),this._callOnFinishChange(),this}updateDisplay(){return this.$input.value=this._format.toHexString(this.getValue(),this._rgbScale),this._textFocused||(this.$text.value=this.$input.value.substring(1)),this.$display.style.backgroundColor=this.$input.value,this}}class B extends m{constructor(e,t,i){super(e,t,i,"lil-function"),this.$button=document.createElement("button"),this.$button.appendChild(this.$name),this.$widget.appendChild(this.$button),this.$button.addEventListener("click",n=>{n.preventDefault(),this.getValue().call(this.object),this._callOnChange()}),this.$button.addEventListener("touchstart",()=>{},{passive:!0}),this.$disable=this.$button}}class he extends m{constructor(e,t,i,n,l,a){super(e,t,i,"lil-number"),this._initInput(),this.min(n),this.max(l);const h=a!==void 0;this.step(h?a:this._getImplicitStep(),h),this.updateDisplay()}decimals(e){return this._decimals=e,this.updateDisplay(),this}min(e){return this._min=e,this._onUpdateMinMax(),this}max(e){return this._max=e,this._onUpdateMinMax(),this}step(e,t=!0){return this._step=e,this._stepExplicit=t,this}updateDisplay(){const e=this.getValue();if(this._hasSlider){let t=(e-this._min)/(this._max-this._min);t=Math.max(0,Math.min(t,1)),this.$fill.style.width=t*100+"%"}return this._inputFocused||(this.$input.value=this._decimals===void 0?e:e.toFixed(this._decimals)),this}_initInput(){this.$input=document.createElement("input"),this.$input.setAttribute("type","text"),this.$input.setAttribute("aria-labelledby",this.$name.id),window.matchMedia("(pointer: coarse)").matches&&(this.$input.setAttribute("type","number"),this.$input.setAttribute("step","any")),this.$widget.appendChild(this.$input),this.$disable=this.$input;const t=()=>{let r=parseFloat(this.$input.value);isNaN(r)||(this._stepExplicit&&(r=this._snap(r)),this.setValue(this._clamp(r)))},i=r=>{const c=parseFloat(this.$input.value);isNaN(c)||(this._snapClampSetValue(c+r),this.$input.value=this.getValue())},n=r=>{r.key==="Enter"&&this.$input.blur(),r.code==="ArrowUp"&&(r.preventDefault(),i(this._step*this._arrowKeyMultiplier(r))),r.code==="ArrowDown"&&(r.preventDefault(),i(this._step*this._arrowKeyMultiplier(r)*-1))},l=r=>{this._inputFocused&&(r.preventDefault(),i(this._step*this._normalizeMouseWheel(r)))};let a=!1,h,v,y,f,u;const _=5,$=r=>{h=r.clientX,v=y=r.clientY,a=!0,f=this.getValue(),u=0,window.addEventListener("mousemove",A),window.addEventListener("mouseup",b)},A=r=>{if(a){const c=r.clientX-h,C=r.clientY-v;Math.abs(C)>_?(r.preventDefault(),this.$input.blur(),a=!1,this._setDraggingStyle(!0,"vertical")):Math.abs(c)>_&&b()}if(!a){const c=r.clientY-y;u-=c*this._step*this._arrowKeyMultiplier(r),f+u>this._max?u=this._max-f:f+u<this._min&&(u=this._min-f),this._snapClampSetValue(f+u)}y=r.clientY},b=()=>{this._setDraggingStyle(!1,"vertical"),this._callOnFinishChange(),window.removeEventListener("mousemove",A),window.removeEventListener("mouseup",b)},E=()=>{this._inputFocused=!0},o=()=>{this._inputFocused=!1,this.updateDisplay(),this._callOnFinishChange()};this.$input.addEventListener("input",t),this.$input.addEventListener("keydown",n),this.$input.addEventListener("wheel",l,{passive:!1}),this.$input.addEventListener("mousedown",$),this.$input.addEventListener("focus",E),this.$input.addEventListener("blur",o)}_initSlider(){this._hasSlider=!0,this.$slider=document.createElement("div"),this.$slider.classList.add("lil-slider"),this.$fill=document.createElement("div"),this.$fill.classList.add("lil-fill"),this.$slider.appendChild(this.$fill),this.$widget.insertBefore(this.$slider,this.$input),this.domElement.classList.add("lil-has-slider");const e=(o,r,c,C,Y)=>(o-r)/(c-r)*(Y-C)+C,t=o=>{const r=this.$slider.getBoundingClientRect();let c=e(o,r.left,r.right,this._min,this._max);this._snapClampSetValue(c)},i=o=>{this._setDraggingStyle(!0),t(o.clientX),window.addEventListener("mousemove",n),window.addEventListener("mouseup",l)},n=o=>{t(o.clientX)},l=()=>{this._callOnFinishChange(),this._setDraggingStyle(!1),window.removeEventListener("mousemove",n),window.removeEventListener("mouseup",l)};let a=!1,h,v;const y=o=>{o.preventDefault(),this._setDraggingStyle(!0),t(o.touches[0].clientX),a=!1},f=o=>{o.touches.length>1||(this._hasScrollBar?(h=o.touches[0].clientX,v=o.touches[0].clientY,a=!0):y(o),window.addEventListener("touchmove",u,{passive:!1}),window.addEventListener("touchend",_))},u=o=>{if(a){const r=o.touches[0].clientX-h,c=o.touches[0].clientY-v;Math.abs(r)>Math.abs(c)?y(o):(window.removeEventListener("touchmove",u),window.removeEventListener("touchend",_))}else o.preventDefault(),t(o.touches[0].clientX)},_=()=>{this._callOnFinishChange(),this._setDraggingStyle(!1),window.removeEventListener("touchmove",u),window.removeEventListener("touchend",_)},$=this._callOnFinishChange.bind(this),A=400;let b;const E=o=>{if(Math.abs(o.deltaX)<Math.abs(o.deltaY)&&this._hasScrollBar)return;o.preventDefault();const c=this._normalizeMouseWheel(o)*this._step;this._snapClampSetValue(this.getValue()+c),this.$input.value=this.getValue(),clearTimeout(b),b=setTimeout($,A)};this.$slider.addEventListener("mousedown",i),this.$slider.addEventListener("touchstart",f,{passive:!1}),this.$slider.addEventListener("wheel",E,{passive:!1})}_setDraggingStyle(e,t="horizontal"){this.$slider&&this.$slider.classList.toggle("lil-active",e),document.body.classList.toggle("lil-dragging",e),document.body.classList.toggle(`lil-${t}`,e)}_getImplicitStep(){return this._hasMin&&this._hasMax?(this._max-this._min)/1e3:.1}_onUpdateMinMax(){!this._hasSlider&&this._hasMin&&this._hasMax&&(this._stepExplicit||this.step(this._getImplicitStep(),!1),this._initSlider(),this.updateDisplay())}_normalizeMouseWheel(e){let{deltaX:t,deltaY:i}=e;return Math.floor(e.deltaY)!==e.deltaY&&e.wheelDelta&&(t=0,i=-e.wheelDelta/120,i*=this._stepExplicit?1:10),t+-i}_arrowKeyMultiplier(e){let t=this._stepExplicit?1:10;return e.shiftKey?t*=10:e.altKey&&(t/=10),t}_snap(e){let t=0;return this._hasMin?t=this._min:this._hasMax&&(t=this._max),e-=t,e=Math.round(e/this._step)*this._step,e+=t,e=parseFloat(e.toPrecision(15)),e}_clamp(e){return e<this._min&&(e=this._min),e>this._max&&(e=this._max),e}_snapClampSetValue(e){this.setValue(this._clamp(this._snap(e)))}get _hasScrollBar(){const e=this.parent.root.$children;return e.scrollHeight>e.clientHeight}get _hasMin(){return this._min!==void 0}get _hasMax(){return this._max!==void 0}}class ue extends m{constructor(e,t,i,n){super(e,t,i,"lil-option"),this.$select=document.createElement("select"),this.$select.setAttribute("aria-labelledby",this.$name.id),this.$display=document.createElement("div"),this.$display.classList.add("lil-display"),this.$select.addEventListener("change",()=>{this.setValue(this._values[this.$select.selectedIndex]),this._callOnFinishChange()}),this.$select.addEventListener("focus",()=>{this.$display.classList.add("lil-focus")}),this.$select.addEventListener("blur",()=>{this.$display.classList.remove("lil-focus")}),this.$widget.appendChild(this.$select),this.$widget.appendChild(this.$display),this.$disable=this.$select,this.options(n)}options(e){return this._values=Array.isArray(e)?e:Object.values(e),this._names=Array.isArray(e)?e:Object.keys(e),this.$select.replaceChildren(),this._names.forEach(t=>{const i=document.createElement("option");i.textContent=t,this.$select.appendChild(i)}),this.updateDisplay(),this}updateDisplay(){const e=this.getValue(),t=this._values.indexOf(e);return this.$select.selectedIndex=t,this.$display.textContent=t===-1?e:this._names[t],this}}class pe extends m{constructor(e,t,i){super(e,t,i,"lil-string"),this.$input=document.createElement("input"),this.$input.setAttribute("type","text"),this.$input.setAttribute("spellcheck","false"),this.$input.setAttribute("aria-labelledby",this.$name.id),this.$input.addEventListener("input",()=>{this.setValue(this.$input.value)}),this.$input.addEventListener("keydown",n=>{n.code==="Enter"&&this.$input.blur()}),this.$input.addEventListener("blur",()=>{this._callOnFinishChange()}),this.$widget.appendChild(this.$input),this.$disable=this.$input,this.updateDisplay()}updateDisplay(){return this.$input.value=this.getValue(),this}}var fe=`.lil-gui {
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
}`;function ge(s){const e=document.createElement("style");e.innerHTML=s;const t=document.querySelector("head link[rel=stylesheet], head style");t?document.head.insertBefore(e,t):document.head.appendChild(e)}let q=!1;class H{constructor({parent:e,autoPlace:t=e===void 0,container:i,width:n,title:l="Controls",closeFolders:a=!1,injectStyles:h=!0,touchStyles:v=!0}={}){if(this.parent=e,this.root=e?e.root:this,this.children=[],this.controllers=[],this.folders=[],this._closed=!1,this._hidden=!1,this.domElement=document.createElement("div"),this.domElement.classList.add("lil-gui"),this.$title=document.createElement("button"),this.$title.classList.add("lil-title"),this.$title.setAttribute("aria-expanded",!0),this.$title.addEventListener("click",()=>this.openAnimated(this._closed)),this.$title.addEventListener("touchstart",()=>{},{passive:!0}),this.$children=document.createElement("div"),this.$children.classList.add("lil-children"),this.domElement.appendChild(this.$title),this.domElement.appendChild(this.$children),this.title(l),this.parent){this.parent.children.push(this),this.parent.folders.push(this),this.parent.$children.appendChild(this.domElement);return}this.domElement.classList.add("lil-root"),v&&this.domElement.classList.add("lil-allow-touch-styles"),!q&&h&&(ge(fe),q=!0),i?i.appendChild(this.domElement):t&&(this.domElement.classList.add("lil-auto-place","autoPlace"),document.body.appendChild(this.domElement)),n&&this.domElement.style.setProperty("--width",n+"px"),this._closeFolders=a}add(e,t,i,n,l){if(Object(i)===i)return new ue(this,e,t,i);const a=e[t];switch(typeof a){case"number":return new he(this,e,t,i,n,l);case"boolean":return new se(this,e,t);case"string":return new pe(this,e,t);case"function":return new B(this,e,t)}console.error(`gui.add failed
	property:`,t,`
	object:`,e,`
	value:`,a)}addColor(e,t,i=1){return new ce(this,e,t,i)}addFolder(e){const t=new H({parent:this,title:e});return this.root._closeFolders&&t.close(),t}load(e,t=!0){return e.controllers&&this.controllers.forEach(i=>{i instanceof B||i._name in e.controllers&&i.load(e.controllers[i._name])}),t&&e.folders&&this.folders.forEach(i=>{i._title in e.folders&&i.load(e.folders[i._title])}),this}save(e=!0){const t={controllers:{},folders:{}};return this.controllers.forEach(i=>{if(!(i instanceof B)){if(i._name in t.controllers)throw new Error(`Cannot save GUI with duplicate property "${i._name}"`);t.controllers[i._name]=i.save()}}),e&&this.folders.forEach(i=>{if(i._title in t.folders)throw new Error(`Cannot save GUI with duplicate folder "${i._title}"`);t.folders[i._title]=i.save()}),t}open(e=!0){return this._setClosed(!e),this.$title.setAttribute("aria-expanded",!this._closed),this.domElement.classList.toggle("lil-closed",this._closed),this}close(){return this.open(!1)}_setClosed(e){this._closed!==e&&(this._closed=e,this._callOnOpenClose(this))}show(e=!0){return this._hidden=!e,this.domElement.style.display=this._hidden?"none":"",this}hide(){return this.show(!1)}openAnimated(e=!0){return this._setClosed(!e),this.$title.setAttribute("aria-expanded",!this._closed),requestAnimationFrame(()=>{const t=this.$children.clientHeight;this.$children.style.height=t+"px",this.domElement.classList.add("lil-transition");const i=l=>{l.target===this.$children&&(this.$children.style.height="",this.domElement.classList.remove("lil-transition"),this.$children.removeEventListener("transitionend",i))};this.$children.addEventListener("transitionend",i);const n=e?this.$children.scrollHeight:0;this.domElement.classList.toggle("lil-closed",!e),requestAnimationFrame(()=>{this.$children.style.height=n+"px"})}),this}title(e){return this._title=e,this.$title.textContent=e,this}reset(e=!0){return(e?this.controllersRecursive():this.controllers).forEach(i=>i.reset()),this}onChange(e){return this._onChange=e,this}_callOnChange(e){this.parent&&this.parent._callOnChange(e),this._onChange!==void 0&&this._onChange.call(this,{object:e.object,property:e.property,value:e.getValue(),controller:e})}onFinishChange(e){return this._onFinishChange=e,this}_callOnFinishChange(e){this.parent&&this.parent._callOnFinishChange(e),this._onFinishChange!==void 0&&this._onFinishChange.call(this,{object:e.object,property:e.property,value:e.getValue(),controller:e})}onOpenClose(e){return this._onOpenClose=e,this}_callOnOpenClose(e){this.parent&&this.parent._callOnOpenClose(e),this._onOpenClose!==void 0&&this._onOpenClose.call(this,e)}destroy(){this.parent&&(this.parent.children.splice(this.parent.children.indexOf(this),1),this.parent.folders.splice(this.parent.folders.indexOf(this),1)),this.domElement.parentElement&&this.domElement.parentElement.removeChild(this.domElement),Array.from(this.children).forEach(e=>e.destroy())}controllersRecursive(){let e=Array.from(this.controllers);return this.folders.forEach(t=>{e=e.concat(t.controllersRecursive())}),e}foldersRecursive(){let e=Array.from(this.folders);return this.folders.forEach(t=>{e=e.concat(t.foldersRecursive())}),e}}async function me(){const s=document.querySelector("#app-canvas");if(!navigator.gpu)throw new Error("WebGPU not supported on this browser.");const e=await navigator.gpu.requestAdapter();if(!e)throw new Error("No appropriate GPU adapter found.");const t=await e.requestDevice(),i=s.getContext("webgpu"),n=navigator.gpu.getPreferredCanvasFormat();i.configure({device:t,format:n,alphaMode:"premultiplied"});const l=async p=>{const g=await(await fetch(p)).blob(),x=await createImageBitmap(g),P=t.createTexture({size:[x.width,x.height,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return t.queue.copyExternalImageToTexture({source:x},{texture:P},[x.width,x.height]),P},a="/lenticular-lens/",[h,v,y,f]=await Promise.all([l(`${a}assets/boa.png`),l(`${a}assets/nico.png`),l(`${a}assets/nami.png`),l(`${a}assets/background.jpg`)]),u=t.createSampler({magFilter:"linear",minFilter:"linear"}),$=t.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),A=t.createShaderModule({code:te}),b=t.createRenderPipeline({layout:"auto",vertex:{module:A,entryPoint:"vs_main"},fragment:{module:A,entryPoint:"fs_main",targets:[{format:n,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}}),E=t.createBindGroup({layout:b.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:$}},{binding:1,resource:u},{binding:2,resource:h.createView()},{binding:3,resource:v.createView()},{binding:4,resource:y.createView()}]}),o=t.createShaderModule({code:ie}),r=t.createBuffer({size:8,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),c=t.createRenderPipeline({layout:"auto",vertex:{module:o,entryPoint:"vs_main"},fragment:{module:o,entryPoint:"fs_main",targets:[{format:n}]},primitive:{topology:"triangle-list"}}),C=t.createBindGroup({layout:c.getBindGroupLayout(0),entries:[{binding:0,resource:u},{binding:1,resource:f.createView()},{binding:2,resource:{buffer:r}}]}),Y=f.width/f.height,U=t.createShaderModule({code:ne}),G=t.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),T=t.createRenderPipeline({layout:"auto",vertex:{module:U,entryPoint:"vs_main"},fragment:{module:U,entryPoint:"fs_main",targets:[{format:n,blend:{color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}]},primitive:{topology:"triangle-list"}}),K=t.createBindGroup({layout:T.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:G}}]});let F=0,D=0,z=0,M=0;const j=h.width/h.height,d={lensDensity:70,cardScale:.8,autoRotate:!0,rotateSpeed:1,holoIntensity:.25,glareIntensity:1,sparkleIntensity:.5,glossiness:.7,shadowOpacity:.5,shadowSoftness:.15},S=new H({title:"Controls"});S.close(),S.addFolder("Lenticular").add(d,"lensDensity",5,100,1).name("Strip Density");const L=S.addFolder("Holographic");L.add(d,"holoIntensity",0,1,.05).name("Rainbow"),L.add(d,"glareIntensity",0,1,.05).name("Glare"),L.add(d,"sparkleIntensity",0,1,.05).name("Sparkle"),L.add(d,"glossiness",0,1,.05).name("Glossiness");const k=S.addFolder("Card");k.add(d,"cardScale",.3,1.5,.05).name("Scale"),k.add(d,"autoRotate").name("Auto Rotate"),k.add(d,"rotateSpeed",.1,3,.1).name("Rotate Speed"),k.add(d,"shadowOpacity",0,1,.05).name("Shadow"),k.add(d,"shadowSoftness",.05,.3,.01).name("Shadow Soft");const Z=document.querySelector("#ui");Z&&Z.remove();function J(p){d.autoRotate&&(M=Math.sin(p*.001*d.rotateSpeed)*.5,z=Math.sin(p*7e-4*d.rotateSpeed)*.2),F+=(z-F)*.08,D+=(M-D)*.08;const w=s.width/s.height,g=new Float32Array([F,D,d.lensDensity,j,w,d.cardScale,d.holoIntensity,d.glareIntensity,d.sparkleIntensity,d.glossiness,p*.001,0]);t.queue.writeBuffer($,0,g)}function N(p){J(p);const w=s.width/s.height;t.queue.writeBuffer(r,0,new Float32Array([w,Y]));const g=t.createCommandEncoder(),x=i.getCurrentTexture().createView(),P={colorAttachments:[{view:x,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]},V=g.beginRenderPass(P);V.setPipeline(c),V.setBindGroup(0,C),V.draw(3,1,0,0),V.end(),t.queue.writeBuffer(G,0,new Float32Array([F,D,d.cardScale,j,w,d.shadowOpacity,d.shadowSoftness,0]));const Q={colorAttachments:[{view:x,loadOp:"load",storeOp:"store"}]},I=g.beginRenderPass(Q);I.setPipeline(T),I.setBindGroup(0,K),I.draw(1536,1,0,0),I.end();const ee={colorAttachments:[{view:x,loadOp:"load",storeOp:"store"}]},R=g.beginRenderPass(ee);R.setPipeline(b),R.setBindGroup(0,E),R.draw(1536,1,0,0),R.end(),t.queue.submit([g.finish()]),requestAnimationFrame(N)}window.addEventListener("pointermove",p=>{if(!d.autoRotate){const w=p.clientX/window.innerWidth*2-1,g=p.clientY/window.innerHeight*2-1;M=w*.5,z=-g*.3}}),s.addEventListener("pointerdown",()=>{var p;d.autoRotate&&(d.autoRotate=!1,(p=S.controllersRecursive().find(w=>w.property==="autoRotate"))==null||p.updateDisplay())});function W(){s.width=window.innerWidth*window.devicePixelRatio,s.height=window.innerHeight*window.devicePixelRatio}window.addEventListener("resize",W),W(),requestAnimationFrame(N)}me().catch(s=>{console.error(s)});
