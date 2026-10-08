import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';
import { parseMaster } from './sync-canonical.mjs';

const master = parseMaster();
const story = act => master.documents.get(ACTS[act].path);
const spec = act => master.documents.get(ACTS[act].specPath);
const appendix = master.documents.get(APPENDIX);
const novel = readFileSync(new URL('../docs/09_故事劇情/17_縮寫短文.md', import.meta.url), 'utf8');
const block = id => {
  assert(master.blocks.has(id), `Missing source block: ${id}`);
  return master.blocks.get(id);
};
const includes = (source, phrases) => {
  for (const phrase of phrases) assert(source.includes(phrase), `Missing contract: ${phrase}`);
};
const row = (source, id) => {
  const line = source.split('\n').find(line => line.startsWith(`| ${id} |`));
  assert(line, `Missing source row: ${id}`);
  return line.split('|').slice(1, -1).map(cell => cell.trim());
};
const seconds = value => {
  assert.match(value, /^\d{2}:\d{2}(?::\d{2})?$/);
  const [h, m, s = 0] = value.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

test('escape timestamps keep the seven-minute bypass and separate same-floor pickup from basement arrival', () => {
  const timeline = block('s-0908-32');
  const bypass = row(timeline, 'E4-04-B')[1];
  const innerDoor = row(timeline, 'E4-04-D')[1];
  const departure = row(timeline, 'E4-04-E')[1];
  const restore = row(timeline, '門禁／電力軌');
  const supply = block('s-0908-34');
  const pickup = supply.match(/核對 (\d{2}:\d{2}:\d{2})/)[1];
  const arrival = appendix.match(/\| \*\*T−2 週 · 約 (\d{2}:\d{2})\*\* \| 主角沿/)[1];
  assert.equal(seconds(restore[1]) - seconds(bypass), 7 * 60);
  assert.equal(seconds(departure) - seconds(innerDoor), 11);
  assert.equal(seconds(pickup) - seconds(departure), 9);
  assert(seconds(arrival) > seconds(restore[1]));
  includes(row(timeline, 'E4-04-F')[2], ['B 棟 50F', '往 B3']);
  includes(restore[2], ['已越過 50F 憑證門', '管理側梯']);
  includes(supply, ['B3-SUPPLY-04', '位置：B 棟 50F／服務路線：往 B3', '備份門外轉角']);
  includes(spec(5), ['約 02:40 抵達 B3', '不加作 R25 的精確時戳', '不是補給架所在樓層', '驗證恢復不會將側梯內部各層同步鎖死']);
  includes(spec(0), ['02:20:31 從 B 棟 50F', '約 02:40 才抵達 B3']);
  includes(spec(8), ['02:20:22 在 B 棟 50F 轉向往 B3']);
  includes(novel, ['02:20:31，補給庫存少了一包', '架位寫著五十樓', '我已在管理側梯裡']);
});

test('historical descent does not borrow the damaged present-day route or a new required clue', () => {
  includes(appendix, ['L-48 封鎖與樓體震損都尚未發生', '非 R25 七分鐘原件的精確時戳', '逃亡路線也不是 T0 逐段繞行的受損路線']);
  includes(spec(5), ['並非 T0 的受損探索路線', '時間帶或鎖定必要件']);
  assert(row(appendix, '`E4-04-F`').at(-1).includes('非三格鎖定必要件'));
  for (const source of master.documents.values()) {
    assert.doesNotMatch(source, /B3 管理逃生補給架|她轉入 B3 管理逃生線|02:20:22 後轉入 B3/);
  }
});

test('historical rescue remains unconfirmed while actual ending rescue is preserved', () => {
  for (const source of master.documents.values()) {
    assert.doesNotMatch(source, /警察第六至七日失敗|救援曾到達、卻未完成/);
  }
  includes(appendix, ['人為封鎖先發生，第六至七日的結構震損在後', '現有歷史原件不證明救援抵達', '求援留下紀錄，裂口仍不是出口']);
  includes(spec(8), ['門先由集團', '較晚衝擊又使公共通路斷裂', '裂口與求救回執都不等於出口或救援已到']);
  includes(row(appendix, 'B《沒有我的故事》').join(' '), ['主角回返獲救後', '本地原件未刪']);
  includes(novel, ['清障的工具聲從維修入口接近', '照護仍在泵房裡']);
});

test('R19 distinguishes declining before entry, pausing or saving, and completing before exploration', () => {
  includes(block('s-0907-13'), ['「暫不查看」返回原調查，可直接走側門', '0 點有本地記憶錨點備援', '續接不重扣']);
  includes(block('s-0907-14'), ['切換文字摘要或存檔離開遊戲', '完成演出或等效摘要後返回探索']);
  assert(!story(4).includes('放大或退出'));
  includes(spec(4), ['進入後不可直接返回探索', 'Esc 暫停、存檔離開與摘要切換仍可用', '演出或等效摘要完成後提交']);
});

test('ending B releases the door by choice after upload, with matching VO and art coverage', () => {
  const prepare = block('s-0910-23');
  const release = block('s-0910-24');
  includes(prepare, ['保留本地原件', '收到副本的收件證明後', '另行送出一次定位']);
  const ordered = ['低頭看著自己橫在門前的手', '這次，別再說會回來。', '自己讓出門', '才往 R33'];
  const offsets = ordered.map(phrase => release.indexOf(phrase));
  assert(offsets.every((offset, i) => offset >= 0 && (i === 0 || offset > offsets[i - 1])));
  includes(spec(9), ['這是已提交分支的結果演出', '不新增選項、好感門檻或 C 的搭紙同行操作', '不重送資料或定位']);
  assert.match(spec(9), /^\| \d+ \| 小花／現時 \| 這次，別再說會回來。 \| R32-B2 \| 新增；待審 \|/m);
  includes(row(spec(9), 'R32-V01').join(' '), ['B 另交', '低動態版同樣可辨']);
  includes(appendix, ['是決定停止等待', '她不讀心、不知道終端上的遮蔽內容', '沒有原諒主角的責任']);
  includes(novel, ['這次，別再說會回來。', '本地的簽核沒有因為這個答案消失']);
});

test('controlled contact and rations remain distinct from private freedom and old resident commerce', () => {
  includes(appendix, [
    '以受監看的指定通話機會施壓', '通話仍由康核定',
    '沒有私人對外聯絡權', '執行話務或監看不等於取得對外線的開放權',
    '舊居民與獨立商戶留下現金交易的價目表', '點名、配給與扣餐紀錄',
    '被逼邀約朋友的人仍受拘禁', '原轉介者不因此放行',
  ]);
  assert.doesNotMatch(appendix, /轉賣聯絡權|食物可以用錢買，也可以用工時/);
});

test('R24 concludes identity-record rewriting without deleting evidence or changing the required chain', () => {
  const conclusion = '他們撤掉原本的受困者身分，再用後補的『自願』文件掩蓋入園經過。';
  includes(block('s-0908-22'), [conclusion, '原接收聯、轉任撤號紀錄與後補文件', '已核可的處置單仍留在同頁', 'E4-01', 'E4-02', 'E3-02']);
  assert.equal(spec(5).split(conclusion).length - 1, 2);
  includes(spec(5), ['不刪除證據庫原件、已讀狀態或處置單', 'E4-01／E4-02／E3-02 的鎖定條件維持不變']);
  for (const source of master.documents.values()) {
    assert(!source.includes('把他曾是受害者的證據刪掉'));
  }
});

test('Kang recording remains a coercive promise rather than an author-certified guarantee', () => {
  const promise = '你可以待在那邊，也可以到這邊來。到這邊來的人，不會被送去校正區。';
  for (const source of [story(5), spec(5), appendix, novel]) includes(source, [promise]);
  includes(appendix, ['用局部真話包裝脅迫', '是康的承諾，不是永久保障', '職位與待遇仍可被撤回', '錄音證明他說過什麼，不替承諾背書']);
  includes(spec(5), ['康的原始承諾，而非系統保證', '本人仍受離園與私人通聯限制']);
  includes(novel, ['住宿和配給確實換過', '證件卻仍被扣著']);
  for (const source of master.documents.values()) {
    assert.doesNotMatch(source, /他從不說謊|康從不說謊|錄音裡沒有一個字是假的|他說的每一句都是真的/);
  }
});

test('R16 proves common grading and approved actions, not accurate mind prediction', () => {
  const conclusion = '同一組欄位同時評估螢幕兩側的人。他們把客戶和受困的人，塞進同一張評級表。';
  includes(block('s-0906-40'), [conclusion, 'E2-04', 'E2-05', 'E2-14']);
  assert.equal(spec(3).split(conclusion).length - 1, 2);
  includes(spec(3), ['不新增模型準確率題目或必要證據', '核可及執行回執分開保留']);
  includes(appendix, ['詐騙所得是園區持續運作的重要收入', '評級資料另被包裝出售', '評分也會誤判', '管理者核可處置']);
  for (const source of master.documents.values()) {
    assert.doesNotMatch(source, /詐騙只是資料來源|意識數據才是園區的高價產品|讓陌生人愛上你，和讓被囚禁的人保持聽話，讀的是同一/);
  }
});

test('evacuation distinguishes departing personnel, abandoned captives and unknown resident fates', () => {
  const timeline = row(appendix, '**T−2 週 +2 日**');
  // The first same-day row is the audit trigger; inspect the separately described closure as well.
  includes(timeline.join(' '), ['康完成 48 小時對帳']);
  assert.match(appendix, /^\| \*\*T−2 週 \+2 日\*\* \| 撤離人員.*控制區出口.*留下未被撤出的受困者.*康留守交接.*下落逐案核實/m);
  includes(appendix, ['不表示所有人同日死亡', '並非所有集團人員都在這一天離開']);
  for (const source of master.documents.values()) {
    assert.doesNotMatch(source, /拋下所有人|把所有人一起鎖在樓內|鎖死所有人|與所有人一起被鎖死|→ 所有人死/);
  }
});
