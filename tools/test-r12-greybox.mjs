import assert from 'node:assert/strict';
import test from 'node:test';
import {start, act} from '../playtest-model.mjs';

const advance = (state, ...actions) => actions.reduce(act, state);
const prepared = () => advance(start('r12'), '觀察', '完整方形接頭');

test('R12 needs both authored circuits and a manual test; observation or a connector cannot complete it', () => {
  for (const connector of ['圓形接頭', '裂開方形接頭', '完整方形接頭']) {
    const state = advance(start('r12'), '觀察', connector, '合閘測試');
    assert.equal(state.done, false);
  }
  for (const actions of [
    ['門禁線接右座'], ['設備線接左座'],
    ['門禁線接左座', '設備線接右座'],
  ]) assert.equal(advance(prepared(), ...actions, '合閘測試').done, false);
  for (const order of [
    ['門禁線接右座', '設備線接左座'],
    ['設備線接左座', '門禁線接右座'],
  ]) {
    const wired = advance(prepared(), ...order);
    assert.equal(wired.done, false);
    const tested = act(wired, '合閘測試');
    assert.equal(tested.done, true);
    assert.match(tested.msg, /待權限核驗/);
    assert.match(tested.msg, /門仍未開/);
  }
});

test('R12 occupied sockets do not overwrite wires and wrong trials remain repairable without discarding the connector', () => {
  let state = advance(prepared(), '門禁線接左座', '設備線接左座');
  assert.deepEqual(state.wiring, {door:'left',equipment:''});
  state = advance(state, '設備線接右座', '合閘測試');
  assert.equal(state.done, false);
  assert.deepEqual(state.wiring, {door:'left',equipment:'right'});
  state = advance(state, '拆回門禁線', '拆回設備線', '門禁線接右座', '設備線接左座', '合閘測試');
  assert.equal(state.done, true);
  assert.equal(state.step, 2);
});

test('R12 reading again and rejected parts cannot alter a correctly connected circuit', () => {
  const wired = advance(prepared(), '門禁線接右座');
  const state = advance(wired, '觀察', '裂開方形接頭', '圓形接頭', '合閘測試');
  assert.deepEqual(state.wiring, {door:'right',equipment:''});
  assert.equal(state.step, 1);
  assert.equal(state.done, false);
  assert.equal(advance(state, '設備線接左座', '合閘測試').done, true);
});
