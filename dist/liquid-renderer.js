// Immutable layer objects are the cache identity: replace a layer when its data changes.
export const GLASS_COLORS = Object.freeze({
  clear: [0, 0, 0], blue: [1.05, .35, .025], yellow: [.02, .15, 1.1],
  brown: [.23, .7, 1.28], red: [.04, 1.1, .95],
});
const DEFAULTS = Object.freeze({
  brightness: 0, contrast: 0, hue: 0, saturation: 0, temperature: 0,
  refraction: 75, gloss: 65, diffusion: 35, strokeIntensity: 100,
  strokeThickness: 100, strokeSoftness: 0, glassTint: 0, glassClarity: 100,
  glassReflection: 0, glassWarp: 35, motionPhase: 0, motionMode: 0,
});
// 24 MP originals still export at full size: three targets plus image stay under one GiB.
const MEMORY_BUDGET = 1024 * 1024 * 1024;
const VERTEX = `attribute vec2 a_position;
varying vec2 v_uv;
void main(){
  v_uv=vec2((a_position.x+1.0)*0.5,(1.0-a_position.y)*0.5);
  gl_Position=vec4(a_position,0.0,1.0);
}`;
const FRAGMENT = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_image; uniform sampler2D u_field;
uniform vec2 u_fieldSize; uniform vec2 u_imageSize;
uniform vec4 u_rect;
uniform float u_pass; uniform float u_sourceIsFbo;
uniform float u_motionPhase; uniform float u_motionMode;
uniform float u_brightness; uniform float u_contrast;
uniform float u_saturation; uniform float u_hue; uniform float u_temperature;
uniform float u_refraction; uniform float u_gloss; uniform float u_diffusion;
uniform float u_strokeIntensity; uniform float u_strokeThickness; uniform float u_strokeSoftness;
uniform vec3 u_absorption;
uniform float u_glassTint; uniform float u_glassClarity; uniform float u_glassReflection;
uniform float u_glassWarp; uniform float u_glassTexture;
// DOM image uploads use top-down UV. Render targets use GL's bottom-up texture UV.
vec3 rawPhoto(vec2 uv){
  uv=clamp(uv,vec2(0.0),vec2(1.0));
  if(u_sourceIsFbo>.5)uv.y=1.0-uv.y;
  vec4 p=texture2D(u_image,uv);return mix(vec3(1.0),p.rgb,p.a);
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 substrate(vec2 uv){
  vec2 aspect=vec2(u_imageSize.y/u_imageSize.x,1.0);vec2 q=uv;
  float ridge=0.0;float warp=u_glassWarp*0.01;
  if(u_glassTexture>0.5&&u_glassTexture<1.5){float phase=uv.x/aspect.x*115.0;ridge=cos(phase);q.x+=sin(phase)*0.018*aspect.x*warp;}
  else if(u_glassTexture>1.5){ridge=sin(uv.x/aspect.x*33.0+sin(uv.y*29.0))*cos(uv.y*22.0);q+=vec2(ridge,cos(uv.y*31.0+sin(uv.x*27.0)))*aspect*warp*0.014;}
  float frost=1.0-u_glassClarity*.01;vec3 c=rawPhoto(q);
  if(frost>.001){
    vec2 jitter=(vec2(hash(floor(uv*u_imageSize*.45)),hash(floor(uv.yx*u_imageSize.yx*.45)+7.0))-.5)*aspect*frost*.013;
    vec2 b=aspect*frost*.024;q+=jitter;c=rawPhoto(q)*.24;
    c+=rawPhoto(q+vec2(b.x,0.0))*.19+rawPhoto(q-vec2(b.x,0.0))*.19+rawPhoto(q+vec2(0.0,b.y))*.19+rawPhoto(q-vec2(0.0,b.y))*.19;
    c=mix(c,vec3(.86,.89,.87),frost*.17);
  }
  float depth=u_glassTint*.01*(1.0+abs(ridge)*warp*.4);
  c*=exp(-u_absorption*depth*1.6);
  float band=exp(-pow((uv.x+uv.y*.6-.36-sin(u_motionPhase)*.3*step(.5,u_motionMode))*7.0,2.0))*.15;
  float edge=pow(1.0-min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)),16.0)*.055;
  c+=(vec3(.96,.99,1.0)*band+vec3(edge)+vec3(max(ridge,0.0)*warp*.10))*u_glassReflection*.01;
  return c;
}
vec2 fieldUV(vec2 uv){
  float t=u_motionPhase;
  vec2 shift=u_motionMode<1.5?vec2(sin(t),sin(t)*.2):vec2(sin(t)*.2,sin(t));
  return uv+shift*.025*step(.5,u_motionMode)*(1.0-step(2.5,u_motionMode));
}
vec4 fieldAt(vec2 uv){
  vec2 local=(fieldUV(uv)-u_rect.xy)/u_rect.zw;
  if(local.x<0.0||local.y<0.0||local.x>=1.0||local.y>=1.0)return vec4(0.0,.5,.5,1.0);
  return texture2D(u_field,local);
}
float heightAt(vec2 uv){return fieldAt(uv).r;}
vec3 adjust(vec3 c){
  c+=u_brightness*0.006;
  c=(c-0.5)*(1.0+u_contrast*0.012)+0.5;
  vec3 axis=normalize(vec3(1.0));float angle=u_hue*0.0174532925;
  c=c*cos(angle)+cross(axis,c)*sin(angle)+axis*dot(axis,c)*(1.0-cos(angle));
  float lum=dot(c,vec3(0.2126,0.7152,0.0722));c=mix(vec3(lum),c,1.0+u_saturation*0.01);
  c+=vec3(0.0015,0.00025,-0.0015)*u_temperature;
  return clamp(c,0.0,1.0);
}
vec3 liquid(vec2 uv,vec3 color){
  vec4 field=fieldAt(uv);float rawH=field.r;
  // Do not apply an epsilon before pow: high softness must never fill empty pixels.
  if(rawH<=0.0)return color;
  float h=clamp(pow(rawH,mix(1.0,0.38,u_strokeSoftness))*u_strokeThickness,0.0,1.0);
  if(h<=0.001)return color;
  vec2 px=1.0/u_fieldSize;
  vec2 gradient=vec2(heightAt(uv+vec2(px.x,0.0))-heightAt(uv-vec2(px.x,0.0)),heightAt(uv+vec2(0.0,px.y))-heightAt(uv-vec2(0.0,px.y)));
  vec2 flow=field.gb*2.0-1.0;float flowLength=length(flow);
  vec2 direction=flowLength>0.02?flow/flowLength:vec2(0.7,0.7);
  vec2 aspect=vec2(u_imageSize.y/u_imageSize.x,1.0);
  float refract=u_refraction*0.01;float gloss=u_gloss*0.01;float diffusion=u_diffusion*0.01;
  vec2 offset=gradient*aspect*refract*(2.2+u_strokeThickness*1.8)+flow*aspect*h*refract*0.16;
  vec2 across=vec2(-direction.y,direction.x);
  float ridge=sin(dot(uv/aspect,across)*155.0+sin(uv.y*23.0)*0.7);
  float broadRidge=sin(dot(uv/aspect,across)*46.0+sin(uv.x*17.0)*0.9);
  offset+=across*aspect*(ridge*0.0025+broadRidge*0.005)*h*refract;
  offset=clamp(offset,vec2(-0.15),vec2(0.15));
  vec2 sampleUV=uv+offset;
  vec2 blur=direction*aspect*h*(0.002+diffusion*0.028+u_strokeThickness*0.018+u_strokeSoftness*0.07);
  vec3 glass=rawPhoto(sampleUV)*0.28;
  glass+=rawPhoto(sampleUV+blur)*0.16+rawPhoto(sampleUV-blur)*0.16;
  glass+=rawPhoto(sampleUV+blur*2.0)*0.11+rawPhoto(sampleUV-blur*2.0)*0.11;
  glass+=rawPhoto(sampleUV+blur*3.0)*0.09+rawPhoto(sampleUV-blur*3.0)*0.09;
  float edge=min(length(gradient)*24.0,1.0);
  glass.r=mix(glass.r,rawPhoto(sampleUV+offset*0.07).r,edge*0.68);
  glass.b=mix(glass.b,rawPhoto(sampleUV-offset*0.07).b,edge*0.68);
  vec3 normal=normalize(vec3(-gradient.x*22.0,-gradient.y*22.0,1.0));
  float light=dot(normal,normalize(vec3(-0.45+sin(u_motionPhase)*.65*step(.5,u_motionMode),-0.6+cos(u_motionPhase)*.35*step(.5,u_motionMode),0.8)));
  float shine=pow(max(light,0.0),18.0)*edge*gloss*1.6;
  float rim=pow(1.0-normal.z,1.3)*gloss*0.28;
  float shadow=max(dot(gradient,vec2(0.5,0.7)),0.0)*gloss*2.7;
  glass=glass*(1.0-shadow)+vec3(1.0,0.99,0.93)*(shine+rim);
  vec3 halo=rawPhoto(sampleUV+aspect*vec2(0.014,0.0))+rawPhoto(sampleUV-aspect*vec2(0.014,0.0))+rawPhoto(sampleUV+vec2(0.0,0.014))+rawPhoto(sampleUV-vec2(0.0,0.014));
  glass+=max(halo*0.25-0.55,vec3(0.0))*h*(diffusion+u_strokeSoftness)*0.85;
  float luminance=dot(glass,vec3(0.2126,0.7152,0.0722));
  float milky=u_strokeSoftness*0.34+h*0.10;
  glass=mix(glass,vec3(luminance)*0.82+glass*0.18,milky);
  glass+=vec3(0.96,0.98,0.94)*h*(0.025+u_strokeSoftness*0.09);
  float film=smoothstep(0.004,0.13,h)*clamp(u_strokeIntensity,0.0,1.5);
  return mix(color,glass,clamp(film,0.0,1.0));
}
void main(){
  vec3 color=rawPhoto(v_uv);
  if(u_pass<.5)color=substrate(v_uv);
  else if(u_pass<1.5)color=liquid(v_uv,color);
  else if(u_pass<2.5)color=adjust(color);
  // Pass 3: untouched original. Pass 4: exact prefix-cache copy.
  gl_FragColor=vec4(color,1.0);
}`;

// Motion values come only from overrides; the page has a same-named animation <select>.
const CODE_ONLY = new Set(['motionPhase', 'motionMode']);
function settings(overrides) {
  const doc = globalThis.document;
  const values = Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => {
    const fromDom = CODE_ONLY.has(key) ? undefined : doc?.getElementById(key)?.value;
    const value = Number(overrides[key] ?? fromDom ?? fallback);
    if (!Number.isFinite(value)) throw new Error(`无效渲染参数：${key}`);
    return [key, key.startsWith('stroke') ? value / 100 : value];
  }));
  const color = overrides.glassColor ?? doc?.querySelector('[data-glass].selected')?.dataset.glass ?? 'clear';
  const texture = overrides.glassTexture ?? doc?.querySelector('[data-glass-texture].selected')?.dataset.glassTexture ?? 'smooth';
  if (!Object.hasOwn(GLASS_COLORS, color)) throw new Error(`无效玻璃颜色：${color}`);
  const textureIndex = ['smooth', 'reeded', 'ripple'].indexOf(texture);
  if (textureIndex < 0) throw new Error(`无效玻璃纹理：${texture}`);
  return { ...values, absorption: GLASS_COLORS[color], glassTexture: textureIndex };
}

export class LiquidRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('当前浏览器不支持图形加速，请尝试新版 Chrome 或 Edge。');
    this.gl = gl;
    this.targets = [];
    this.scene = { fieldW: 1, fieldH: 1, layers: [] };
    this.cache = null;
    this.imageVersion = 0;
    this.disposed = false;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.maxRenderSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    this.maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    try { this.initialize(); } catch (error) { this.dispose(); throw error; }
  }

  initialize() {
    const gl = this.gl;
    this.program = this.createProgram();
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    if (!this.buffer) throw new Error('无法分配 WebGL 顶点缓冲。');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    const names = [...Object.keys(DEFAULTS), 'image', 'field', 'fieldSize', 'imageSize', 'rect', 'pass', 'sourceIsFbo', 'absorption', 'glassTexture'];
    this.locations = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(this.program, `u_${name}`)]));
    this.imageTexture = this.createTexture();
    this.fieldTexture = this.createTexture();
    // A complete neutral texture is needed even when a shader branch does not sample it.
    this.bindTexture(this.fieldTexture, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,128,128,255]));
    gl.uniform1i(this.locations.image, 0);
    gl.uniform1i(this.locations.field, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  createProgram() {
    const gl = this.gl, shaders = [];
    const program = gl.createProgram();
    if (!program) throw new Error('无法创建 WebGL 程序。');
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('无法创建 WebGL 着色器。');
        shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`着色器编译失败：${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`着色器链接失败：${gl.getProgramInfoLog(program)}`);
      return program;
    } catch (error) { gl.deleteProgram(program); throw error; }
    finally { shaders.forEach(shader => gl.deleteShader(shader)); }
  }

  createTexture() {
    const gl = this.gl, texture = gl.createTexture();
    if (!texture) throw new Error('无法分配 WebGL 纹理。');
    this.bindTexture(texture, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  bindTexture(texture, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  assertLive() {
    if (this.disposed) throw new Error('渲染器已经释放 (disposed)。');
    if (this.gl.isContextLost?.()) throw new Error('图形上下文已丢失，请重新加载图片后重试。');
  }

  checkSize(w, h, output = false) {
    const limit = output ? Math.min(this.maxTextureSize, this.maxRenderSize) : this.maxTextureSize;
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || w > limit || h > limit ||
        (output && (w > this.maxViewport[0] || h > this.maxViewport[1]))) {
      throw new Error(`图像尺寸 ${w}×${h} 无效或超过 GPU 尺寸上限 ${limit}；未缩小输出。`);
    }
  }

  checkMemory(w, h, imageW = this.width ?? 0, imageH = this.height ?? 0, scene = this.scene, targets = true) {
    const fieldPixels = scene.layers.reduce((max, layer) => Math.max(max, layer.width * layer.height), 1);
    // Three RGBA color targets, two conservative browser display buffers, image and reused field.
    const bytes = 4 * ((targets ? 5 : 2) * w * h + imageW * imageH + fieldPixels);
    if (bytes > MEMORY_BUDGET) throw new Error(`渲染预计需要 ${Math.ceil(bytes / 1048576)} MiB，超过 1024 MiB GPU 内存预算；请选择较小的输出尺寸。未自动降低导出分辨率。`);
  }

  checkError(operation) {
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) throw new Error(`${operation}失败 (WebGL ${error})；可能是 GPU 内存不足。`);
  }

  setImage(image) {
    this.assertLive();
    const w = image.naturalWidth || image.videoWidth || image.width;
    const h = image.naturalHeight || image.videoHeight || image.height;
    this.checkSize(w, h);
    this.checkMemory(this.targetW ?? 0, this.targetH ?? 0, w, h);
    const gl = this.gl;
    this.cache = null;
    this.bindTexture(this.imageTexture, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.checkError('上传图片');
    this.width = w; this.height = h; this.imageVersion += 1;
  }

  setField(data, w, h) {
    this.setScene({ fieldW: w, fieldH: h, layers: [{ id: 'legacy', kind: 'legacy', x: 0, y: 0, width: w, height: h, data }] });
  }

  setScene(doc) {
    this.assertLive();
    if (!doc || !Array.isArray(doc.layers)) throw new Error('液体场景必须包含图层数组。');
    this.checkSize(doc.fieldW, doc.fieldH);
    for (const layer of doc.layers) {
      if (!layer) throw new Error('无效液体图层。');
      this.checkSize(layer.width, layer.height);
      if (![layer.x, layer.y].every(Number.isSafeInteger) || layer.x < 0 || layer.y < 0 ||
          layer.x + layer.width > doc.fieldW || layer.y + layer.height > doc.fieldH) throw new Error('液体图层区域超出场景范围。');
      if (!(layer.data instanceof Uint8Array) || layer.data.length !== layer.width * layer.height * 4) throw new Error('液体图层数据必须是匹配区域尺寸的 RGBA8 Uint8Array。');
    }
    this.checkMemory(this.targetW ?? 0, this.targetH ?? 0, this.width, this.height, doc);
    // Keep references, never flatten, copy, or mutate the document's layers/data.
    this.scene = { fieldW: doc.fieldW, fieldH: doc.fieldH, layers: doc.layers.slice() };
  }

  releaseTargets() {
    for (const target of this.targets) {
      this.gl.deleteFramebuffer(target.framebuffer);
      this.gl.deleteTexture(target.texture);
    }
    this.targets = [];
    this.targetW = 0; this.targetH = 0; this.cache = null;
  }

  ensureTargets(w, h) {
    if (this.targetW === w && this.targetH === h) return;
    this.releaseTargets();
    const gl = this.gl;
    try {
      for (let i = 0; i < 3; i += 1) {
        const texture = this.createTexture();
        const framebuffer = gl.createFramebuffer();
        this.targets.push({ texture, framebuffer });
        if (!framebuffer) throw new Error('无法分配帧缓冲 framebuffer。');
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.checkError('分配颜色纹理');
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('帧缓冲 framebuffer 不完整，请降低输出尺寸或重试。');
      }
      this.targetW = w; this.targetH = h;
    } catch (error) { this.releaseTargets(); throw error; }
    finally { gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
  }

  applySettings(values) {
    const gl = this.gl;
    gl.useProgram(this.program);
    for (const [key, value] of Object.entries(values)) {
      if (key === 'absorption') gl.uniform3fv(this.locations[key], value);
      else gl.uniform1f(this.locations[key], value);
    }
    gl.uniform2f(this.locations.imageSize, this.width, this.height);
    gl.uniform2f(this.locations.fieldSize, this.scene.fieldW, this.scene.fieldH);
  }

  pass(mode, source, target, fbo = true) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    this.bindTexture(source, 0);
    gl.uniform1f(this.locations.pass, mode);
    gl.uniform1f(this.locations.sourceIsFbo, fbo ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.checkError('绘制液体图层');
  }

  uploadLayer(layer) {
    const gl = this.gl, { fieldW, fieldH } = this.scene;
    this.bindTexture(this.fieldTexture, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, layer.width, layer.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, layer.data);
    this.checkError('上传液体图层');
    gl.uniform4f(this.locations.rect, layer.x / fieldW, layer.y / fieldH, layer.width / fieldW, layer.height / fieldH);
  }

  cacheMatches(key, prefixLength) {
    return this.cache?.key === key && this.cache.layers.length <= prefixLength &&
      this.cache.layers.every((layer, index) => layer === this.scene.layers[index]);
  }

  compose(key) {
    const layers = this.scene.layers, prefixLength = Math.max(0, layers.length - 1);
    const cached = this.cacheMatches(key, prefixLength);
    let source = cached ? this.targets[2] : this.targets[0];
    let start = cached ? this.cache.layers.length : 0;
    if (!cached) { this.cache = null; this.pass(0, this.imageTexture, source, false); }
    if (start === prefixLength && !cached) this.savePrefix(key, source, prefixLength);
    for (let index = start; index < layers.length; index += 1) {
      const target = source === this.targets[0] ? this.targets[1] : this.targets[0];
      this.uploadLayer(layers[index]);
      this.pass(1, source.texture, target);
      source = target;
      if (index + 1 === prefixLength) this.savePrefix(key, source, prefixLength);
    }
    this.pass(2, source.texture, null);
  }

  savePrefix(key, source, length) {
    this.cache = null;
    this.pass(4, source.texture, this.targets[2]);
    this.cache = { key, layers: this.scene.layers.slice(0, length) };
  }

  draw(w, h, original = false, overrides = {}) {
    this.assertLive();
    if (!this.width || !this.height) throw new Error('请先通过 setImage 设置图片。');
    this.checkSize(w, h, true);
    this.checkMemory(w, h, this.width, this.height, this.scene, !original);
    // Even an original-only resize must release now-obsolete output allocations.
    if (this.targets.length && (this.targetW !== w || this.targetH !== h)) this.releaseTargets();
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.gl.useProgram(this.program);
    if (original) { this.pass(3, this.imageTexture, null, false); return; }
    const values = settings(overrides);
    this.ensureTargets(w, h);
    this.applySettings(values);
    const key = JSON.stringify([w, h, this.imageVersion, this.scene.fieldW, this.scene.fieldH, values]);
    try { this.compose(key); }
    catch (error) { this.cache = null; throw error; }
    finally { this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null); }
  }

  dispose() {
    if (this.disposed) return;
    this.releaseTargets();
    const gl = this.gl;
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    if (this.fieldTexture) gl.deleteTexture(this.fieldTexture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    this.scene = { fieldW: 1, fieldH: 1, layers: [] };
    this.disposed = true;
  }
}
