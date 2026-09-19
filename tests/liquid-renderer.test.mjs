import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../dist/liquid-renderer.js', import.meta.url), 'utf8');
const { LiquidRenderer } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function harness(options = {}) {
  let next = 1;
  const calls = [], deleted = [], uniforms = {};
  const constants = ['ARRAY_BUFFER','STATIC_DRAW','FLOAT','VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE_2D','TEXTURE0','RGBA','UNSIGNED_BYTE','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','LINEAR','TEXTURE_WRAP_S','TEXTURE_WRAP_T','CLAMP_TO_EDGE','FRAMEBUFFER','COLOR_ATTACHMENT0','FRAMEBUFFER_COMPLETE','MAX_TEXTURE_SIZE','MAX_RENDERBUFFER_SIZE','MAX_VIEWPORT_DIMS','TRIANGLES','UNPACK_FLIP_Y_WEBGL','UNPACK_PREMULTIPLY_ALPHA_WEBGL','NO_ERROR'];
  const gl = Object.fromEntries(constants.map((key, i) => [key, i + 100]));
  Object.assign(gl, {
    getParameter: key => key === gl.MAX_VIEWPORT_DIMS ? [8192,8192] : 8192,
    getShaderParameter: () => !options.shaderFailure,
    getProgramParameter: () => !options.linkFailure,
    getShaderInfoLog: () => 'test shader failure', getProgramInfoLog: () => 'test link failure',
    getAttribLocation: () => 0, getUniformLocation: (_, key) => key,
    getError: () => gl.NO_ERROR,
    checkFramebufferStatus: () => options.fboFailure ? -1 : gl.FRAMEBUFFER_COMPLETE,
    uniform1f: (key, value) => { uniforms[key] = value; },
    uniform1i: (key, value) => { uniforms[key] = value; },
    uniform2f: (key, ...value) => { uniforms[key] = value; },
    uniform4f: (key, ...value) => { uniforms[key] = value; },
    uniform3fv: (key, value) => { uniforms[key] = [...value]; },
    drawArrays: () => calls.push({ ...uniforms }),
    texImage2D: (...args) => calls.push({ upload: args.length }),
  });
  for (const kind of ['Shader','Program','Buffer','Texture','Framebuffer']) {
    gl[`create${kind}`] = () => ({ kind, id: next++ });
    gl[`delete${kind}`] = item => { if (item) deleted.push(item); };
  }
  for (const name of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','activeTexture','bindTexture','texParameteri','bindFramebuffer','framebufferTexture2D','viewport','pixelStorei']) gl[name] = () => {};
  const canvas = { width: 1, height: 1, getContext: () => gl };
  return { gl, canvas, calls, deleted, renderer: () => new LiquidRenderer(canvas) };
}
const layer = (id = 'a') => ({ id, kind: 'paint', x: 1, y: 2, width: 2, height: 2, data: new Uint8Array(16).fill(128) });
const scene = layers => ({ fieldW: 8, fieldH: 8, layers });
function prepared(options) { const h = harness(options); h.r = h.renderer(); h.r.setImage({ width: 8, height: 8 }); return h; }
const draws = h => h.calls.filter(call => call.u_pass !== undefined && !call.upload);

test('ordered layers sample framebuffer with top-down conversion, final adjustment only once', () => {
  const h = prepared(); h.r.setScene(scene([layer('a'),layer('b')])); h.r.draw(8,8);
  const d = draws(h);
  assert.deepEqual(d.filter(c => c.u_pass !== 4).map(c => c.u_pass), [0,1,1,2]);
  assert.equal(d[0].u_sourceIsFbo, 0);
  assert.ok(d.slice(1).every(c => c.u_sourceIsFbo === 1));
  assert.deepEqual(d.find(c => c.u_pass === 1).u_rect, [.125,.25,.25,.25]);
  assert.deepEqual(d.find(c => c.u_pass === 1).u_fieldSize, [8,8]);
  h.r.dispose();
});

test('immutable bottom prefix survives top edits; setting changes invalidate it', () => {
  const h = prepared(), bottom = layer('bottom');
  h.r.setScene(scene([bottom,layer('top')])); h.r.draw(8,8);
  h.calls.length = 0;
  h.r.setScene(scene([bottom,layer('new top')])); h.r.draw(8,8);
  assert.deepEqual(draws(h).map(c => c.u_pass), [1,2]);
  h.calls.length = 0; h.r.draw(8,8,false,{ motionPhase: .4 });
  assert.equal(draws(h).filter(c => c.u_pass === 1).length, 2);
  assert.equal(draws(h)[0].u_pass, 0);
  h.r.dispose();
});

test('original bypasses glass, all layers, adjustments and framebuffer allocation', () => {
  const h = prepared(); h.r.setScene(scene([layer()])); h.calls.length = 0;
  h.r.draw(8,8,true,{brightness:99});
  assert.deepEqual(draws(h).map(c => c.u_pass), [3]);
  assert.equal(h.calls.filter(c => c.upload).length, 0);
  h.r.dispose();
});

test('UI-compatible normalized stroke parameters, DOM material fallback and legacy field', () => {
  const h = prepared();
  globalThis.document = {
    getElementById: id => id === 'strokeSoftness' ? { value: '85' } : null,
    querySelector: query => query.includes('data-glass-texture') ? { dataset: { glassTexture:'ripple' } } : { dataset:{glass:'blue'} },
  };
  try {
    h.r.setField(new Uint8Array(8*8*4),8,8); h.r.draw(8,8,false,{strokeThickness:120});
    const c = draws(h).find(c => c.u_pass === 1);
    assert.equal(c.u_strokeSoftness,.85); assert.equal(c.u_strokeThickness,1.2);
    assert.equal(c.u_glassTexture,2); assert.deepEqual(c.u_absorption,[1.05,.35,.025]);
  } finally { delete globalThis.document; h.r.dispose(); }
});

test('reject invalid fields and too-large output without silently downscaling', () => {
  const h = prepared();
  assert.throws(() => h.r.setField(new Uint8Array(3),8,8), /RGBA|数据/);
  assert.throws(() => h.r.setScene(scene([{...layer(),x:9}])), /范围|区域|rect/);
  assert.throws(() => h.r.draw(8192,8192), /内存|memory|预算/);
  assert.throws(() => h.r.draw(9000,8), /尺寸|size|上限/);
  h.r.dispose();
});

test('resize frees all previous targets; disposal is complete and idempotent', () => {
  const h = prepared(); h.r.setScene(scene([layer()])); h.r.draw(8,8);
  h.r.draw(16,16);
  assert.equal(h.deleted.filter(x => x.kind === 'Framebuffer').length,3);
  h.r.dispose(); const count = h.deleted.length; h.r.dispose();
  assert.equal(h.deleted.length,count);
  assert.equal(h.deleted.filter(x => x.kind === 'Framebuffer').length,6);
  assert.equal(h.deleted.filter(x => x.kind === 'Texture').length,8);
  assert.equal(h.deleted.filter(x => x.kind === 'Program').length,1);
  assert.equal(h.deleted.filter(x => x.kind === 'Buffer').length,1);
  assert.equal(h.deleted.filter(x => x.kind === 'Shader').length,2);
  assert.throws(() => h.r.draw(8,8), /释放|disposed/);
});

test('shader compilation, link and incomplete FBO failures are explicit and cleaned up', () => {
  for (const flag of ['shaderFailure','linkFailure']) {
    const h = harness({[flag]:true}); assert.throws(() => h.renderer(), /test.*failure/);
    assert.ok(h.deleted.some(item => item.kind === 'Shader'));
  }
  const h = prepared({fboFailure:true});
  assert.throws(() => h.r.draw(8,8), /framebuffer|帧缓冲/i); h.r.dispose();
});

test('shader makes empty height an exact pass-through before softness exponent', () => {
  assert.match(source, /rawH\s*<=\s*0\.0/);
  assert.doesNotMatch(source, /pow\(max\(rawH/);
  assert.match(source, /1\.0\s*-\s*uv\.y/);
});
