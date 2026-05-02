import './style.css';
import shaderSource from './lenticular.wgsl?raw';
import backgroundShaderSource from './background.wgsl?raw';
import shadowShaderSource from './shadow.wgsl?raw';
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

  const base = import.meta.env.BASE_URL;
  const [t0, t1, t2, bgTexture] = await Promise.all([
    loadImage(`${base}assets/boa.png`),
    loadImage(`${base}assets/nico.png`),
    loadImage(`${base}assets/nami.png`),
    loadImage(`${base}assets/background.jpg`),
  ]);

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // Uniforms: rotateX, rotateY, lensDensity, imageAspectRatio, canvasAspectRatio, cardScale,
  // glareIntensity, glossiness, glitterIntensity, holoIntensity, radiantIntensity,
  // radiantStripWidth, radiantBrightness, time, padding x2
  const uniformBufferSize = 64; // 16 floats
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
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
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

  // Background pipeline
  const bgShaderModule = device.createShaderModule({
    code: backgroundShaderSource,
  });

  const bgUniformBuffer = device.createBuffer({
    size: 8, // 2 floats: canvasAspectRatio, imageAspectRatio
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bgPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: bgShaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: bgShaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: canvasFormat,
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const bgBindGroup = device.createBindGroup({
    layout: bgPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: bgTexture.createView() },
      { binding: 2, resource: { buffer: bgUniformBuffer } },
    ],
  });

  const bgImageAspectRatio = bgTexture.width / bgTexture.height;

  // Shadow pipeline
  const shadowShaderModule = device.createShaderModule({
    code: shadowShaderSource,
  });

  const shadowUniformBuffer = device.createBuffer({
    size: 32, // 8 floats
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shadowPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shadowShaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shadowShaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: canvasFormat,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const shadowBindGroup = device.createBindGroup({
    layout: shadowPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: shadowUniformBuffer } },
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
    glareEnabled: false,
    glareIntensity: 1.0,
    glossiness: 0.7,
    glitterEnabled: false,
    glitterIntensity: 0.6,
    holoEnabled: false,
    holoIntensity: 0.5,
    radiantEnabled: false,
    radiantIntensity: 0.5,
    radiantScale: 2.5,
    radiantBrightness: 0.8,
    radiantArtworkIntensity: 0.2,
    shadowOpacity: 0.5,
    shadowSoftness: 0.15,
  };

  // Setup lil-gui
  const gui = new GUI({ title: 'Controls' });
  gui.close();

  const lenticularFolder = gui.addFolder('Lenticular');
  lenticularFolder.add(params, 'lensDensity', 5, 100, 1).name('Strip Density');

  const holoFolder = gui.addFolder('Holographic');
  const glareFolder = holoFolder.addFolder('Glare');
  glareFolder.add(params, 'glareEnabled').name('Enabled');
  glareFolder.add(params, 'glareIntensity', 0, 1, 0.05).name('Intensity');

  const glitterFolder = holoFolder.addFolder('Glitter');
  glitterFolder.add(params, 'glitterEnabled').name('Enabled');
  glitterFolder.add(params, 'glitterIntensity', 0, 1, 0.05).name('Intensity');

  const holoBeansFolder = holoFolder.addFolder('Holo Beans');
  holoBeansFolder.add(params, 'holoEnabled').name('Enabled');
  holoBeansFolder.add(params, 'holoIntensity', 0, 1, 0.05).name('Intensity');

  const radiantFolder = holoFolder.addFolder('Radiant Holofoil');
  radiantFolder.add(params, 'radiantEnabled').name('Enabled');
  radiantFolder.add(params, 'radiantIntensity', 0, 1, 0.05).name('Intensity');
  radiantFolder.add(params, 'radiantScale', 0.35, 2.5, 0.05).name('Scale');
  radiantFolder.add(params, 'radiantBrightness', 0.4, 2.0, 0.05).name('Brightness');
  radiantFolder.add(params, 'radiantArtworkIntensity', 0, 1, 0.05).name('Artwork Alpha');

  const cardFolder = gui.addFolder('Card');
  cardFolder.add(params, 'glossiness', 0, 1, 0.05).name('Glossiness');
  cardFolder.add(params, 'cardScale', 0.3, 1.5, 0.05).name('Scale');
  cardFolder.add(params, 'autoRotate').name('Auto Rotate');
  cardFolder.add(params, 'rotateSpeed', 0.1, 3, 0.1).name('Rotate Speed');
  cardFolder.add(params, 'shadowOpacity', 0, 1, 0.05).name('Shadow');
  cardFolder.add(params, 'shadowSoftness', 0.05, 0.3, 0.01).name('Shadow Soft');

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
      params.glareEnabled ? params.glareIntensity : 0,
      params.glossiness,
      params.glitterEnabled ? params.glitterIntensity : 0,
      params.holoEnabled ? params.holoIntensity : 0,
      params.radiantEnabled ? params.radiantIntensity : 0,
      params.radiantScale,
      params.radiantBrightness,
      params.radiantArtworkIntensity,
      time * 0.001, // time in seconds
      0,
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, arrayBuffer);
  }

  function frame(time: number) {
    updateUniforms(time);

    // Update background uniforms
    const canvasAspectRatio = canvas.width / canvas.height;
    device.queue.writeBuffer(bgUniformBuffer, 0, new Float32Array([canvasAspectRatio, bgImageAspectRatio]));

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    // Draw background
    const bgPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    };

    const bgPassEncoder = commandEncoder.beginRenderPass(bgPassDescriptor);
    bgPassEncoder.setPipeline(bgPipeline);
    bgPassEncoder.setBindGroup(0, bgBindGroup);
    bgPassEncoder.draw(3, 1, 0, 0);
    bgPassEncoder.end();

    // Draw shadow
    device.queue.writeBuffer(shadowUniformBuffer, 0, new Float32Array([
      rotateX,
      rotateY,
      params.cardScale,
      imageAspectRatio,
      canvasAspectRatio,
      params.shadowOpacity,
      params.shadowSoftness,
      0, // padding
    ]));

    const shadowPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [{
        view: textureView,
        loadOp: 'load',
        storeOp: 'store',
      }],
    };

    const shadowPassEncoder = commandEncoder.beginRenderPass(shadowPassDescriptor);
    shadowPassEncoder.setPipeline(shadowPipeline);
    shadowPassEncoder.setBindGroup(0, shadowBindGroup);
    shadowPassEncoder.draw(1536, 1, 0, 0);
    shadowPassEncoder.end();

    // Draw card
    const cardPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [{
        view: textureView,
        loadOp: 'load',
        storeOp: 'store',
      }],
    };

    const cardPassEncoder = commandEncoder.beginRenderPass(cardPassDescriptor);
    cardPassEncoder.setPipeline(pipeline);
    cardPassEncoder.setBindGroup(0, bindGroup);
    cardPassEncoder.draw(1536, 1, 0, 0);
    cardPassEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(frame);
  }

  // Pointer events for mouse and touch support
  window.addEventListener('pointermove', (e) => {
    if (!params.autoRotate) {
      const pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      const pointerY = (e.clientY / window.innerHeight) * 2 - 1;

      targetRotateY = pointerX * 0.5;
      targetRotateX = -pointerY * 0.3;
    }
  });

  // Touch/click on canvas to disable auto-rotate and enable manual control
  canvas.addEventListener('pointerdown', () => {
    if (params.autoRotate) {
      params.autoRotate = false;
      gui.controllersRecursive().find(c => c.property === 'autoRotate')?.updateDisplay();
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
