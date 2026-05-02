import './style.css';
import shaderSource from './lenticular.wgsl?raw';
import GUI from 'lil-gui';

async function init() {
  const canvas = document.querySelector('#app-canvas') as HTMLCanvasElement;
  if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No appropriate GPU adapter found.");
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: canvasFormat,
    alphaMode: 'premultiplied',
  });

  // Load textures
  const loadImage = async (url: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const source = await createImageBitmap(blob);
    
    const texture = device.createTexture({
      size: [source.width, source.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    
    device.queue.copyExternalImageToTexture(
      { source },
      { texture },
      [source.width, source.height]
    );
    
    return texture;
  };

  const [t0, t1, t2] = await Promise.all([
    loadImage('/assets/boa.png'),
    loadImage('/assets/nico.png'),
    loadImage('/assets/nami.png'),
  ]);

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // Uniforms: rotateX, rotateY, lensDensity, imageAspectRatio, canvasAspectRatio, cardScale,
  // holoIntensity, glareIntensity, sparkleIntensity, time, padding x2
  const uniformBufferSize = 48; // 12 floats
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shaderModule = device.createShaderModule({
    code: shaderSource,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: canvasFormat,
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: t0.createView() },
      { binding: 3, resource: t1.createView() },
      { binding: 4, resource: t2.createView() },
    ],
  });

  let rotateX = 0;
  let rotateY = 0;
  let targetRotateX = 0;
  let targetRotateY = 0;
  const imageAspectRatio = t0.width / t0.height;

  // Parameters controllable via GUI
  const params = {
    lensDensity: 70,
    cardScale: 0.8,
    autoRotate: true,
    rotateSpeed: 1.0,
    holoIntensity: 0.25,
    glareIntensity: 1.0,
    sparkleIntensity: 0.5,
    glossiness: 0.7,
  };

  // Setup lil-gui
  const gui = new GUI({ title: 'Controls' });
  gui.close();

  const lenticularFolder = gui.addFolder('Lenticular');
  lenticularFolder.add(params, 'lensDensity', 5, 100, 1).name('Strip Density');

  const holoFolder = gui.addFolder('Holographic');
  holoFolder.add(params, 'holoIntensity', 0, 1, 0.05).name('Rainbow');
  holoFolder.add(params, 'glareIntensity', 0, 1, 0.05).name('Glare');
  holoFolder.add(params, 'sparkleIntensity', 0, 1, 0.05).name('Sparkle');
  holoFolder.add(params, 'glossiness', 0, 1, 0.05).name('Glossiness');

  const cardFolder = gui.addFolder('Card');
  cardFolder.add(params, 'cardScale', 0.3, 1.5, 0.05).name('Scale');
  cardFolder.add(params, 'autoRotate').name('Auto Rotate');
  cardFolder.add(params, 'rotateSpeed', 0.1, 3, 0.1).name('Rotate Speed');

  // Remove old UI button since we have GUI now
  const oldUI = document.querySelector('#ui');
  if (oldUI) oldUI.remove();

  function updateUniforms(time: number) {
    if (params.autoRotate) {
      targetRotateY = Math.sin(time * 0.001 * params.rotateSpeed) * 0.5;
      targetRotateX = Math.sin(time * 0.0007 * params.rotateSpeed) * 0.2;
    }

    // Smooth interpolation for fluid motion
    rotateX += (targetRotateX - rotateX) * 0.08;
    rotateY += (targetRotateY - rotateY) * 0.08;

    const canvasAspectRatio = canvas.width / canvas.height;

    const arrayBuffer = new Float32Array([
      rotateX,
      rotateY,
      params.lensDensity,
      imageAspectRatio,
      canvasAspectRatio,
      params.cardScale,
      params.holoIntensity,
      params.glareIntensity,
      params.sparkleIntensity,
      params.glossiness,
      time * 0.001, // time in seconds
      0, // padding
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, arrayBuffer);
  }

  function frame(time: number) {
    updateUniforms(time);

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(1536, 1, 0, 0); // 16x16 grid = 256 cells × 6 vertices
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(frame);
  }

  window.addEventListener('mousemove', (e) => {
    if (!params.autoRotate) {
      // Map mouse position to rotation angles
      const mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      const mouseY = (e.clientY / window.innerHeight) * 2 - 1;

      // Rotate card based on mouse position (like hovering over a 3D card)
      targetRotateY = mouseX * 0.5;  // Horizontal rotation
      targetRotateX = -mouseY * 0.3; // Vertical rotation (inverted for natural feel)
    }
  });

  // Resize handling
  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
  }
  window.addEventListener('resize', resize);
  resize();

  requestAnimationFrame(frame);
}

init().catch(err => {
  console.error(err);
});
