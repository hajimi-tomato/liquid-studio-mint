import {textureDeposit} from './brush-textures.js';
// Committed layers/arrays are read-only by contract. Only transaction-owned
// Float32 working storage is mutable; history and previews share old layers.
const MIN_SIZE = 2;
const MAX_SIZE = 640;
const MAX_LAYERS = 256;
const MAX_BYTES = 128 * 1024 * 1024;
const KINDS = new Set(['fusion', 'independent']);
// Squeeze paints an independent layer while shoving neighbouring layers aside.
const MODES = new Set(['fusion', 'independent', 'squeeze']);
const SQUEEZE_REACH = 1.35;
const TOOLS = new Set(['paint', 'erase', 'push']);
const ERASE_MODES = new Set(['top', 'all']);
const transactions = new WeakMap();
let nextId = 0;

function requireValue(condition, message) {
  if (!condition) throw new TypeError(message);
}
function dimensions(w, h) {
  for (const n of [w, h]) {
    requireValue(Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE,
      'Grid dimensions must be integers from 2 to 640');
  }
}
function identity(id, kind) {
  requireValue(typeof id === 'string' && id.length > 0 && id.length <= 1024, 'Invalid layer ID');
  requireValue(KINDS.has(kind), 'Invalid layer kind');
}
function newId(layers = []) {
  const used = new Set(layers.map(layer => layer.id));
  let id;
  do { id = `stroke-${++nextId}`; } while (used.has(id));
  return id;
}
function checkLayer(layer, w, h) {
  requireValue(layer && typeof layer === 'object', 'Invalid layer');
  identity(layer.id, layer.kind);
  for (const key of ['x', 'y', 'width', 'height']) {
    requireValue(Number.isInteger(layer[key]), 'Layer rectangle must contain integers');
  }
  requireValue(layer.x >= 0 && layer.y >= 0 && layer.width > 0 && layer.height > 0
    && layer.x + layer.width <= w && layer.y + layer.height <= h, 'Layer rectangle outside grid');
  requireValue(layer.data instanceof Uint8Array
    && layer.data.length === layer.width * layer.height * 4, 'Invalid layer byte array length');
}

export function validateDocument(doc) {
  requireValue(doc && typeof doc === 'object', 'Invalid document');
  dimensions(doc.fieldW, doc.fieldH);
  requireValue(Array.isArray(doc.layers) && doc.layers.length <= MAX_LAYERS, 'Layer limit is 256');
  const ids = new Set();
  let bytes = 0;
  for (const layer of doc.layers) {
    checkLayer(layer, doc.fieldW, doc.fieldH);
    requireValue(!ids.has(layer.id), 'Duplicate layer ID');
    ids.add(layer.id);
    bytes += layer.data.byteLength;
    requireValue(bytes <= MAX_BYTES, 'Document exceeds 128 MiB byte limit');
  }
  for (const layer of doc.layers) {
    for (let i = 3; i < layer.data.length; i += 4) {
      requireValue(layer.data[i] === 255, 'Layer alpha must be 255');
    }
  }
  return doc;
}

export function createDocument(w, h) {
  dimensions(w, h);
  return { fieldW: w, fieldH: h, layers: [] };
}

function cropBounds(bytes, w, h) {
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (bytes[(y * w + x) * 4] === 0) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < 0) return null;
  return { x: Math.max(0, left - 1), y: Math.max(0, top - 1),
    right: Math.min(w - 1, right + 1), bottom: Math.min(h - 1, bottom + 1) };
}

export function layerFromField(bytes, w, h, { id = newId(), kind = 'fusion' } = {}) {
  dimensions(w, h);
  identity(id, kind);
  requireValue(bytes instanceof Uint8Array && bytes.length === w * h * 4, 'Invalid field byte array');
  const bounds = cropBounds(bytes, w, h);
  if (!bounds) return null;
  const { x, y, right, bottom } = bounds;
  const width = right - x + 1, height = bottom - y + 1;
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const start = ((y + row) * w + x) * 4;
    data.set(bytes.subarray(start, start + width * 4), row * width * 4);
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { id, kind, x, y, width, height, data };
}

function neutralField(w, h) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i + 1] = 128; data[i + 2] = 128; data[i + 3] = 255;
  }
  return data;
}

export function expandLayer(layer, w, h) {
  dimensions(w, h);
  checkLayer(layer, w, h);
  const data = neutralField(w, h);
  for (let row = 0; row < layer.height; row++) {
    const start = row * layer.width * 4;
    data.set(layer.data.subarray(start, start + layer.width * 4),
      ((layer.y + row) * w + layer.x) * 4);
  }
  return data;
}

export function beginStroke(doc, options) {
  validateDocument(doc);
  requireValue(options && TOOLS.has(options.tool) && MODES.has(options.mode), 'Invalid stroke tool or mode');
  const eraseMode = options.eraseMode ?? 'top';
  requireValue(ERASE_MODES.has(eraseMode), 'Invalid erase mode');
  const handle = {};
  transactions.set(handle, { doc, tool: options.tool, mode: options.mode, eraseMode,
    targets: new Map(), dirty: false, cached: doc, closed: false });
  return handle;
}
function transaction(handle) {
  const tx = transactions.get(handle);
  requireValue(tx, 'Invalid stroke transaction');
  return tx;
}
function brushInput(input) {
  requireValue(input && typeof input === 'object', 'Invalid brush input');
  for (const key of ['x', 'y', 'dx', 'dy', 'r', 'amount', 'softness']) {
    requireValue(Number.isFinite(input[key]), `Brush ${key} must be finite`);
  }
  requireValue(input.r >= 0 && input.amount >= 0 && input.softness >= 0
    && input.softness <= 1, 'Invalid brush radius, amount or softness');
}
function brushBounds(input, w, h) {
  const cx = input.x * w, cy = input.y * h, r = input.r;
  return { cx, cy, left: Math.max(0, Math.floor(cx - r)),
    right: Math.min(w - 1, Math.ceil(cx + r)), top: Math.max(0, Math.floor(cy - r)),
    bottom: Math.min(h - 1, Math.ceil(cy + r)) };
}
function forBrush(bounds, r, visit) {
  const { cx, cy, left, right, top, bottom } = bounds;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const d = Math.hypot(x - cx, y - cy) / r;
    if (d < 1) visit(x, y, d);
  }
}
function heightAt(layer, x, y) {
  if (x < layer.x || y < layer.y || x >= layer.x + layer.width
    || y >= layer.y + layer.height) return 0;
  return layer.data[((y - layer.y) * layer.width + x - layer.x) * 4];
}
function hits(layer, bounds, r) {
  let hit = false;
  forBrush(bounds, r, (x, y) => { if (heightAt(layer, x, y) > 0) hit = true; });
  return hit;
}
function openTarget(tx, index) {
  if (tx.targets.has(index)) return;
  const { layers, fieldW, fieldH } = tx.doc, layer = layers[index];
  tx.targets.set(index, { work: workingCopy(layer, fieldW, fieldH),
    id: layer?.id ?? newId(layers), kind: layer?.kind ?? (tx.mode === 'fusion' ? 'fusion' : 'independent') });
}
// Paint writes one layer; erase locks the first hit layer (top) or gathers every hit layer (all);
// push moves every layer it touches so stacked strokes travel together.
function selectTargets(tx, bounds, r) {
  const { layers } = tx.doc;
  if (tx.tool === 'paint') {
    if (tx.mode === 'squeeze') return selectSqueezeTargets(tx, bounds, r);
    if (tx.targets.size) return true;
    const top = layers.length - 1;
    const index = tx.mode === 'fusion' && layers[top]?.kind === 'fusion' ? top : layers.length;
    requireValue(index < MAX_LAYERS, 'Layer limit is 256');
    openTarget(tx, index);
    return true;
  }
  if (tx.tool === 'erase' && tx.eraseMode === 'top') {
    if (tx.targets.size) return true;
    for (let i = layers.length - 1; i >= 0; i--) {
      if (hits(layers[i], bounds, r)) { openTarget(tx, i); return true; }
    }
    return false;
  }
  for (let i = 0; i < layers.length; i++) if (hits(layers[i], bounds, r)) openTarget(tx, i);
  return tx.targets.size > 0;
}
// Squeeze owns a fresh top layer and adopts every neighbour within reach as it goes.
function selectSqueezeTargets(tx, bounds, r) {
  const { layers, fieldW, fieldH } = tx.doc;
  if (tx.newIndex === undefined) {
    tx.newIndex = layers.length;
    requireValue(tx.newIndex < MAX_LAYERS, 'Layer limit is 256');
    openTarget(tx, tx.newIndex);
  }
  const reach = brushBounds({ x: bounds.cx / fieldW, y: bounds.cy / fieldH, r: r * SQUEEZE_REACH }, fieldW, fieldH);
  for (let i = 0; i < layers.length; i++) if (hits(layers[i], reach, r * SQUEEZE_REACH)) openTarget(tx, i);
  return true;
}
function workingCopy(layer, w, h) {
  const work = new Float32Array(w * h * 3);
  if (!layer) return work;
  for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) {
    const source = (y * layer.width + x) * 4;
    const dest = ((y + layer.y) * w + x + layer.x) * 3;
    const height = layer.data[source] / 255;
    // Empty pixels carry no flow: the neutral byte 128 does not decode to exactly zero.
    work[dest] = height;
    work[dest + 1] = height > 0 ? layer.data[source + 1] / 127.5 - 1 : 0;
    work[dest + 2] = height > 0 ? layer.data[source + 2] / 127.5 - 1 : 0;
  }
  return work;
}
function writePixel(work, index, values) {
  const height = Math.fround(values[0]);
  let changed = work[index] !== height;
  work[index] = height;
  for (let c = 1; c < 3; c++) {
    const value = height > 0 ? Math.fround(values[c]) : 0;
    if (work[index + c] !== value) { work[index + c] = value; changed = true; }
  }
  return changed;
}
function stamp(tx, work, input, bounds, block = null) {
  const w = tx.doc.fieldW, h = tx.doc.fieldH;
  const dx = input.dx * w, dy = input.dy * h, len = Math.hypot(dx, dy);
  const fx = len > .00001 ? dx / len : .7, fy = len > .00001 ? dy / len : .7;
  let changed = false;
  forBrush(bounds, input.r, (x, y, d) => {
    const edge = Math.max(0, Math.min(1, (1 - d) / (.25 + input.softness * .75)));
    const fall = edge * edge * (3 - 2 * edge), i = (y * w + x) * 3;
    const old = work[i];
    if (tx.tool === 'erase') {
      const value = old * Math.max(0, 1 - fall * input.amount * 2.1);
      changed = writePixel(work, i, [value < .002 ? 0 : value, work[i + 1], work[i + 2]]) || changed;
    } else {
      const grain = 1 + .07 * Math.sin((x * -fy + y * fx) * .28);
      const room = block ? Math.max(0, 1 - block(i) * 1.6) : 1;
      changed = writePixel(work, i, [Math.min(.97, old + fall * input.amount * textureDeposit(input.texture,x/w,y/h) * grain * room * (1 - old * .45)),
        work[i + 1] * (1 - fall * .35) + fx * fall * .35,
        work[i + 2] * (1 - fall * .35) + fy * fall * .35]) || changed;
    }
  });
  return changed;
}
function regionCopy(work, bounds, w, h) {
  const left = Math.max(0, bounds.left - 2), top = Math.max(0, bounds.top - 2);
  const right = Math.min(w - 1, bounds.right + 2), bottom = Math.min(h - 1, bounds.bottom + 2);
  const width = right - left + 1, height = bottom - top + 1, data = new Float32Array(width * height * 3);
  for (let row = 0; row < height; row++) {
    const start = ((top + row) * w + left) * 3;
    data.set(work.subarray(start, start + width * 3), row * width * 3);
  }
  return { left, top, width, height, data };
}
// Shove a neighbour's liquid radially away from the dab and thin out its core, per dab.
function squeezeAway(tx, work, input, bounds) {
  const w = tx.doc.fieldW, h = tx.doc.fieldH, reach = input.r * SQUEEZE_REACH;
  const wide = brushBounds({ x: input.x, y: input.y, r: reach }, w, h);
  const local = regionCopy(work, wide, w, h);
  let changed = false;
  forBrush(wide, reach, (x, y, d) => {
    const ox = x - wide.cx, oy = y - wide.cy, len = Math.hypot(ox, oy) || 1;
    const shift = (1 - d) * (1 - d) * reach * .16 * Math.min(1, input.amount / .12);
    const sx = x - ox / len * shift, sy = y - oy / len * shift;
    const values = [0, 1, 2].map(c => sampleLocal(local, sx, sy, c));
    const core = Math.max(0, 1 - d / .75);
    values[0] *= 1 - core * core * .45;
    if (values[0] < .002) values[0] = 0;
    changed = writePixel(work, (y * w + x) * 3, values) || changed;
  });
  return changed;
}
function squeezePaint(tx, input, bounds) {
  let changed = false;
  const others = [...tx.targets].filter(([index]) => index !== tx.newIndex).map(([, target]) => target.work);
  for (const work of others) changed = squeezeAway(tx, work, input, bounds) || changed;
  const block = i => others.reduce((max, work) => Math.max(max, work[i]), 0);
  return stamp(tx, tx.targets.get(tx.newIndex).work, input, bounds, block) || changed;
}
function sourcePoint(x, y, d, input, w, h) {
  const f = (1 - d * d) ** 2;
  return [x - input.dx * w * f * .9, y - input.dy * h * f * .9];
}
function localSnapshot(work, input, bounds, w, h) {
  let left = w, right = -1, top = h, bottom = -1;
  forBrush(bounds, input.r, (x, y, d) => {
    const [sx, sy] = sourcePoint(x, y, d, input, w, h);
    if (sx <= -1 || sy <= -1 || sx >= w || sy >= h) return;
    left = Math.min(left, Math.max(0, Math.floor(sx)));
    top = Math.min(top, Math.max(0, Math.floor(sy)));
    right = Math.max(right, Math.min(w - 1, Math.floor(sx) + 1));
    bottom = Math.max(bottom, Math.min(h - 1, Math.floor(sy) + 1));
  });
  const width = Math.max(0, right - left + 1), height = Math.max(0, bottom - top + 1);
  const data = new Float32Array(width * height * 3);
  for (let row = 0; row < height; row++) {
    const start = ((top + row) * w + left) * 3;
    data.set(work.subarray(start, start + width * 3), row * width * 3);
  }
  return { left, top, width, height, data };
}
function sampleLocal(local, x, y, channel) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const at = (px, py) => {
    const xx = px - local.left, yy = py - local.top;
    return xx < 0 || yy < 0 || xx >= local.width || yy >= local.height
      ? 0 : local.data[(yy * local.width + xx) * 3 + channel];
  };
  return at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy)
    + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
}
function push(tx, work, input, bounds) {
  const w = tx.doc.fieldW, h = tx.doc.fieldH, local = localSnapshot(work, input, bounds, w, h);
  let changed = false;
  forBrush(bounds, input.r, (x, y, d) => {
    const [sx, sy] = sourcePoint(x, y, d, input, w, h);
    const values = [0, 1, 2].map(c => sampleLocal(local, sx, sy, c));
    changed = writePixel(work, (y * w + x) * 3, values) || changed;
  });
  return changed;
}

export function paintStroke(handle, input) {
  const tx = transaction(handle);
  requireValue(!tx.closed, 'Stroke transaction has finished');
  brushInput(input);
  if (input.r === 0 || (tx.tool !== 'push' && input.amount === 0)
    || (tx.tool === 'push' && input.dx === 0 && input.dy === 0)) return false;
  const bounds = brushBounds(input, tx.doc.fieldW, tx.doc.fieldH);
  let hasPixels = false;
  forBrush(bounds, input.r, () => { hasPixels = true; });
  if (!hasPixels || !selectTargets(tx, bounds, input.r)) return false;
  let changed = false;
  if (tx.tool === 'paint' && tx.mode === 'squeeze') changed = squeezePaint(tx, input, bounds);
  else for (const target of tx.targets.values()) {
    const result = tx.tool === 'push' ? push(tx, target.work, input, bounds) : stamp(tx, target.work, input, bounds);
    changed = result || changed;
  }
  if (changed) tx.dirty = true;
  return changed;
}

function packTarget(tx, target) {
  const { fieldW: w, fieldH: h } = tx.doc, work = target.work;
  const bytes = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    bytes[i * 4] = Math.round(Math.min(1, work[i * 3]) * 255);
    bytes[i * 4 + 1] = Math.round((work[i * 3 + 1] * .5 + .5) * 255);
    bytes[i * 4 + 2] = Math.round((work[i * 3 + 2] * .5 + .5) * 255);
    bytes[i * 4 + 3] = 255;
  }
  return layerFromField(bytes, w, h, { id: target.id, kind: target.kind });
}
function sameLayer(a, b) {
  if (!a || !b) return !a && !b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
    && a.data.every((value, i) => value === b.data[i]);
}

export function previewStroke(handle) {
  const tx = transaction(handle);
  if (!tx.dirty) return tx.cached;
  const { layers: old } = tx.doc;
  const replacements = new Map([...tx.targets].map(([index, target]) => [index, packTarget(tx, target)]));
  const unchanged = [...replacements].every(([index, layer]) => sameLayer(old[index], layer));
  if (unchanged) tx.cached = tx.doc;
  else {
    const layers = old.flatMap((layer, i) => {
      if (!replacements.has(i)) return [layer];
      const next = replacements.get(i);
      return next ? [next] : [];
    });
    const appended = replacements.get(old.length);
    if (appended) layers.push(appended);
    tx.cached = validateDocument({ ...tx.doc, layers });
  }
  tx.dirty = false;
  return tx.cached;
}

export function finishStroke(handle) {
  const tx = transaction(handle);
  const result = previewStroke(handle);
  tx.closed = true;
  tx.targets = new Map();
  return result;
}

export function documentFromState(state, w, h) {
  dimensions(w, h);
  requireValue(state && typeof state === 'object', 'Invalid document state');
  const fieldW = state.fieldW ?? w, fieldH = state.fieldH ?? h;
  let doc;
  if (Object.hasOwn(state, 'layers')) doc = { fieldW, fieldH, layers: state.layers };
  else {
    const layer = layerFromField(state.field, fieldW, fieldH);
    doc = { fieldW, fieldH, layers: layer ? [layer] : [] };
  }
  validateDocument(doc);
  return resampleDocument(doc, w, h);
}

function resampleLayer(layer, oldW, oldH, w, h) {
  const source = expandLayer(layer, oldW, oldH), bytes = neutralField(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x / (w - 1) * (oldW - 1), sy = y / (h - 1) * (oldH - 1);
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    const x1 = Math.min(oldW - 1, x0 + 1), y1 = Math.min(oldH - 1, y0 + 1);
    const fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 3; c++) {
      bytes[(y * w + x) * 4 + c] = Math.round(
        source[(y0 * oldW + x0) * 4 + c] * (1 - fx) * (1 - fy)
        + source[(y0 * oldW + x1) * 4 + c] * fx * (1 - fy)
        + source[(y1 * oldW + x0) * 4 + c] * (1 - fx) * fy
        + source[(y1 * oldW + x1) * 4 + c] * fx * fy);
    }
  }
  return layerFromField(bytes, w, h, { id: layer.id, kind: layer.kind });
}

export function resampleDocument(doc, newW, newH) {
  validateDocument(doc);
  dimensions(newW, newH);
  if (newW === doc.fieldW && newH === doc.fieldH) return doc;
  const layers = doc.layers.map(layer => resampleLayer(layer, doc.fieldW, doc.fieldH, newW, newH)).filter(Boolean);
  return validateDocument({ fieldW: newW, fieldH: newH, layers });
}
