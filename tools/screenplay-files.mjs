// The index retains its historical path so published bookmarks remain valid.
export const MASTER = '09_劇本/09-14_全劇本與關卡整合稿.md';
export const APPENDIX = '09_劇本/09-15_正式劇本_共用附錄.md';
export const LEGACY_ACTS = [
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
// Keep published paths and source IDs stable; presentation order is explicit.
export const ACTS = [
  ...LEGACY_ACTS.slice(0, 6),
  { ...LEGACY_ACTS[6], subtitle: '展示與暗巷' },
  { act: 7, name: '第七幕', subtitle: '簽名與回返', path: '09_劇本/09-16_正式劇本_第七幕.md', specPath: '10_製作規格/10-09_製作規格_第七幕.md' },
  { act: 8, name: '第八幕', subtitle: '最後一道門', path: '09_劇本/09-17_正式劇本_第八幕.md', specPath: '10_製作規格/10-10_製作規格_第八幕.md' },
  { ...LEGACY_ACTS[7], act: 9 },
];
export const FINALE = ACTS.at(-1);
export const LOWER_ACT_NODES = [
  ['M1', 'R27', 'U1', 'U2', 'U2b', 'U3'],
  ['R28', 'R29', 'U4', 'U4b', 'U5'],
  ['U6', 'U6b', 'R30', 'R31'],
];
export function legacyFinalHeading(file, heading) {
  if (file !== FINALE.path && file !== FINALE.specPath && file !== MASTER) return heading;
  return heading.replace(/^(act|spec-act|image-routes-act)-7(?=-|$)/, '$1-9');
}
export const READING_FILES = [MASTER, ...ACTS.map(act => act.path), APPENDIX];
export const CANONICAL_FILES = [MASTER, ...ACTS.map(act => act.path), ...ACTS.map(act => act.specPath), APPENDIX];
export const SPLIT_MARKER = '<!-- screenplay:split -->';
export const SPEC_SPLIT_MARKER = '<!-- screenplay:specs-split -->';
