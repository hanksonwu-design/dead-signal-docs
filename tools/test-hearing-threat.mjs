import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTS, APPENDIX} from './screenplay-files.mjs';
import {READING_PLACEMENTS} from '../building/screenplay-marker-placement.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const story = act => read(`docs/${ACTS[act].path}`);
const spec = act => read(`docs/${ACTS[act].specPath}`);
const appendix = read(`docs/${APPENDIX}`);
const block = (text, id) => {
  const begin = `<!-- import:${id}:begin -->`, end = `<!-- import:${id}:end -->`;
  assert(text.includes(begin) && text.includes(end), id);
  return text.slice(text.indexOf(begin), text.indexOf(end));
};
const has = (text, ...terms) => terms.forEach(term => assert(text.includes(term), `Missing: ${term}`));
const contract = block(appendix, 's-0409-3');
const bindings = [
  [2, 'R11', 'R11-V02', 's-0905-45'],
  [3, 'R13', 'R13-V01', 's-0906-12'],
  [4, 'R18', 'R18-V02', 's-0907-4'],
  [4, 'R19', 'R19-V01', 's-0907-9'],
  [4, 'R20', 'R20-V03', 's-0907-19'],
  [5, 'R25', 'R25-V02', 's-0908-39'],
  [5, 'R26', 'R26-V02', 's-0908-47'],
  [6, 'U2b', 'U2b-V02', 's-0909-18'],
  [7, 'U5', 'U5-V02', 's-0909-39'],
  [9, 'R32', 'R32-V02', 's-0910-14'],
];

test('ten hearing scenes have canonical script beats, production layers and unchanged art IDs', () => {
  const flow = JSON.parse(read('scene-flow.json'));
  assert.equal(bindings.length, 10);
  for (const [act, node, image, beat] of bindings) {
    has(block(story(act), beat), '現場');
    has(story(act), `[${image}]`);
    has(spec(act), '#hearing-threat-contract');
    for (const term of ['波形', '字幕']) assert(flow.images[image].requirements.includes(term), `${image}: ${term}`);
    has(contract, node, image);
  }
  assert.equal(Object.keys(flow.images).length, 547);
  assert.equal(flow.subscenes.length, 72);
  const graph = JSON.parse(read('scene_graph.json'));
  assert.equal(graph.nodes.length, 48);
  assert.equal(graph.edges.length, 56);
  for (const edge of graph.edges) assert(!/hearing|waveform|聽覺帶/.test(JSON.stringify(edge)), edge.id);
});

test('hearing represents audible cues, not proximity, detection, microphone input or active electronics', () => {
  has(contract, '聲音靠近不代表已被發現', '不使用玩家麥克風', '使用者音量／靜音之前',
    '不逐影格自動放大底噪', '方向不明', '不顯示安全', '不是主角持有的偵測器',
    '字幕、聽覺帶不屬於 ACTIVE 關閉的電子 HUD', '單聲道', '低動態', '可單獨開關波形');
  has(block(appendix, 's-0702-7'), '#hearing-threat-contract', '使用者音量不改判定');
  has(block(appendix, 's-0703-6'), '#hearing-threat-contract', '無聲的現場聽覺帶');
});

test('retreat and authority cannot bypass travel, breath exhaustion or the remedy deadline', () => {
  has(contract, '2.2 秒判的是接受指令的時點', '不要求 2.8 秒路段瞬間走完',
    '部分掩體且屏息已耗盡', '續至上一完整掩體', '不重設呼吸量',
    '不接受新移動、反覆取消', '不前進至下一掩體', '首次被抓最多 3 秒', '後續 1 秒',
    'R18 尚未抵達 N1 時回 N0', '此補救不套到 UD');
  const technical = block(appendix, 's-0803-34');
  has(technical, 'RETREAT', '長按 2.5 秒確認', '完整掩體內', '後續縮為 1 秒');
  assert(!technical.includes('長按 2 秒確認'));
  assert(!technical.includes('補救窗使用權限反擊'));
  assert(!technical.includes('及時進掩體／停止移動'));
  has(block(story(4), 's-0907-5'), '後續縮為 1 秒', '尚未抵達便回入口');
  has(spec(4), '至少 3.2 秒門牌', '2.8 秒長段');
});

test('R20 distinguishes recorded sources, live sounds, protected reading and compact operation', () => {
  has(contract, 'R25 操作段', '設備時序而非錄音內事件正在發生', '現場帶與播放器分框分標題');
  has(block(story(4), 's-0907-19'), '標著「現場」', '來源播放器外', '錄音暫停不等於世界暫停');
  has(block(story(4), 's-0907-20'), '歷史聲軌', '來源日期', '完整閱讀開啟後，現場聽覺帶收起', '前兆從頭開始');
  has(spec(4), '不將播放器音量當成敵人距離', '完整聲軌閱讀／必要承諾台詞凍結巡行');
});

test('UD audio reuses voluntary, room-local controllers and ends before repair or water puzzles', () => {
  has(block(story(6), 's-0909-17'), '未主動轉輪不啟動襲擊');
  has(block(story(6), 's-0909-18'), '3.5 秒完整前兆', '0.6 秒掃擊', '六秒窗口', '1.5 秒', '已完成段保留');
  has(block(story(7), 's-0909-38'), '自行確認開始 UD-02');
  has(block(story(7), 's-0909-39'), '3.5 秒前兆', '重試時維持相同來向', '同側滑軌');
  has(contract, 'U1／U2 仍是', 'U3 修燈與 LM-03 保持安全', 'U4 回返、U4b 插銷不追逐',
    '過渡攀梯與 U6 水箱不帶追兵');
});

test('borrowed hearing cues preserve encounter-specific defenses and safe conclusions', () => {
  has(block(story(2), 's-0905-45'), '3 秒前兆', '完整 6 秒', '三個短峰');
  has(block(story(5), 's-0908-39'), '每輪播放 5 秒、安靜 3.8 秒', '錯過窗口或取消', '不扣罰');
  has(block(story(5), 's-0908-47'), '3.2 秒內退到對側', '3.2 秒內主動鬆柄');
  has(block(story(9), 's-0910-18'), '現場聽覺帶收起');
  has(spec(9), '聲音尚未發生時不提前畫出波峰', '假門不靠音量或字幕標出真假');
  for (const act of [0, 1, 8]) assert(!story(act).includes('現場聽覺帶'), ACTS[act].name);
});

test('model and screenplay expose the same existing encounters without reclassifying speaker timing as horror', () => {
  const markers = JSON.parse(read('building/scene-markers.json')).markers;
  const door = markers.find(m => m.id === 'R19-V01-horror');
  const speaker = markers.find(m => m.id === 'R25-V02-puzzle');
  assert(door && speaker);
  has(door.title, '關門屏息');
  has(speaker.title, '喇叭波形');
  has(READING_PLACEMENTS[door.id], '確認屏息後');
  assert(!markers.some(m => m.id === 'R25-V02-horror'));
  assert.deepEqual(markers.filter(m => m.category === 'boss').map(m => m.id), ['R26-V01-boss', 'R32-V01-boss']);
});

test('save, audio and presentation share encounter time while delivery remains an unimplemented game contract', () => {
  has(contract, '音效、波形與判定讀同一遭遇時鐘', '控制器中斷一同凍結', '不重播上一輪殘留波峰',
    'UI／音效包絡／同步測試工時需另估', '不能代替引擎內時序測試及玩家試玩');
  has(block(appendix, 's-uppertech-103'), '不另存威脅數值', '清除舊包絡', 'RETREAT');
  has(read('docs/08_製作管理/08-13_劇情節點與場景道具總表.md'), '#hearing-route-map', '#hearing-production-checks');
});

test('safe arrival saves coexist with patrol and do not save partial cover or mid-retreat', () => {
  const technical = block(appendix, 's-0803-34');
  const saving = block(appendix, 's-uppertech-103');
  has(technical, '敵人仍在巡行不妨礙完整掩體保存', '不由巡行每次換階段觸發',
    '警戒待處理、移動半途與部分掩體不建立新安全快照');
  assert(!technical.includes('不在敵人狀態循環中寫檔'));
  has(saving, '巡行繼續仍可保存，N2 不寫安全點', '安全快照與結果提交分開',
    '不能在載入時再執行副作用', '寫檔失敗沿共用保存錯誤提示處理');
});

test('focus recovery re-arms held inputs without granting time, progress or accidental submission', () => {
  const focus = block(appendix, 's-0703-5');
  has(focus, '仍停在恢復確認，不自動開始跑表', '確認輸入由選單消耗',
    '按住模式重新按下並維持', '切換模式重新確認維持',
    '不消耗也不回補屏息', '不推進長按或敵人計時',
    'R19 早放仍使本輪作廢', '單純真正暫停不重給完整前兆或補救窗');
});

test('override and caught side effects are committed once and are never replayed by loading', () => {
  const technical = block(appendix, 's-0803-34');
  has(technical, '開始及提交時都驗證', '已抹除或已結束的遭遇不再扣費',
    '一次成功交易同時保存', '取消、重複完成回呼與載入舊的操作畫面都不能再結算',
    '必要的舊鍵修復也不追加空白項目', 'failure_freeze_seen 依該輪受擊一次結算');
});

test('routine listening and actual suspicion have distinct readable poses', () => {
  has(contract, '`LISTENING` 是正常巡行側耳', '並不代表發現玩家',
    '只有暴露／操作失誤才進 `SUSPICIOUS`', '此刻才起 2.2 秒補救窗');
  has(block(story(4), 's-0907-5'), '忽然轉向剛才發聲的位置');
  const flow = JSON.parse(read('scene-flow.json'));
  has(flow.images['R18-V02'].requirements, '正常側耳／轉向發聲位置的警戒／退避');
});

test('narrative, production summary and work orders all retain the later R18 safe cover', () => {
  has(block(story(4), 's-0907-5'), '已到布簾後便回布簾後', '未到布簾但已到推車者');
  has(spec(4), '已到 N3 回布簾後', 'N2 不是失敗復位點');
  const flow = JSON.parse(read('scene-flow.json'));
  has(flow.images['R18-V02'].requirements, '失敗復位分 N0／N1／N3 已到達狀態', 'N4 為通過終態');
});

test('illustration captions distinguish old concepts from current silent patrol and recording layers', () => {
  const sequence = block(appendix, 's-0409-8');
  const illustration = block(appendix, 's-0409-11');
  has(sequence, '輪廓沿原巡行方向檢查，尚未發現玩家', '部分掩體須屏息', '只有失誤後的警戒');
  assert(!sequence.includes('威脅停留朝向掩體'));
  assert(!illustration.includes('拖拽聲'));
  has(illustration, 'V07 PNG 為舊構圖參考', 'R18 實際為 B 棟 37F');
  has(spec(4), '此 PNG 尚未重繪', '06 的三條波形是歷史來源播放器', '與新增現場聽覺帶分框');
});

test('signal 15 only pauses existing local targets in an allowed playback window', () => {
  const effect = appendix.split('\n').find(line => line.startsWith('| 對噤聲者 |'));
  has(effect, '該廣播可及範圍', '2 秒', '已退離或被抹除者不重生', '不影響別房');
  const use = appendix.split('\n').find(line => line.startsWith('| 用途 | 在原允許的設備播放窗口'));
  has(use, 'ACTIVE 內不啟動', '不作 2.2 秒補救解法', 'R26 必要歷史緩衝另依本房來源規格');
});

test('R18 partial cover never overwrites a safe respawn checkpoint', () => {
  const room = block(spec(4), 's-uppertech-73');
  const movement = room.split('\n').find(line => line.startsWith('| `R18_H04`'));
  has(movement, '到達完整掩體才更新安全復位點', 'N0／N1／N3');
  has(room, '已到 N2 但未到 N3 者回 N1', '不能成為失敗或讀檔後的安全復位點',
    '舊檔若誤記 N2', '缺乏紀錄則回 N0', '不用安全復位的跳轉代替退避');
  has(block(appendix, 's-0803-34'), '不能覆寫完整掩體的安全復位點');
});

test('breath data covers every authored partial cover without requiring whole-cycle breath holding', () => {
  const data = block(appendix, 's-0803-33');
  const row = data.split('\n').find(line => line.startsWith('| `breath_required`'));
  has(row, 'R18 的 N2', 'R19 門內操作位', 'R20 桌下', '側耳檢查階段', '完整掩體為 `false`');
  assert(!data.includes('只有 R19、R20 指定節點'));
  has(contract, '剩餘量不足以撐過恢復後該輪所需屏息時間');
});

test('remedy resumes the interrupted phase and freezes forward movement rather than skipping cues', () => {
  const technical = block(appendix, 's-0803-34');
  for (const phase of ['TELEGRAPH', 'CROSSING', 'LISTENING']) {
    const row = technical.split('\n').find(line => line.startsWith(`| ${phase} |`));
    assert(row, phase);
    has(row, `| ${phase} 剩餘時間 |`);
  }
  has(technical, '凍結尚未走完的前向位移', '當輪作廢，不沿走廊狀態機接續屏息');
  assert(!technical.includes('RETREAT → LISTENING'));
  has(contract, '保存被打斷的原階段與剩餘時間', '不跳過前兆或通過階段');
});

test('R18 arrival commits before the exit gate and R19 recovery uses its actual entry point', () => {
  const room = block(spec(4), 's-uppertech-73');
  const door = room.split('\n').find(line => line.startsWith('| `R18_H07`'));
  has(door, '抵達時同次保存', 'act4.r18.segment_cleared', '點門才換房');
  has(room, '不先要求 segment_cleared', '仍須逐段親自到 N4', '停在 N4 不自動換房');
  const beat = block(story(4), 's-0907-7');
  assert(beat.indexOf('段 A 完成') < beat.indexOf('玩家手動打開隔音室門'));
  has(block(spec(4), 's-uppertech-74'), '鏡位先落在門鉸後牆角並登記為已到達的安全復位點',
    '第一次失敗與退避都回這個實際到過的位置');
  has(block(story(4), 's-0907-9'), '玩家跨門後先停在門鉸後的牆角');
});

test('R19 separates closing, voluntary breathing and retries without an impossible fast-close penalty', () => {
  const room = block(spec(4), 's-uppertech-74');
  has(room, '長按 `CLOSE_SLOW` 2.4 秒', '門關妥、前兆至少 3.2 秒',
    '才起本輪 5.2 秒', '整輪通過才寫', '已抹除者在門合妥時',
    '僅在 door_closed_slowly 成立時寫入', '保留關門成果但不寫 breath_segment_cleared',
    '不要求再關已關妥的門', '前兆未完的屏息輸入不啟動本輪', '不把關門的持續按鍵沿用為屏息');
  const gate = room.split('\n').find(line => line.startsWith('| `must_exit_when`'));
  has(gate, 'door_closed_slowly', 'breath_segment_cleared', 'f2_collected');
  has(block(story(4), 's-0907-9'), '確認屏息後，影子停在門下 5.2 秒', '已關妥的門留在原位');
  assert(!/關(?:門)?太快/.test(story(4) + spec(4)));
});

test('R20 success and override settle the threat gate without completing unrelated puzzles', () => {
  const room = block(spec(4), 's-uppertech-75');
  has(room, '從未播 B／C、僅留 A 或完全靜音者也能通過',
    '成功抵達才寫 segment_cleared', '警戒或 RETREAT 取消本輪通過資格',
    'H06 抹除成功則原子保存 override_used 與 segment_cleared',
    '兩路都不代做聲軌、F3 或掌位憑證核驗',
    '關閉閱讀、B／C 重播、H-08 結束、離房及讀檔皆不重生',
    '舊檔若 override_used 已真而缺段 C 完成鍵');
  const gate = room.split('\n').find(line => line.startsWith('| `must_exit_when`'));
  has(gate, 'tracks_aligned', 'segment_cleared', 'f3_collected', 'palm_accepted');
  const override = room.split('\n').find(line => line.startsWith('| `R20_H06`'));
  has(override, 'act4.r20.override_used', 'act4.r20.segment_cleared');
  for (const id of ['s-0907-20', 's-0907-25']) has(block(story(4), id), '已通過或已抹除');
});

test('safe controller positions and partial covers are specified in the same existing images', () => {
  const room = block(spec(4), 's-uppertech-75');
  has(room, '由 R19 入房先到控制桌入口側實心擋板後', '登記為已到達的完整掩體',
    '前方桌下是只遮視線的屏息位', '在此等待不算通過段 C', '失敗回此已到達安全位');
  const flow = JSON.parse(read('scene-flow.json'));
  has(flow.images['R19-C07'].content, '牆角');
  has(flow.images['R20-C02'].requirements, 'V01 擋板定位');
  has(flow.images['R20-V03'].requirements, '入口側實心擋板安全位');
});

test('silence suppresses playback without cutting power or queuing a surprise attack', () => {
  has(contract, '`ACTIVE` 涵蓋 `TELEGRAPH`', '`CLEAR` 才恢復本地設備試聽',
    '電子聲受抑制不等於供電中斷', '不保存待補播佇列', '沒有額外播放電子吸氣');
  const audio = appendix.split('\n').find(line => line.includes('`SFX_R18_SPEAKER_INHALE`'));
  has(audio, '停用舊音槽', '不播吸氣音');
  assert(!spec(4).includes('擴音器發出一次吸氣'));
  has(block(appendix, 's-0803-34'), '兩種獨立可讀提示', '絕對靜默時改以不同視覺地標加文字提示');
});

test('reading, retreat and assistance do not reset progress or extend forced breathing beyond its budget', () => {
  has(contract, '原控制台的 `CLEAR` 操作窗口開啟，不要求已讀過',
    '已通過或已抹除後則依安全調查狀態隨時可開',
    '警戒、移動、退避或受擊中只保留真正暫停', '真正暫停與失焦則續接原剩餘時間',
    '凍結本輪敵人側耳及屏息消耗', '不回補已用屏息',
    '不把退避等待寫成成功躲過一輪', '依各房既有 `failure_freeze_seen` 判斷',
    '1.5×／2× 只延長前兆與補救', '不拉長 5.2 秒側耳');
  const technical = block(appendix, 's-0803-34');
  const safe = Number(technical.match(/標準安全持續 ([\d.]+) 秒/)[1]);
  const maximumListen = Number(technical.match(/LISTENING（停下側耳，[\d.]+–([\d.]+) 秒/)[1]);
  for (const multiplier of [1, 1.5, 2]) {
    // Reaction assistance scales decision windows, never the required breath duration.
    assert(safe - maximumListen >= 0.8 - Number.EPSILON, `reaction assistance ${multiplier}`);
  }
  const longMove = Number(contract.match(/長 ([\d.]+) 秒/)[1]);
  const minimumClear = longMove + 0.8;
  assert(minimumClear <= Number(technical.match(/CLEAR（安全移動窗，[\d.]+–([\d.]+) 秒/)[1]));
});
