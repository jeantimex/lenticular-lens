@group(0) @binding(0) var bgSampler: sampler;
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
