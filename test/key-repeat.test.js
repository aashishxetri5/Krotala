import assert from 'node:assert/strict';
import test from 'node:test';
import { KeyRepeatFilter } from '../src/main/core/key-repeat.js';

const A = 30;

test('a press followed by a release is never a repeat', () => {
  const f = new KeyRepeatFilter();
  assert.equal(f.press(A, 0), false);
  f.release(A);
  assert.equal(f.press(A, 50), false);
});

test('auto-repeat while a key is held is flagged', () => {
  const f = new KeyRepeatFilter();
  assert.equal(f.press(A, 0), false);
  assert.equal(f.press(A, 500), true); // initial repeat delay
  assert.equal(f.press(A, 533), true); // repeat rate
  assert.equal(f.press(A, 566), true);
});

test('a key whose release was missed counts again after a silence', () => {
  const f = new KeyRepeatFilter();
  f.press(A, 0);
  // No keyup arrived (e.g. the lock screen swallowed it).
  assert.equal(f.press(A, 5000), false);
});

test('keys are tracked independently', () => {
  const f = new KeyRepeatFilter();
  f.press(A, 0);
  assert.equal(f.press(31, 10), false);
});
