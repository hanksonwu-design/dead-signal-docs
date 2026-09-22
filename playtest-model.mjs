export const names={r12:'R12｜回收接頭',r22:'R22｜雙路釋放',u4:'U4｜現時記號',ud1:'UD-01｜何時操作',ud2:'UD-02｜擋住哪側'};
export function start(id){return {id,step:0,seen:false,done:false,reset:false,phase:'安全',side:'左',closed:[],route:'',msg:'先觀察現場，再選擇行動。',events:[]};}
export function act(old,a){let s=structuredClone(old);s.events.push({action:a,at:Date.now()});if(s.done)return s;
 const say=x=>{s.msg=x;return s;};
 if(a==='觀察'){s.seen=true;return say(({r12:'接口標「低壓」且為方形凹槽。圓形不合，另一個方形已裂。',r22:'門框磨痕：敲兩下、左掌向下壓兩次。另一側 A 扣承壓、B 桿釋放。兩路都可通過。',u4:'門號重複，但門框缺角與扶手焊疤是固定地標。地上有可用廢布。',ud1:'搖輪在掃擊區，乾燥凹位安全。只在成功躲避後的窗口轉輪。',ud2:'左右霜線指出來向。轉向隔板擋一側，固定冷櫃可躲。封口不會封住後方維修路。'})[s.id]);}
 if(!s.seen)return say('尚未核對現場；可先按「觀察」。');
 if(s.id==='r12'){
  if(a==='完整方形接頭'){s.step=1;return say('接頭入座，仍須親手接妥兩個原回路。');}
  if(a==='接上回路'&&s.step===1){s.done=true;return say('局部配電恢復。帳號權限與全樓供電仍需原後續流程。');}
  return say('接頭不入座，或尚未裝妥；可重選，不扣資源。');
 }
 if(s.id==='r22'){
  if(a==='手勢路'||a==='手動路'){if(s.step)return say('正在操作，請完成所選路線或重新試玩。');s.route=a;return say('已選'+a+'，門仍關著。');}
  let seq=s.route==='手勢路'?['敲門框','敲門框','掌心下壓','掌心下壓']:['解 A 扣','拉 B 桿'];
  if(s.step<seq.length){if(!s.route)return say('先選路線。');if(a===seq[s.step]){s.step++;return say(s.step===seq.length?'門栓完全退入、踏面開放。噤聲者留在原地。請自行走到安全踏台。':'完成這一步；門尚未完全打開。');}if(s.route==='手勢路')s.step=0;return say('順序不合；手勢重新開始，手動已完成段保留。此頁不模擬巡行安全窗。');}
  if(a==='走到安全踏台'){s.step=10;return say('已親手突破封鎖。可以停下整理，再主動點深層出口。');}
  if(a==='深層出口'&&s.step===10){s.step=11;return say('扶手布結。聲音：「這次，等我一起走。」主角：「……這次？」');}
  if(a==='跨門'&&s.step===11){s.done=true;return say('上部完成事件成立。原型不寫正式遊戲存檔。');}
  return say('依序走到安全踏台、查看深層出口，再自行跨門。');
 }
 if(s.id==='u4'){
  const seq=['繫布標','穿過內門','核對地標','鬆外扣','進入 U4b','抽內銷'];
  if(a!==seq[s.step])return say(s.step===2?'請核對布標斷邊、缺角與焊疤；相同門號不足以證明回返。':'這一步仍被前一道條件阻擋，可看現場回饋。');
  s.step++;s.done=s.step===seq.length;return say(['','布標已繫，單結與斷邊可辨。','回到原鏡位。固定地標與剛繫的布標仍在。','確認一次異常回返；假路不再重播，檢修蓋尚未開。','外扣鬆開，露出安全上踏台。','低位鏡頭看見內銷，不是原來的門口。','服務閘開啟，可去 U5。'][s.step]);
 }
 if(s.reset){if(a==='安全復位'){s.reset=false;s.phase='安全';return say('控制位置恢復；已完成段保留，自行開始下一個前兆。');}return say('需在安全位親手復位，不能硬吃攻擊繼續累積。');}
 if(a==='開始前兆'&&s.phase==='安全'){s.phase='前兆';s.defended=false;return say(s.id==='ud1'?'晾架向下壓、黑線接近。':'霜線從'+s.side+'側蔓延。');}
 if(a==='躲掩蔽'&&s.phase==='前兆'){s.defended=true;s.blocked=false;return say('在固定掩蔽內。');}
 if(s.id==='ud2'&&s.phase==='前兆'&&(a==='隔板擋左'||a==='隔板擋右')){s.defended=a.endsWith(s.side);s.blocked=s.defended;return say('隔板朝'+a.slice(-1)+'；等攻擊驗證。');}
 if(a==='推演攻擊'&&s.phase==='前兆'){
  if(!s.defended){s.reset=true;s.phase='安全';return say('命中：當前未提交操作取消，已完成段保留。回安全位復位。');}
  s.phase='窗口';return say(s.id==='ud2'&&!s.blocked?'成功躲避，但未阻住來向，無封口機會；安全重新開始。':'應對成功，取得操作窗口。');
 }
 if(a==='重新觀察'&&s.phase==='窗口'){s.phase='安全';return say('回安全位，下次前兆仍可辨認。');}
 if(s.phase==='窗口'&&((s.id==='ud1'&&a==='轉搖輪')||(s.id==='ud2'&&s.blocked&&a==='封住來向側'))){
  s.step++;if(s.id==='ud2'){s.closed.push(s.side);s.side=s.side==='左'?'右':'左';}
  s.phase='安全';s.done=s.step===2;return say(s.done?'通路確實開放，遭遇不再重生。':'第一段已保存；重新觀察下一次前兆。');
 }
 return say('目前沒有安全操作窗口；未提交任何進度。');
}
