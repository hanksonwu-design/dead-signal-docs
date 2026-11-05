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

test('core gameplay pages explain upper wanderers and agree on catch panic', () => {
  const block = id => appendix.split(`<!-- import:${id}:begin -->`)[1]?.split(`<!-- import:${id}:end -->`)[0] || '';
  const hub = block('s-0407-5');
  assert(hub.includes('#### 環境應對：上部遊蕩怨靈'));
  for (const type of ['UA-S「拖鞋聲」', 'UA-R「點名的」', 'UA-Q「離區噤聲者」']) assert(hub.includes(type), type);
  assert(block('s-0407-11').includes('UA 區不是 HA，也不是 HP'));
  assert(block('s-0408-5').includes('**上部遊蕩區的喇叭**'));
  assert(block('s-0411-2').includes('**上部遊蕩區**'));
  assert(block('s-0406-19').includes('#### 上部遊蕩怨靈'));
  assert(appendix.includes('| 被噤聲者抓到 | +1 階（上部遊蕩怨靈同此，每區最多 +3） |'));
  assert(!appendix.includes('被噤聲者發現 | +2 階'));
  assert(!appendix.includes('R16 起權限反擊'), 'UA-R zones end before R16 unlocks erasure');
});

test('wanderer timing stays fair: masked steps judge by start and telegraphs always lead somewhere', () => {
  const contract = appendix.split('#### 上部遊蕩怨靈（UA）契約')[1]?.split('<a id="wanderer-interference"></a>')[0] || '';
  assert(contract.includes('**遮蔽聲以起步判定：**'));
  assert(contract.includes('遮蔽聲在時起步的那一步整步算被蓋過'));
  assert(contract.includes('每段嗡不短於 4.5 秒，容得下兩整步'));
  assert(contract.includes('間隔未滿時本區延後啟動：維持 `not_started`'));
  assert(contract.includes('凡出現前兆，後面都接得上真的追擊'));
  assert(!appendix.includes('只留 `ROAM` 與前兆'));
  const spec = name => readFileSync(path.join(ROOT, 'docs/10_製作規格', name), 'utf8');
  assert(spec('10-03_製作規格_第二幕.md').includes('初值嗡約 4.5–5 秒'));
  assert(spec('10-01_製作規格_序幕.md').includes('嗡聲最後約 1 秒泵聲降調、凝結水細顫放慢'));
  assert(!spec('10-05_製作規格_第四幕.md').includes('只留 ROAM 與前兆'));
});
