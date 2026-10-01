// The index retains its historical path so published bookmarks remain valid.
export const MASTER = '09_劇本/09-14_全劇本與關卡整合稿.md';
export const APPENDIX = '09_劇本/09-15_正式劇本_共用附錄.md';
export const ACTS = [
  ['序幕', '雨夜與地底'],
  ['第一幕', '門面與棚'],
  ['第二幕', '產線'],
  ['第三幕', '技術核心'],
  ['第四幕', '校正區'],
  ['第五幕', '我也是被逼的'],
  ['第六幕', '上層與回返'],
  ['終幕', '頂層的地板'],
].map(([name, subtitle], act) => ({
  act, name, subtitle,
  path: `09_劇本/09-${String(act + 3).padStart(2, '0')}_正式劇本_${name}.md`,
  specPath: `10_製作規格/10-${String(act + 1).padStart(2, '0')}_製作規格_${name}.md`,
}));
export const READING_FILES = [MASTER, ...ACTS.map(act => act.path), APPENDIX];
export const CANONICAL_FILES = [MASTER, ...ACTS.map(act => act.path), ...ACTS.map(act => act.specPath), APPENDIX];
export const SPLIT_MARKER = '<!-- screenplay:split -->';
export const SPEC_SPLIT_MARKER = '<!-- screenplay:specs-split -->';
