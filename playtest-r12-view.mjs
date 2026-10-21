// Fixed-view greybox using the authored R12-C01 layout. No game saves or door permissions.
let selected = '';
const lineNames = {door:'門禁線',equipment:'設備線'};

export function renderR12(container, state, send) {
  if (!state.seen) selected = '';
  const focus = document.activeElement?.dataset.r12Control;
  const wires = Object.entries(state.wiring).filter(([, target]) => target).map(([line, target]) => {
    const origin = line === 'door' ? 225 : 535;
    const destination = target === 'left' ? 330 : 430;
    return `<path d="M${origin} 256 C${origin} 325 ${destination} 325 ${destination} 233" class="patch-wire ${line}"/>`;
  }).join('');
  const plate = target => {
    const x = target === 'left' ? 330 : 430;
    const connected = Object.entries(state.wiring).find(([, value]) => value === target)?.[0];
    const upright = state.tested && state.step > 0 && connected === (target === 'left' ? 'equipment' : 'door');
    return `<path d="M${x-13} 155 l${upright ? '0 -24' : '24 0'}" class="test-plate"/><text x="${x}" y="129" text-anchor="middle">${upright ? '立住' : '落下'}</text>`;
  };
  const trial = state.step ? '入座' : {round:'圓口抵邊',cracked:'裂榫鬆脫',none:'插口空著'}[state.partTrial];
  const part = state.step ? '<rect x="367" y="151" width="26" height="26" class="engraving"/><path d="M365 160 h-7 M395 160 h7" class="engraving"/>'
    : state.partTrial === 'round' ? '<circle cx="393" cy="164" r="16" class="engraving"/>'
    : state.partTrial === 'cracked' ? '<rect x="367" y="151" width="26" height="26" class="engraving"/><path d="M393 151 l-8 8 8 8 -8 10" class="crack"/>' : '';
  container.innerHTML = `
    <p class="greybox-note">R12-C01 · 固定近看灰盒。點選線端，再點接座；可拆回重接。形狀與刻記供觀察，沒有預畫正確連線。</p>
    <button data-r12-control="inspect">${state.seen ? '重新查看配電盤' : '查看配電盤'}</button>
    <div class="r12-workbench" ${state.seen ? '' : 'hidden'}>
      <svg viewBox="0 0 760 350" role="img" aria-labelledby="r12-map-title r12-map-desc">
        <title id="r12-map-title">低壓配電盤與可追看的兩條線槽</title>
        <desc id="r12-map-desc">左邊門端的線槽連到雙短線套環；右邊櫃側設備連到長線套環。盤內左座刻長線，右座刻雙短線。${state.done ? '護蓋已扣妥，兩片測試片立住。' : '護蓋打開，電源斷開。'}</desc>
        <rect x="36" y="38" width="688" height="285" rx="10" class="wall"/>
        <rect x="70" y="64" width="100" height="75" class="equipment-body"/><text x="120" y="95" text-anchor="middle">門端</text>
        <rect x="590" y="64" width="100" height="75" class="equipment-body"/><text x="640" y="95" text-anchor="middle">櫃側設備</text>
        <path d="M120 140 V182 H225 V256" class="fixed-wire door"/>
        <path d="M640 140 V182 H535 V256" class="fixed-wire equipment"/>
        <rect x="278" y="61" width="204" height="201" rx="6" class="power-panel"/>
        <text x="380" y="86" text-anchor="middle">低壓 · ${state.step ? '接頭已入座' : '方形插口 □'}</text>
        <text x="380" y="108" text-anchor="middle">${state.done ? '護蓋扣妥／通電' : '護蓋打開／斷電'}</text>
        <rect x="361" y="145" width="38" height="38" class="socket"/>${part}<text x="380" y="201" text-anchor="middle">${trial}</text>
        ${plate('left')}${plate('right')}
        <rect x="314" y="207" width="32" height="26" class="socket"/><rect x="414" y="207" width="32" height="26" class="socket"/>
        <path d="M330 175 V198 M425 180 V194 M435 180 V194" class="engraving"/>
        <text x="330" y="251" text-anchor="middle">左座</text><text x="430" y="251" text-anchor="middle">右座</text>
        <path d="M219 220 V235 M231 220 V235 M535 215 V240" class="engraving"/>
        <text x="206" y="279" text-anchor="middle">雙短線</text><text x="552" y="279" text-anchor="middle">長線</text>
        ${wires}
      </svg>
      <fieldset><legend>托盤與插口</legend>
        <button data-r12-control="round" ${state.done ? 'disabled' : ''}>甲　○ 圓口 · 低壓</button>
        <button data-r12-control="cracked" ${state.done ? 'disabled' : ''}>乙　□ 方口 · 榫有裂縫 · 低壓</button>
        <button data-r12-control="intact" ${state.done ? 'disabled' : ''}>丙　□ 方口 · 榫完整 · 低壓</button>
      </fieldset>
      <fieldset><legend>選線端，再選接座</legend>
        <button data-r12-control="door" aria-pressed="${selected === 'door'}" ${state.done ? 'disabled' : ''}>門端線 · 雙短線套環${selected === 'door' ? '〔已選〕' : ''}</button>
        <button data-r12-control="equipment" aria-pressed="${selected === 'equipment'}" ${state.done ? 'disabled' : ''}>設備線 · 長線套環${selected === 'equipment' ? '〔已選〕' : ''}</button>
        <div><button data-r12-control="left" ${state.done || !selected ? 'disabled' : ''}>接左座</button><button data-r12-control="right" ${state.done || !selected ? 'disabled' : ''}>接右座</button><button data-r12-control="detach" ${state.done || !selected ? 'disabled' : ''}>拆回所選線</button></div>
      </fieldset>
      <p class="wiring-status" role="status">門端線：${state.wiring.door === 'left' ? '左座' : state.wiring.door === 'right' ? '右座' : '掛位'}；設備線：${state.wiring.equipment === 'left' ? '左座' : state.wiring.equipment === 'right' ? '右座' : '掛位'}。${state.done ? '兩片測試片立住；供電正常／待權限核驗。' : '接線不代表測試通過。'}</p>
      <button data-r12-control="test" ${state.done ? 'disabled' : ''}>收手扣蓋，合閘測試</button>
    </div>`;
  const bind = (id, callback) => container.querySelector(`[data-r12-control="${id}"]`).onclick = callback;
  bind('inspect', () => send('觀察'));
  for (const [id, action] of [['round','圓形接頭'],['cracked','裂開方形接頭'],['intact','完整方形接頭']]) bind(id, () => send(action));
  for (const line of ['door','equipment']) bind(line, () => { selected = line; renderR12(container, state, send); });
  for (const target of ['left','right']) bind(target, () => { if (selected) send(`${lineNames[selected]}接${target === 'left' ? '左' : '右'}座`); });
  bind('detach', () => { if (selected) send(`拆回${lineNames[selected]}`); });
  bind('test', () => send('合閘測試'));
  if (focus) container.querySelector(`[data-r12-control="${focus}"]`)?.focus({preventScroll:true});
}
