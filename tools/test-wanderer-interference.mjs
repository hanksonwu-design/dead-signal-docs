import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ROOT } from './sync-canonical.mjs';

const appendix = readFileSync(path.join(ROOT, 'docs/09_劇本/09-15_正式劇本_共用附錄.md'), 'utf8').replace(/\r\n/g, '\n');
const section = appendix.split('<a id="wanderer-interference"></a>')[1]?.split('<!-- import:')[0] || '';

test('wanderer proximity interference keeps its own visual and sound language', () => {
  assert(section.includes('##### 遊魂接近干擾'));
  for (const rule of ['暖色、偏紅的類比干擾', '不用冷青數位雜訊', '不用暗角與震動', '也不失焦', '不蓋過 UA-S 水泵的低頻嗡停節奏']) {
    assert(section.includes(rule), rule);
  }
});

test('silencers invert the interference and levels stay quantized', () => {
  assert.match(section, /\| UA-Q 與第四幕噤聲者 \| 反向：越近，原有的環境聲與訊號雜訊越被抽乾/);
  assert(section.includes('分四段，不做連續的距離表'));
  assert(section.includes('3 節點以上為 0'));
  assert(section.includes('另一項必須是該類型專屬的前兆'));
});

test('interference is safe, optional and adds no save keys', () => {
  assert(section.includes('每秒明暗變化不超過 3 次，不做全畫面閃白'));
  assert(section.includes('不新增存檔鍵'));
  assert(section.includes('下部 UD、對戰與 HA 不套用'));
  assert(appendix.includes('| 接近干擾強度 | 0／40／70／100%'));
  assert(appendix.includes('接近干擾 0／40／70／100%；已發現互動可見度'));
  assert(appendix.includes('| `wander_interference` |'));
  assert(appendix.includes('| 接近干擾（13 區共用） |'));
});
