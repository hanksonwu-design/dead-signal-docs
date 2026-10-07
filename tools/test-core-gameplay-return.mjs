import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const story = act => read(`docs/${ACTS[act].path}`);
const spec = act => read(`docs/${ACTS[act].specPath}`);
const appendix = read(`docs/${APPENDIX}`);
const includes = (text, phrases) => {
  for (const phrase of phrases) assert(text.includes(phrase), `Missing contract: ${phrase}`);
};

test('R27 physical comparison keeps the original chains and a local-only fallback', () => {
  includes(story(6), ['牌上的原編號與價目', '沒有親見片段時', '本地來源摘錄同樣能逐項核對']);
  includes(spec(6), ['不新增第四份必要來源', '三鏈原子合併', '未見不生成縮圖', '獨立下部開局及零選填路線', '不替代日期、尾碼及轉運章判定']);
});

test('U3 close inspection and the photo remain optional and do not multiply rewards', () => {
  includes(story(6), ['玩家自行切換兩個局部', '自行翻到那張已清晰的照片', '收起照片，再回到剛才的布料近看']);
  includes(spec(6), ['同一張靜圖', '不新建可探索凝固房', '不是限時答題或最低觀看時間', '局部切換本身不結案', '不重扣首次成本', '恐慌 0、零穩定度或冷卻中仍可看', '不由本次查看變清晰']);
});

test('R29 checks real price notes without inventing R19 history or deciding identity', () => {
  includes(story(7), ['提價那一列可翻回桌上的原頁', '只讀過等效摘要時', '尚待核驗的帳號']);
  includes(spec(7), ['R29_H06', '只有 F2 或未完成查看者沒有完整片段入口', '不重新鎖恐慌', 'R31 原核驗仍必要', '未看 R19 的玩家直接沿 R21 原簽名']);
});

test('U4 compares original landmarks only after the single return and never requires light', () => {
  includes(story(7), ['出發前的觀察與眼前局部並排', '沒有留光時，原本三個地標的比對照常完成']);
  includes(spec(7), ['最後確認才寫既有 `return_verified`', '不加第四項感知驗證', '讀檔不重繫布標、不重穿門', '`loop_seen` 未成立仍不能', '不自動鬆外扣或開 U4b 內銷', '光的出現本身不寫任何驗證進度']);
});

test('R31 equipment inspection preserves both investigation orders and explicit remount', () => {
  includes(story(8), ['已接好的來源、未完成的列與原頁位置都留著', '供電端與本地接合口', '完成原三項核對後，由玩家再按']);
  includes(spec(8), ['不增加強制離桌步驟', '只關閉近看不會取得 E5-08', '先做五列或先掛載皆可', '不插入鎖定後的五秒靜默或十二秒解凍']);
});

test('shared review state cannot grant sources, costs, transitions or a second thaw', () => {
  includes(appendix, ['id="core-gameplay-return-contract"', 'U1–U6 既有 F0', 'R29 不新建凝固層', 'ui.investigation_return', 'version 1', '損壞或未知焦點回本房原安全畫面', '不補證據、不回溯加關卡', '照片載入不算重新開啟', '留光差分不重扣槽', '文件測試不能證明節奏已達標']);
});

test('new reading interactions stay on existing source beats and image work orders', () => {
  const flow = JSON.parse(read('scene-flow.json'));
  assert.equal(flow.subscenes.length, 72);
  assert.equal(Object.keys(flow.images).length, 547);
  for (const [act, id, label] of [[6, 'R27-C01', '收頁／回景'], [6, 'U3-C05', 'M 靜圖'], [7, 'R29-C01', '原紙近看'], [7, 'U4-C01', '三組配對'], [8, 'R31-C02', '當前狀態']]) {
    assert(flow.images[id], `Missing image ${id}`);
    const row = spec(act).split('\n').find(line => line.startsWith(`| ${id} |`));
    includes(row, [label]);
    assert(story(act).includes(`[${id}]`), `Missing inline image ${id}`);
  }
});
