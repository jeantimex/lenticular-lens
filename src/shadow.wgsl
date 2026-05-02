struct Uniforms {
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
