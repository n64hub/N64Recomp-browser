// What holds a page's GPU work as it boots: a preload for play_page.mjs (--preload tools/pipeline_probe.js) that wraps
// the page's createShaderModule, createRenderPipeline(Async) and createComputePipeline(Async) and polls the device's
// queue round trip (onSubmittedWorkDone) every 50 ms, logging
//
//   pipeprobe <s> shader <n> <bytes>                                  each shader module, numbered, its WGSL's length
//   pipeprobe <s> render|compute[ async] <ms> <modules> <state>       each pipeline: how long the call took on the page's
//                                                                     thread, its modules' numbers, its depth, cull and
//                                                                     blend state in short
//   pipeprobe <s> roundtrip <ms>                                      each round trip of 200 ms or more
//
// with <s> the seconds since the page's first device was made. Firefox builds a pipeline in its GPU process on the one
// thread that runs every WebGPU call, so a slow build shows as a long round trip right after the pipeline's line, not
// in its <ms>; Chrome builds in the background, and a draw that wants one before it is built shows the same way. Only a
// page's own document starts it, the device the page asks for.
if (self.GPUDevice && !self.__pipelineProbe) {
  self.__pipelineProbe = true;
  let origin = 0;
  const now = () => ((performance.now() - origin) / 1000).toFixed(2);
  const modules = new WeakMap();
  let moduleCount = 0;
  const proto = GPUDevice.prototype;
  const createShaderModule = proto.createShaderModule;
  proto.createShaderModule = function (desc) {
    const module = createShaderModule.call(this, desc);
    modules.set(module, ++moduleCount);
    console.log(`pipeprobe ${now()} shader ${moduleCount} ${desc && desc.code ? desc.code.length : 0}`);
    return module;
  };
  const describe = (desc) => {
    const stages = [desc.vertex, desc.fragment, desc.compute].filter(Boolean).map((s) => modules.get(s.module) || '?');
    const depth = desc.depthStencil ? `z:${desc.depthStencil.depthCompare || '-'}${desc.depthStencil.depthWriteEnabled ? '+w' : ''}` : 'z:none';
    const target = desc.fragment && desc.fragment.targets && desc.fragment.targets[0];
    const blend = target && target.blend ? `b:${target.blend.color.srcFactor || ''}/${target.blend.color.dstFactor || ''}` : 'b:none';
    const cull = desc.primitive ? `c:${desc.primitive.cullMode || 'none'}/${desc.primitive.topology || ''}` : '';
    return `${stages.join(',')} ${desc.compute ? '' : `${depth} ${blend} ${cull}`}`.trim();
  };
  for (const [name, kind] of [['createRenderPipeline', 'render'], ['createComputePipeline', 'compute'],
    ['createRenderPipelineAsync', 'render async'], ['createComputePipelineAsync', 'compute async']]) {
    const original = proto[name];
    if (!original) continue;
    proto[name] = function (desc) {
      const start = performance.now();
      const result = original.call(this, desc);
      console.log(`pipeprobe ${now()} ${kind} ${(performance.now() - start).toFixed(1)} ${describe(desc)}`);
      return result;
    };
  }
  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...args) {
    const device = await requestDevice.apply(this, args);
    if (!origin) {
      origin = performance.now();
      const poll = () => {
        const start = performance.now();
        device.queue.onSubmittedWorkDone().then(() => {
          const ms = performance.now() - start;
          if (ms >= 200) console.log(`pipeprobe ${now()} roundtrip ${ms.toFixed(0)}`);
          setTimeout(poll, 50);
        }, () => {});
      };
      poll();
    }
    return device;
  };
}
