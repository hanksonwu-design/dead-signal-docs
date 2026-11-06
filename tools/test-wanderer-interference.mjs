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
  assert(appendix.includes('| 接近干擾（15 區共用） |'));
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

test('silencers are seeded in acts 1 and 2 with lighter omens, and only act 4 removes everything', () => {
  const contract = appendix.split('#### 上部遊蕩怨靈（UA）契約')[1]?.split('<a id="wanderer-interference"></a>')[0] || '';
  assert(contract.includes('| UA-A1d | 第一幕 | T-R5-R6-02 10F 送衣吊籃井 |'));
  assert(contract.includes('| UA-A2d | 第二幕 | R7 產線桌列 |'));
  assert(contract.includes('| 噤聲者早期版（UA-A1d、UA-A2d） |'));
  assert(contract.includes('感知照常可用，不算工具被剝奪'));
  assert(contract.includes('她在它經過時動了，它轉向她，恐慌 +1，本區只加這一次'));
  assert(contract.includes('照一般規則計一次高強度事件，與 UA-A2a 之間也要隔滿 10 分鐘'));
  for (const phrase of ['兩區不因 10 分鐘間隔被取消，只會延後', '間隔下限改為 5 分鐘', '阿尋遭遇計一次高強度事件', 'UA-A2c 不適用 10 分鐘間隔'])
    assert(contract.includes(phrase), phrase);
  assert(!contract.includes('共用同一次高強度事件，不另佔 10 分鐘配額、不適用延後；但要在 UA-A2a'), 'UA-A2d no longer shares UA-A2a');
  const ladder = contract.split('<a id="silencer-ladder"></a>')[1] || '';
  assert(ladder.includes('##### 噤聲者的五幕強度'));
  assert(ladder.includes('全作唯一完整的絕對靜默'));
  assert(ladder.includes('電子聲匯流排'));
  assert(ladder.includes('靜音模式沿用既有的視覺前兆與方向字幕'));
  assert(!appendix.includes('13 個遊蕩區') && !appendix.includes('13 區各'), 'zone counts updated to 15');
  const spec = name => readFileSync(path.join(ROOT, 'docs/10_製作規格', name), 'utf8');
  const act1 = spec('10-02_製作規格_第一幕.md');
  assert(act1.includes('**上部遊蕩怨靈 UA-A1d／吊籃井的遠影**'));
  assert(act1.includes('恐慌 +1，本區只加這一次'));
  assert(act1.includes('`wander.ua_a1d.panic_added`'));
  const act2 = spec('10-03_製作規格_第二幕.md');
  assert(act2.includes('**上部遊蕩怨靈 UA-A2d（噤聲者早期版，產線桌列的短追）：**'));
  assert(act2.includes('被抓一次本區即結束：恐慌 +1、本區上限 +1'));
  assert(act2.includes('踏上 T-R11-R12 離開第二幕時仍未開始，才記 `ended`'));
  assert(act2.includes('不對應排行榜上的任何一列，也不是 E-04'));
  assert(act2.includes('不做噤聲者全域靜默'), 'R6 cursor freeze stays a partial false alarm');
});
