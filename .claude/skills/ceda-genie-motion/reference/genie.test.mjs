// Run: node --test genie.test.mjs   (or port to Vitest: same assertions)
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadMatrix, applyMatrix, genieRows, funnelEdge, genieOutline, GENIE } from './genie.js';

const close = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

test('quadMatrix: identity when the quad is the rectangle', () => {
  const m = quadMatrix(200, 100, [[0, 0], [200, 0], [200, 100], [0, 100]]);
  assert.deepEqual(m.map((v) => Math.round(v * 1e6) / 1e6), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

test('quadMatrix: corners land on a random trapezoid', () => {
  for (let i = 0; i < 200; i++) {
    const w = 50 + Math.random() * 500, h = 5 + Math.random() * 40;
    const y0 = Math.random() * 500, y1 = y0 + h * (0.2 + Math.random());
    const l0 = Math.random() * 300, r0 = l0 + 20 + Math.random() * 400;
    const l1 = l0 + (Math.random() - 0.5) * 80, r1 = r0 + (Math.random() - 0.5) * 80;
    const q = [[l0, y0], [r0, y0], [r1, y1], [l1, y1]];
    const m = quadMatrix(w, h, q);
    const got = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => applyMatrix(m, x, y));
    got.forEach((p, k) => { assert.ok(close(p[0], q[k][0]) && close(p[1], q[k][1]), `corner ${k}`); });
  }
});

test('quadMatrix: refuses a collapsed quad instead of returning NaN', () => {
  const m = quadMatrix(10, 10, [[0, 0], [0, 0], [0, 0], [0, 0]]);
  assert.ok(m === null || m.every(Number.isFinite));
});

const panel = { x: 400, y: 100, width: 520, height: 420 };
const button = { x: 600, y: 700, width: 120, height: 36 };

test('funnelEdge points at the trigger from every side', () => {
  assert.equal(funnelEdge(panel, button), 'bottom');
  assert.equal(funnelEdge(panel, { x: 600, y: 10, width: 80, height: 30 }), 'top');
  assert.equal(funnelEdge(panel, { x: 1100, y: 280, width: 40, height: 40 }), 'right');
  assert.equal(funnelEdge(panel, { x: 50, y: 280, width: 40, height: 40 }), 'left');
  assert.equal(funnelEdge(panel, { x: 640, y: 290, width: 40, height: 40 }), 'none');
});

test('at f = 0 the rows are exactly the panel', () => {
  const rows = genieRows(0, panel, button, 'bottom', 40);
  assert.ok(close(rows[0].a, panel.y) && close(rows[40].a, panel.y + panel.height));
  for (const r of rows) { assert.ok(close(r.c0, panel.x) && close(r.c1, panel.x + panel.width)); }
});

test('at f = 1 everything is inside the trigger', () => {
  const rows = genieRows(1, panel, button, 'bottom', 40);
  for (const r of rows) {
    assert.ok(r.a >= button.y - 0.5 && r.a <= button.y + button.height + 0.5);
    assert.ok(r.c0 >= button.x - 0.5 && r.c1 <= button.x + button.width + 0.5);
  }
});

test('the sides are curves, not straight lines (mid-slide)', () => {
  const rows = genieRows(0.45, panel, button, 'bottom', 60);
  // Straight line between first and last row, compare with the middle row.
  const a = rows[0], b = rows[60], m = rows[30];
  const t = (m.a - a.a) / (b.a - a.a);
  const straight = a.c0 + (b.c0 - a.c0) * t;
  assert.ok(Math.abs(m.c0 - straight) > 4, 'left side should bow away from a straight line');
  // And smooth: second differences small everywhere.
  for (let k = 1; k < 60; k++) {
    const dd = rows[k + 1].c0 - 2 * rows[k].c0 + rows[k - 1].c0;
    assert.ok(Math.abs(dd) < 3, `kink at row ${k}`);
  }
});

test('translate starts before slide ends (overlap makes it fluid)', () => {
  assert.ok(GENIE.translateStart < GENIE.slideEnd);
  const before = genieRows(GENIE.translateStart - 0.01, panel, button, 'bottom', 10)[0].a;
  const after = genieRows(GENIE.slideEnd - 0.01, panel, button, 'bottom', 10)[0].a;
  assert.ok(close(before, panel.y, 0.01));
  assert.ok(after > panel.y + 0.5);
});

test('outline is closed and finite', () => {
  const o = genieOutline(0.5, panel, button);
  assert.ok(o.length > 10 && o.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
});
