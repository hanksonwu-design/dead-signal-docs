import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { start, act } from '../playtest-model.mjs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const advance = (state, ...actions) => actions.reduce(act, state);
const chapter = name => read(`docs/09_劇本/${name}.md`);
const appendix = chapter('09-15_正式劇本_共用附錄');

test('R22 a confirmed route survives gesture mistakes without switching sides', () => {
  let state = advance(start('r22'), '觀察', '手勢路', '敲門框', '掌心下壓');
  assert.equal(state.step, 0, 'A mistaken gesture restarts only the gesture sequence');
  state = act(state, '手動路');
  assert.equal(state.route, '手勢路', 'A mistake must not undo the confirmed choice');
  state = advance(state, '敲門框', '敲門框', '掌心下壓', '掌心下壓');
  assert.equal(state.step, 4);
});

for (const [route, sequence] of [
  ['手勢路', ['敲門框', '敲門框', '掌心下壓', '掌心下壓']],
  ['手動路', ['解 A 扣', '拉 B 桿']],
]) {
  test(`R22 ${route} cannot replay the threshold by returning to the safe landing`, () => {
    let state = advance(start('r22'), '觀察', route, ...sequence, '走到安全踏台', '深層出口');
    assert.equal(state.step, 11);
    state = advance(state, '走到安全踏台', '深層出口');
    assert.equal(state.step, 11);
    assert(!state.msg.includes('這次，等我一起走。'), 'The one-shot voice must not replay');
    state = act(state, '跨門');
    assert.equal(state.done, true);
  });
}

test('UD-01 still requires a successful dodge before each wheel operation', () => {
  let state = advance(start('ud1'), '觀察', '開始前兆', '轉搖輪');
  assert.equal(state.step, 0);
  state = advance(state, '躲掩蔽', '推演攻擊');
  assert.equal(state.phase, '窗口');
  state = act(state, '轉搖輪');
  assert.equal(state.step, 1);
  state = advance(state, '開始前兆', '躲掩蔽', '推演攻擊', '轉搖輪');
  assert.equal(state.done, true);
});

for (const firstSide of ['左', '右']) {
  test(`UD-02 ${firstSide}-first uses a persistent latch, then an explicit new round`, () => {
    let state = { ...start('ud2'), side: firstSide };
    state = advance(state, '觀察', '開始前兆', `隔板擋${firstSide}`, '封住來向側');
    assert.equal(state.step, 0, 'Direction alone cannot submit a shutter');
    state = act(state, '推演攻擊');
    assert.equal(state.phase, '卡榫固定');
    for (let i = 0; i < 10; i++) state = advance(state, '躲掩蔽', '重新觀察', '推演攻擊');
    assert.equal(state.latched, true);
    assert.equal(state.step, 0, 'Waiting or examining does not seal a side');
    state = act(structuredClone(state), '封住來向側');
    assert.deepEqual(state.closed, [firstSide]);
    state = act(state, '開始前兆');
    assert.equal(state.phase, '安全', 'The divider must return to center first');
    state = act(state, '隔板回中位');
    assert.equal(state.phase, '安全', 'Returning to center must not start an attack');
    state = advance(state, '開始前兆', `隔板擋${state.side}`, '推演攻擊', '封住來向側');
    assert.equal(state.done, true);
    assert.equal(new Set(state.closed).size, 2);
    assert.equal(act(state, '開始前兆').done, true);
  });
}

test('UD-02 cover alone and releasing a latch cannot earn progress', () => {
  let state = advance(start('ud2'), '觀察', '開始前兆', '躲掩蔽', '推演攻擊', '封住來向側');
  assert.equal(state.step, 0);
  state = advance(state, '重新觀察', '開始前兆', '隔板擋左', '推演攻擊', '解除支撐', '封住來向側');
  assert.equal(state.latched, false);
  assert.equal(state.side, '左');
  assert.equal(state.step, 0);
});

test('UD-02 a second-side hit preserves the first side and requires reset', () => {
  let state = advance(start('ud2'), '觀察', '開始前兆', '隔板擋左', '推演攻擊', '封住來向側', '隔板回中位', '開始前兆', '隔板擋左', '推演攻擊');
  assert.equal(state.reset, true);
  state = advance(state, '封住來向側', '開始前兆');
  assert.deepEqual(state.closed, ['左']);
  assert.equal(state.reset, true);
  state = advance(state, '安全復位', '開始前兆', '隔板擋右', '推演攻擊', '封住來向側');
  assert.equal(state.done, true);
});

test('UD-02 changing to cover does not silently recenter a rotated divider', () => {
  let state = advance(start('ud2'), '觀察', '開始前兆', '隔板擋右');
  assert.equal(state.centered, false);
  state = advance(state, '躲掩蔽', '推演攻擊');
  assert.equal(state.phase, '安全');
  assert.equal(state.latched, false);
  state = advance(state, '封住來向側', '開始前兆');
  assert.equal(state.phase, '安全');
  assert.equal(state.step, 0);
  state = advance(state, '隔板回中位', '開始前兆', '隔板擋左', '推演攻擊');
  assert.equal(state.phase, '卡榫固定');
  assert.equal(state.centered, false);
});

const prototypeActions = {
  r12: ['觀察', '圓形接頭', '裂開方形接頭', '完整方形接頭', '接上回路'],
  r22: ['觀察', '手勢路', '手動路', '敲門框', '掌心下壓', '解 A 扣', '拉 B 桿', '走到安全踏台', '深層出口', '跨門'],
  u4: ['觀察', '繫布標', '穿過內門', '核對地標', '鬆外扣', '掀蓋至支撐位', '進入 U4b', '抽內銷'],
  ud1: ['觀察', '開始前兆', '躲掩蔽', '推演攻擊', '轉搖輪', '安全復位', '重新觀察'],
  ud2: ['觀察', '開始前兆', '隔板擋左', '隔板擋右', '躲掩蔽', '推演攻擊', '封住來向側', '解除支撐', '隔板回中位', '安全復位', '重新觀察'],
};

for (const [prototype, actions] of Object.entries(prototypeActions)) {
  test(`every reachable ${prototype} state preserves committed progress and has a completion path`, () => {
    // Messages and event timestamps do not affect playable state.
    const key = ({ msg, events, ...state }) => JSON.stringify(state);
    const initial = start(prototype);
    const states = new Map([[key(initial), initial]]);
    const pending = [initial];
    const parents = new Map();
    for (let i = 0; i < pending.length; i++) {
      const current = pending[i];
      for (const action of actions) {
        const next = act(current, action);
        if (current.done) assert.equal(next.done, true);
        if (prototype === 'r22') {
          if (current.route) assert.equal(next.route, current.route);
          if (current.step >= 10 || current.route === '手動路') assert(next.step >= current.step);
        } else assert(next.step >= current.step);
        if (prototype === 'ud2') {
          assert.equal(new Set(next.closed).size, next.closed.length);
          assert.equal(next.step, next.closed.length);
          assert.equal(next.done, next.closed.length === 2);
          assert(current.closed.every(side => next.closed.includes(side)));
          assert.notEqual(next.phase, '窗口');
          if (next.latched) {
            assert.equal(next.phase, '卡榫固定');
            assert.equal(next.centered, false);
            assert(!next.closed.includes(next.side));
          }
          if (next.step > current.step) {
            assert.equal(action, '封住來向側');
            assert.equal(current.latched, true);
          }
        }
        const id = key(next);
        if (!parents.has(id)) parents.set(id, new Set());
        parents.get(id).add(key(current));
        if (!states.has(id)) {
          assert(states.size < 500, 'The finite model unexpectedly grew');
          next.events = [];
          states.set(id, next);
          pending.push(next);
        }
      }
    }
    const completable = new Set([...states].filter(([, state]) => state.done).map(([id]) => id));
    const reverse = [...completable];
    for (let i = 0; i < reverse.length; i++) {
      for (const parent of parents.get(reverse[i]) ?? []) {
        if (!completable.has(parent)) { completable.add(parent); reverse.push(parent); }
      }
    }
    assert.equal(completable.size, states.size, 'A reachable state traps the player');
  });
}

test('Act 1 retains all five floors, optional closeups and a guarded return route', () => {
  const story = chapter('09-04_正式劇本_第一幕');
  const spec = read('docs/10_製作規格/10-02_製作規格_第一幕.md');
  for (let i = 1; i <= 5; i++) {
    assert(story.includes(`###### 次場景 T-R3-R5-0${i}`));
    assert(spec.includes(`route_local.t-r3-r5-0${i}.open`));
  }
  assert(story.includes('支架近看可自行查看'));
  assert(story.includes('沿舊地磚穿過半扇小門上樓'));
  assert(!story.includes('將扣環掛回牆鉤並扶正風管'));
  assert(spec.includes('五個次場景皆實際通過'));
  assert(spec.includes('不新增 R3→R5 直連邊'));
  assert(spec.includes('待處理事件停用'));
  assert(spec.includes('缺任何一項就保留逐圖行走'));
  assert(story.includes('`E1-03` 血字遺言'));
  assert(spec.includes('不補 E1-03 或 F1'));
  assert(story.includes('可免費拆線、重排或回看來源'));
  assert(!story.includes('正式三格錯配代價'));
});

test('fast returns validate the traveled path and retain arrival events', () => {
  assert(appendix.includes('不能只憑兩端到訪選用另一條未走過的支路'));
  assert(appendix.includes('沿途有待觸發的一次性事件時改用正常通行'));
  assert(appendix.includes('出發前及抵達前重驗通路'));
  assert(appendix.includes('抵達仍執行目的房入場與回訪差分'));
  assert(appendix.includes('與第一層揭露後才啟用的筆記安全中繼分開'));
});

test('R1 preserves an ordinary inspected reflection and binds its image to the TV', () => {
  const story = chapter('09-04_正式劇本_第一幕');
  const spec = read('docs/10_製作規格/10-02_製作規格_第一幕.md');
  assert(story.includes('晚 0.3 秒'));
  assert(!story.includes('螢幕上沒有倒影'));
  assert(!spec.includes('主動查看無倒影版'));
  const line = story.split('\n').find(line => line.includes('[R1-C06]'));
  assert(line.includes('若主動點電視查看'));
  assert(line.includes('動作已經同步'));
});

test('the seven-floor ascent retains traversal but gives 20F a quiet crossing', () => {
  const story = chapter('09-05_正式劇本_第二幕');
  const spec = read('docs/10_製作規格/10-03_製作規格_第二幕.md');
  for (let i = 1; i <= 7; i++) assert(story.includes(`###### 次場景 T-R11-R12-0${i}`));
  for (const text of [story, spec]) {
    assert(text.includes('沿已固定的折梯上到落腳臺，進入 21F'));
    assert(!text.includes('展開原地折梯，扣緊兩側固定扣'));
  }
  assert(spec.includes('該層 open 只在玩家親自通過出口時保存'));
  assert(spec.includes('近看選填'));
  const closeup = spec.split('\n').find(line => line.startsWith('| T-R11-R12-05-C01 |'));
  assert(closeup.includes('工位牌'));
  assert(closeup.includes('只交已固定初態與通行視角'));
  assert(!closeup.includes('機關初始／操作中／到位差分均須交付'));
  assert(story.includes('先放下橋板再扣住另一端'));
});

test('pacing estimates and route QA use the current revision scope', () => {
  assert(appendix.includes('| 二十一條含次場景通路 |'));
  assert(!appendix.includes('| 十段通路 |'));
  assert(appendix.includes('| 歸屬 | 重分層前主線分鐘 |'));
  assert(appendix.includes('主線時長尚未核定'));
  assert(!/全系列單結局主線預算\s*(?:\*\*)?395–558/.test(appendix));
});

test('R32 replaces the repeated sentence quiz without skipping evidence or revelations', () => {
  const story = chapter('09-10_正式劇本_終幕');
  assert(!story.includes('六句卡選三句'));
  assert(!story.includes('來源範圍已核對'));
  assert(story.includes('四個原件各自可查'));
  assert(story.includes('再確認一次：「讓我回來的，是她。」'));
  const beats = ['[R32-03]', '[R32-04]', '[R32-06]', '[R32-07]', '[R32-08]', '[R32-09]'];
  for (let i = 1; i < beats.length; i++) assert(story.indexOf(beats[i - 1]) < story.indexOf(beats[i]));
  assert(appendix.includes('四項齊備才由 sources 進 seal_verify'));
  assert(appendix.includes('seal_linked 不等於解封'));
  assert(appendix.includes('不由舊句卡旗標直接完成顯形'));
  assert(appendix.includes('projection_reveal_complete && seal_reveal_complete && defense_complete'));
  const spec = read('docs/10_製作規格/10-08_製作規格_終幕.md');
  assert(spec.includes('尚未顯形前只試走一次'));
  assert(!spec.includes('顯形完成後，在封鎖來源核對階段'));
  assert(spec.includes('四熱點全讀及 S6-01 已核對'));
  assert(spec.includes('四熱點及 S6-01 鎖舌紀錄全數核對後'));
  assert(!appendix.includes('雙揭露完成後開放關係行動'));
  assert(!appendix.includes('雙揭露完成才解鎖最後行動'));
  assert(appendix.includes('三拍防禦 → 停戰 → A–E 關係行動'));
  assert(appendix.includes('確認本房回返後才啟用 S6-03'));
  assert(appendix.includes('第一個未完成動作'));
});

test('Abiao conclusion retains coercion, his added restrictions and the protagonist order', () => {
  const conclusion = '他被逼進來，後來卻自己加上了延後釋放；而這張處置表上的命令是我下的，他仍在等我確認完成。';
  assert(chapter('09-08_正式劇本_第五幕').includes(conclusion));
  assert(read('docs/10_製作規格/10-06_製作規格_第五幕.md').includes(conclusion));
  assert(appendix.includes('不把 C-07 首次執行改成他的自行決定'));
});
