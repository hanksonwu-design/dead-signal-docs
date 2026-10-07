import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACTS, APPENDIX } from './screenplay-files.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const story = act => read(`docs/${ACTS[act].path}`);
const spec = act => read(`docs/${ACTS[act].specPath}`);
const appendix = read(`docs/${APPENDIX}`);
const includes = (source, phrases) => {
  for (const phrase of phrases) assert(source.includes(phrase), `Missing contract: ${phrase}`);
};
const row = label => {
  const design = appendix.split('<a id="insect-dark-design"></a>')[1]?.split('<!-- import:s-0412-9:end -->')[0];
  assert(design, 'Missing canonical design section');
  const found = design.split('\n').find(line => line.startsWith(`| ${label} |`));
  assert(found, `Missing design row: ${label}`);
  return found;
};

test('insect silhouettes differ while reading acts retain recognizable human gestures', () => {
  includes(story(1), ['頸影多折了一節', '五雙手各自壓著號牌', '裡頭卻沒有手臂']);
  includes(story(2), ['中空的弧', '三層薄膜從頰側錯開', '同一張臉', '指影已繞到桌沿']);
  includes(story(3), ['指尖一節節向空掌心內折', '物流標籤結成窄繭', '整個局部靜止']);
  includes(story(4), ['肩線被接縫切成薄片']);
  includes(story(5), ['兩層制服之間', '同一條手臂']);
  includes(story(9), ['粉質巨翼沿高處內牆折下', '小花仍是原來的身量', '兩左兩右', '手掌朝上等著']);
  assert(!story(3).includes('喉部乾殼細顫'));
  includes(appendix, ['性侵與其他受害經歷由既有文字來源承載', '不轉成性化身體造型']);
});

test('concept studies do not create apparitions, animate history or resolve missing people', () => {
  includes(row('E-02 墜落者'), ['R3 僅使用凝固伸手', '不確定死因不改寫']);
  includes(row('E-04 低標者'), ['不補一場現時變形', '已安息狀態不重置']);
  includes(row('E-05 通報者'), ['沒有現時完整身體或個人聲音', '未確認命運']);
  includes(row('E-08 電房殘響'), ['現時靜止局部', '歷史畫面獨立靜止']);
  includes(row('E-09 封鎖後者'), ['M1 三具遺體靜止', '與校正區巡行分開']);
  includes(row('E-10 空名訊號'), ['無完整昆蟲怨靈', '無死亡定論']);
  includes(row('E-11 未定收件人'), ['不補全個體', '不填收件人']);
  includes(row('鏡像者'), ['主角當前衣著', '不新增追逐']);
  includes(spec(2), ['不新增 E-05 現時現身或人聲']);
  assert(!appendix.includes('每次接通只傳回「不是我的簽名」'));
  assert(!appendix.includes('風聲出現時，腳尖才離開地面'));
});

test('new art requirements reuse pending image IDs and mark old concepts explicitly', () => {
  const flow = JSON.parse(read('scene-flow.json'));
  const work = {
    'R1-V01': '頸影多折一節',
    'R5-V01': '空袖牽起／塌平／停手',
    'R5-C02': '歷史層保持靜止',
    'R7-V01': '中空側弧',
    'R11-V01': '三層窄扇笑膜',
    'R13-V01': '節段指尖繞空掌心內折',
    'R14-C04': '原呼吸／開關門同步節奏',
    'R15-C04': '靜止工具手',
    'R18-V01': '2.2 秒救援窗不變',
    'R26-V01': '雙層制服硬殼',
    'R32-V01': '沿內牆低垂翼拱',
    'R32-V02': '原 3.5 秒前兆',
  };
  for (const [id, requirement] of Object.entries(work)) {
    assert.equal(flow.images[id]?.status, 'pending', id);
    includes(flow.images[id].requirements, [requirement]);
  }
  for (const [act, ids] of [[1, ['v32']], [2, ['v10']], [3, ['v33', 'v34']], [9, ['art02', 'v38']]]) {
    const text = spec(act);
    for (const id of ids) {
      const block = text.split(`<a id="fig-${id}"></a>`)[1]?.split('<a id=')[0];
      assert(block, id);
      includes(block, ['**造型版本：**', '待重製']);
    }
  }
  includes(appendix, ['本次深化的造型尚未繪製', '同一圖號內的分層和差分另估工時']);
  assert.equal(Object.keys(flow.images).length, 538);
});

test('aesthetic changes preserve attack timing, safe reading and staged Xiaohua reveal', () => {
  const attacks = appendix.split('\n').filter(line => /^\| (AX|AB|XH)-\d{2} /.test(line));
  assert.equal(attacks.length, 7);
  const timings = [3, 3, 3.2, 3.2, 3.5, 3.5, 3.5];
  attacks.forEach((line, index) => includes(line, [`${timings[index]} 秒`, '6 秒']));
  includes(appendix, ['完整文件、必要配音與結局選擇期間不攻擊', 'SOURCE_READ', '停戰不等於解封或原諒']);
  includes(appendix, ['一般恐慌值不提前觸發完整翼膜']);
  includes(spec(9), ['顯形期間不判攻擊', '完成封鎖三源後']);
  includes(spec(2), ['兩路一律停新增擬音', '17 秒原底噪']);
  includes(appendix, ['黑白剪影分辨角色', '低動態、無聲與效果關閉版本']);
});
