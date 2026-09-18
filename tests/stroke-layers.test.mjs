import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument, layerFromField, expandLayer, beginStroke, paintStroke,
  previewStroke, finishStroke, documentFromState, resampleDocument,
  validateDocument,
} from '../dist/stroke-layers.js';

function field(w = 16, h = w, pixels = []) {
  const bytes = new Uint8Array(w * h * 4);
  for (let i = 0; i < bytes.length; i += 4) bytes.set([0, 128, 128, 255], i);
  for (const [x, y, height, fx = 128, fy = 128] of pixels) {
    bytes.set([height, fx, fy, 255], (y * w + x) * 4);
  }
  return bytes;
}
function layer(id, pixels, kind = 'independent', w = 16, h = w) {
  return layerFromField(field(w, h, pixels), w, h, { id, kind });
}
function docOf(...layers) { return { fieldW: 16, fieldH: 16, layers }; }
function dab(overrides = {}) {
  return { x: .5, y: .5, dx: 0, dy: 0, r: 3, amount: .17, softness: .65, ...overrides };
}
function paint(doc, mode = 'fusion', overrides = {}) {
  const tx = beginStroke(doc, { tool: 'paint', mode });
  paintStroke(tx, dab(overrides));
  return finishStroke(tx);
}
function height(doc, x, y, index = 0) {
  return expandLayer(doc.layers[index], doc.fieldW, doc.fieldH)[(y * doc.fieldW + x) * 4];
}

// Capability and regression fixtures are defined before the implementation.
test('empty document and dimension boundary validation', () => {
  assert.deepEqual(createDocument(2, 640), { fieldW: 2, fieldH: 640, layers: [] });
  for (const n of [undefined, null, '', 1, 641, 2.5, NaN, Infinity]) {
    assert.throws(() => createDocument(n, 16));
    assert.throws(() => createDocument(16, n));
  }
});

test('crop uses height only, adds clipped one-pixel padding, preserves RGB', () => {
  const bytes = field(8, 6, [[3, 2, 150, 12, 240]]);
  bytes[1] = 255;
  const cropped = layerFromField(bytes, 8, 6, { id: '墨迹-特殊字符-\'😀' });
  assert.deepEqual({ ...cropped, data: undefined }, {
    id: '墨迹-特殊字符-\'😀', kind: 'fusion', x: 2, y: 1, width: 3, height: 3, data: undefined,
  });
  assert.deepEqual([...cropped.data.slice(16, 20)], [150, 12, 240, 255]);
  assert.notEqual(cropped.data.buffer, bytes.buffer);
  const expanded = expandLayer(cropped, 8, 6);
  assert.deepEqual([...expanded.slice(0, 4)], [0, 128, 128, 255]);
  assert.deepEqual([...expanded.slice((2 * 8 + 3) * 4, (2 * 8 + 3) * 4 + 4)], [150, 12, 240, 255]);
  assert.equal(layerFromField(field(8, 6), 8, 6), null);
  const edge = layerFromField(field(8, 6, [[0, 0, 1], [7, 5, 255]]), 8, 6);
  assert.deepEqual([edge.x, edge.y, edge.width, edge.height], [0, 0, 8, 6]);
});

test('field and layer boundary inputs are rejected', () => {
  for (const bytes of [null, undefined, [], new Uint8Array(3), new Float32Array(16)]) {
    assert.throws(() => layerFromField(bytes, 2, 2));
  }
  assert.throws(() => layerFromField(field(2), 2, 2, { kind: 'unknown' }));
  assert.throws(() => layerFromField(field(2), 2, 2, { id: '' }));
  assert.throws(() => expandLayer(null, 2, 2));
  const bytes = field(2, 2, [[1, 1, 3]]);
  bytes[3] = 0;
  const normalized = layerFromField(bytes, 2, 2);
  assert.ok(normalized.data.every((v, i) => i % 4 !== 3 || v === 255));
});

test('fusion reuses only the top fusion, independent starts one layer per gesture', () => {
  const original = createDocument(16, 16);
  const a = paint(original);
  const b = paint(a);
  assert.equal(a.layers.length, 1);
  assert.equal(b.layers.length, 1);
  assert.equal(a.layers[0].id, b.layers[0].id);
  assert.ok(height(b, 8, 8) > height(a, 8, 8));
  const c = paint(b, 'independent');
  assert.equal(c.layers.length, 2);
  assert.equal(c.layers[0], b.layers[0]);
  const d = paint(c);
  assert.equal(d.layers.length, 3);
  assert.equal(d.layers[0], c.layers[0]);
  assert.equal(d.layers[1], c.layers[1]);
  assert.equal(d.layers[2].kind, 'fusion');
  assert.equal(new Set(d.layers.map(l => l.id)).size, 3);
  assert.equal(original.layers.length, 0);
});

test('self overlap, cached immutable previews, repeatable finish and closed transaction', () => {
  const original = createDocument(16, 16);
  const tx = beginStroke(original, { tool: 'paint', mode: 'independent' });
  assert.equal(previewStroke(tx), original);
  assert.equal(paintStroke(tx, dab()), true);
  const preview = previewStroke(tx);
  const saved = preview.layers[0].data.slice();
  assert.equal(previewStroke(tx), preview);
  assert.equal(paintStroke(tx, dab()), true);
  const result = finishStroke(tx);
  assert.equal(result.layers.length, 1);
  assert.ok(height(result, 8, 8) > height(preview, 8, 8));
  assert.deepEqual(preview.layers[0].data, saved);
  assert.equal(previewStroke(tx), result);
  assert.equal(finishStroke(tx), result);
  assert.throws(() => paintStroke(tx, dab()));
});

test('no-op gestures preserve original document identity, including quantized changes', () => {
  const original = paint(createDocument(16, 16));
  for (const tool of ['paint', 'erase', 'push']) {
    const tx = beginStroke(original, { tool, mode: 'fusion' });
    assert.equal(paintStroke(tx, dab({ x: -2, y: -2 })), false);
    assert.equal(paintStroke(tx, dab({ r: 0 })), false);
    assert.equal(finishStroke(tx), original);
  }
  const zero = beginStroke(original, { tool: 'paint', mode: 'fusion' });
  assert.equal(paintStroke(zero, dab({ amount: 0 })), false);
  assert.equal(finishStroke(zero), original);
  const tiny = beginStroke(createDocument(16, 16), { tool: 'paint', mode: 'independent' });
  const base = previewStroke(tiny);
  paintStroke(tiny, dab({ amount: 1e-12 }));
  assert.equal(finishStroke(tiny), base);
  const push = beginStroke(original, { tool: 'push', mode: 'fusion' });
  assert.equal(paintStroke(push, dab()), false);
  assert.equal(finishStroke(push), original);
});

test('erase selects topmost radius hit rather than center or lower visible layer', () => {
  const lower = layer('lower', [[8, 8, 200], [10, 8, 200]]);
  const upper = layer('upper', [[10, 8, 180]]);
  const doc = docOf(lower, upper);
  const tx = beginStroke(doc, { tool: 'erase', mode: 'fusion' });
  assert.equal(paintStroke(tx, dab()), true);
  const out = finishStroke(tx);
  assert.equal(out.layers[0], lower);
  assert.ok(height(out, 10, 8, 1) < 180);
  assert.equal(height(doc, 10, 8, 1), 180);
});

test('erase locks for entire gesture even after emptying; blank starts can later lock', () => {
  const lower = layer('bottom', [[8, 8, 200]]);
  const upper = layer('top', [[8, 8, 100]]);
  const doc = docOf(lower, upper);
  const tx = beginStroke(doc, { tool: 'erase', mode: 'independent' });
  assert.equal(paintStroke(tx, dab({ x: 0, y: 0, r: 1 })), false);
  assert.equal(paintStroke(tx, dab({ amount: 1 })), true);
  assert.deepEqual(previewStroke(tx).layers, [lower]);
  assert.equal(paintStroke(tx, dab({ amount: 1 })), false);
  assert.deepEqual(finishStroke(tx).layers, [lower]);
  assert.equal(height(doc, 8, 8, 0), 200);
});

test('erase mode "all" thins every hit layer while "top" stays the default', () => {
  const lower = layer('bottom', [[8, 8, 200]]);
  const upper = layer('top', [[8, 8, 100]]);
  const doc = docOf(lower, upper);
  const all = beginStroke(doc, { tool: 'erase', mode: 'independent', eraseMode: 'all' });
  assert.equal(paintStroke(all, dab({ amount: .1 })), true);
  const out = finishStroke(all);
  assert.equal(out.layers.length, 2);
  assert.ok(height(out, 8, 8, 0) < 200);
  assert.ok(height(out, 8, 8, 1) < 100);
  const top = beginStroke(doc, { tool: 'erase', mode: 'independent' });
  paintStroke(top, dab({ amount: .1 }));
  assert.equal(finishStroke(top).layers[0], lower);
  assert.throws(() => beginStroke(doc, { tool: 'erase', mode: 'fusion', eraseMode: 'some' }));
});

test('squeeze paints a new layer, shoves neighbours outward and leaves far layers shared', () => {
  const w = 64, h = 64;
  const near = layerFromField(field(w, h, [[36, 32, 220], [37, 32, 220]]), w, h, { id: 'near', kind: 'independent' });
  const far = layerFromField(field(w, h, [[4, 4, 200]]), w, h, { id: 'far', kind: 'independent' });
  const doc = { fieldW: w, fieldH: h, layers: [near, far] };
  const tx = beginStroke(doc, { tool: 'paint', mode: 'squeeze' });
  for (let i = 0; i < 6; i++) paintStroke(tx, dab({ x: .5, y: .5, r: 6, amount: .17 }));
  const out = finishStroke(tx);
  assert.equal(out.layers.length, 3);
  assert.equal(out.layers[1], far);
  assert.equal(out.layers[2].kind, 'independent');
  assert.ok(height(out, 32, 32, 2) > 0);
  const before = height(doc, 36, 32, 0), after = height(out, 36, 32, 0);
  assert.ok(after < before, `neighbour core should thin: ${after} < ${before}`);
  assert.equal(height(doc, 36, 32, 0), 220);
  assert.throws(() => beginStroke(doc, { tool: 'paint', mode: 'bubble' }));
});

test('push moves every layer under the brush and leaves untouched layers shared', () => {
  const lower = layer('lower', [[8, 8, 200]]);
  const upper = layer('upper', [[8, 8, 180]]);
  const aside = layer('aside', [[2, 2, 150]]);
  const doc = docOf(lower, upper, aside);
  const tx = beginStroke(doc, { tool: 'push', mode: 'fusion' });
  assert.equal(paintStroke(tx, dab({ x: 0, y: 0, dx: .05, r: 1 })), false);
  assert.equal(paintStroke(tx, dab({ dx: 1, r: 1 })), true);
  const out = finishStroke(tx);
  assert.deepEqual(out.layers.map(l => l.id), ['aside']);
  assert.equal(out.layers[0], aside);
  assert.equal(height(doc, 8, 8, 0), 200);
  assert.equal(height(doc, 8, 8, 1), 180);
  const gentle = beginStroke(doc, { tool: 'push', mode: 'independent' });
  paintStroke(gentle, dab({ dx: .05, r: 2 }));
  const moved = finishStroke(gentle);
  assert.equal(moved.layers.length, 3);
  assert.equal(moved.layers[2], aside);
  assert.notEqual(moved.layers[0], lower);
  assert.notEqual(moved.layers[1], upper);
});

test('stamp matches legacy pressure, softness, grain and anisotropic flow math', () => {
  const w = 32, h = 16;
  const doc = paint(createDocument(w, h), 'independent', { dx: .1, dy: .1, softness: .2 });
  const bytes = expandLayer(doc.layers[0], w, h);
  const len = Math.hypot(.1 * w, .1 * h), fx = .1 * w / len, fy = .1 * h / len;
  for (const [x, y] of [[16, 8], [17, 9], [18, 8], [19, 8]]) {
    const d = Math.hypot(x - 16, y - 8) / 3;
    const edge = Math.max(0, Math.min(1, (1 - d) / (.25 + .2 * .75)));
    const fall = edge * edge * (3 - 2 * edge);
    const grain = 1 + .07 * Math.sin((x * -fy + y * fx) * .28);
    const i = (y * w + x) * 4;
    assert.equal(bytes[i], Math.round(Math.fround(fall * .17 * grain) * 255));
    assert.equal(bytes[i + 1], Math.round((Math.fround(fx * fall * .35) * .5 + .5) * 255));
    assert.equal(bytes[i + 2], Math.round((Math.fround(fy * fall * .35) * .5 + .5) * 255));
  }
});

test('push matches local bilinear advection with zero outside the field', () => {
  const bytes = field(16, 16, [[0, 0, 200, 255, 0], [1, 0, 80, 64, 192], [0, 1, 120]]);
  const original = docOf(layerFromField(bytes, 16, 16, { id: 'edge', kind: 'fusion' }));
  const tx = beginStroke(original, { tool: 'push', mode: 'fusion' });
  paintStroke(tx, dab({ x: 0, y: 0, dx: .025, dy: .0125, r: 3 }));
  const result = finishStroke(tx);
  assert.equal(height(result, 0, 0), Math.round(Math.fround((200 / 255) * (1 - .36) * (1 - .18)) * 255));
  assert.equal(height(original, 0, 0), 200);
  const right = docOf(layer('right', [[15, 15, 200]], 'fusion'));
  const other = beginStroke(right, { tool: 'push', mode: 'fusion' });
  paintStroke(other, dab({ x: 15 / 16, y: 15 / 16, dx: -.025, dy: -.0125, r: 3 }));
  assert.equal(height(finishStroke(other), 15, 15), height(result, 0, 0));
});

test('push snapshots only local sampled pixels, not the whole work field', () => {
  const w = 128, h = 128;
  const original = { fieldW: w, fieldH: h, layers: [layer('local', [[64, 64, 180]], 'fusion', w, h)] };
  const tx = beginStroke(original, { tool: 'push', mode: 'fusion' });
  // First dab initializes the one allowed target work field.
  paintStroke(tx, dab({ dx: .001, r: 4 }));
  const NativeFloat32Array = globalThis.Float32Array;
  const allocations = [];
  globalThis.Float32Array = new Proxy(NativeFloat32Array, {
    construct(Target, args) {
      const result = Reflect.construct(Target, args);
      allocations.push(result.length);
      return result;
    },
  });
  try { paintStroke(tx, dab({ dx: .001, r: 4 })); }
  finally { globalThis.Float32Array = NativeFloat32Array; }
  assert.ok(allocations.length > 0);
  assert.ok(allocations.every(n => n < w * h), `unexpected full-field allocation: ${allocations}`);
  assert.equal(finishStroke(tx).layers.length, 1);
});

test('concurrent transactions branch from immutable shared history', async () => {
  const base = paint(createDocument(16, 16));
  const snapshot = structuredClone(base);
  const a = beginStroke(base, { tool: 'paint', mode: 'independent' });
  const b = beginStroke(base, { tool: 'erase', mode: 'fusion' });
  const [left, right] = await Promise.all([
    Promise.resolve().then(() => { paintStroke(a, dab()); return finishStroke(a); }),
    Promise.resolve().then(() => { paintStroke(b, dab()); return finishStroke(b); }),
  ]);
  assert.deepEqual(base, snapshot);
  assert.equal(left.layers[0], base.layers[0]);
  assert.equal(left.layers.length, 2);
  assert.equal(right.layers.length, 1);
  assert.ok(height(right, 8, 8) < height(base, 8, 8));
});

test('state imports legacy bytes and new layer arrays without a version gate', () => {
  const old = field(16, 16, [[8, 8, 111]]);
  const legacy = documentFromState({ field: old }, 16, 16);
  assert.equal(legacy.layers[0].kind, 'fusion');
  assert.equal(height(legacy, 8, 8), 111);
  assert.notEqual(legacy.layers[0].data.buffer, old.buffer);
  const modern = documentFromState({ layers: legacy.layers, fieldW: 16, fieldH: 16 }, 16, 16);
  assert.equal(modern.layers[0], legacy.layers[0]);
  assert.deepEqual(documentFromState({ layers: [] }, 16, 16), createDocument(16, 16));
  assert.deepEqual(documentFromState({ field: field(16) }, 16, 16), createDocument(16, 16));
  assert.equal(documentFromState({ field: old, fieldW: 16, fieldH: 16 }, 32, 32).fieldW, 32);
  assert.equal(documentFromState({ layers: legacy.layers, fieldW: 16, fieldH: 16 }, 8, 8).fieldW, 8);
  for (const state of [null, undefined, {}, { field: [] }, { layers: 'bad' }]) {
    assert.throws(() => documentFromState(state, 16, 16));
  }
});

test('resampling is per layer, preserves IDs/order, and matches endpoint bilinear mapping', () => {
  const a = layerFromField(field(2, 2, [[0, 0, 255]]), 2, 2, { id: 'a' });
  const b = layerFromField(field(2, 2, [[1, 1, 128]]), 2, 2, { id: 'b', kind: 'independent' });
  const original = { fieldW: 2, fieldH: 2, layers: [a, b] };
  assert.equal(resampleDocument(original, 2, 2), original);
  const result = resampleDocument(original, 3, 3);
  assert.deepEqual(result.layers.map(l => [l.id, l.kind]), [['a', 'fusion'], ['b', 'independent']]);
  assert.equal(height(result, 1, 1, 0), 64);
  assert.equal(height(result, 1, 1, 1), 32);
  assert.equal(height(original, 0, 0), 255);
  assert.deepEqual(resampleDocument(createDocument(2, 2), 640, 640).layers, []);
  assert.throws(() => resampleDocument(original, 1, 3));
});

test('strict document validation: shape, rect, IDs, kinds, bytes, layer and memory limits', () => {
  const valid = docOf(layer('id', [[8, 8, 100]]));
  assert.equal(validateDocument(valid), valid);
  const invalid = [null, undefined, {}, { ...valid, layers: null },
    { ...valid, fieldW: 641 }, { ...valid, fieldH: 1 },
    { ...valid, layers: [valid.layers[0], valid.layers[0]] },
    { ...valid, layers: Array.from({ length: 257 }, (_, i) => ({ ...valid.layers[0], id: String(i) })) },
  ];
  for (const changes of [{ id: '' }, { id: 12 }, { kind: 'bad' }, { x: -1 }, { y: -1 },
    { x: .5 }, { y: 16 }, { width: 0 }, { height: 0 }, { width: 100 },
    { data: [] }, { data: new Uint8Array(1) }]) {
    invalid.push({ ...valid, layers: [{ ...valid.layers[0], ...changes }] });
  }
  const badAlpha = valid.layers[0].data.slice();
  badAlpha[3] = 0;
  invalid.push({ ...valid, layers: [{ ...valid.layers[0], data: badAlpha }] });
  for (const doc of invalid) assert.throws(() => validateDocument(doc));
  const full = layerFromField(field(640, 640, [[0, 0, 1], [639, 639, 1]]), 640, 640);
  const huge = { fieldW: 640, fieldH: 640, layers: Array.from({ length: 82 }, (_, i) => ({ ...full, id: `big-${i}` })) };
  assert.throws(() => validateDocument(huge), /byte|memory|128|内存/i);
  const maximum = { ...valid, layers: Array.from({ length: 256 }, (_, i) => ({ ...valid.layers[0], id: `max-${i}` })) };
  assert.equal(validateDocument(maximum), maximum);
  const tx = beginStroke(maximum, { tool: 'paint', mode: 'independent' });
  assert.throws(() => paintStroke(tx, dab()), /layer|256|图层/i);
});

test('transaction inputs reject malformed enums, values and invalid handles', () => {
  const doc = createDocument(16, 16);
  for (const options of [undefined, null, {}, { tool: 'fill', mode: 'fusion' }, { tool: 'paint', mode: 'bad' }]) {
    assert.throws(() => beginStroke(doc, options));
  }
  for (const operation of [previewStroke, finishStroke]) assert.throws(() => operation({}));
  assert.throws(() => paintStroke({}, dab()));
  const tx = beginStroke(doc, { tool: 'paint', mode: 'fusion' });
  for (const key of ['x', 'y', 'dx', 'dy', 'r', 'amount', 'softness']) {
    for (const value of [NaN, Infinity, null, '1', undefined]) {
      assert.throws(() => paintStroke(tx, dab({ [key]: value })));
    }
  }
  for (const invalid of [null, undefined, dab({ r: -1 }), dab({ amount: -1 }), dab({ softness: -1 }), dab({ softness: 1.1 })]) {
    assert.throws(() => paintStroke(tx, invalid));
  }
});

test('large-grid integration: import, independent self-overlap, erase, resize and restore', () => {
  const w = 128, h = 96;
  const legacy = documentFromState({ field: field(w, h, [[32, 32, 100]]) }, w, h);
  const before = legacy.layers[0].data.slice();
  const tx = beginStroke(legacy, { tool: 'paint', mode: 'independent' });
  for (let i = 0; i < 60; i++) paintStroke(tx, dab({ x: .4 + i / 600, y: .5, dx: .01, r: 12 }));
  const painted = finishStroke(tx);
  assert.equal(painted.layers.length, 2);
  assert.deepEqual(legacy.layers[0].data, before);
  const erased = beginStroke(painted, { tool: 'erase', mode: 'independent' });
  paintStroke(erased, dab({ r: 10, amount: .4 }));
  const resized = resampleDocument(finishStroke(erased), 256, 192);
  const restored = documentFromState(resized, 256, 192);
  assert.equal(validateDocument(restored), restored);
  assert.deepEqual(restored.layers.map(l => l.id), painted.layers.map(l => l.id));
  assert.equal(restored.layers[0], resized.layers[0]);
});
