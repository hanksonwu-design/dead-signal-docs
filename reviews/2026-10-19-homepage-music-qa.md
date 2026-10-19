# 文件瀏覽器首頁背景音樂

日期：2026-10-19

- 使用者提供的「登入音樂.mp3」已原樣複製至 `assets/audio/login-theme.mp3`，兩者 SHA-256 一致；6,182,400 bytes。
- 僅 root `index.html` 載入播放器，原生 `<audio loop>` 循環播放；首頁提供播放／暫停及音量，閱讀視窗共用同一音軌與同步按鈕。
- 預設音量 25%，記住播放偏好與音量；自動播放被阻擋時顯示「點按播放」，不假報正在播放。
- 離頁暫停，多個文件分頁透過 BroadcastChannel 避免疊播。
- 本機預覽伺服器補上 MP3 MIME、Content-Length 及單一 byte-range 回應，讓媒體長度與循環定位正確。

## 實測

- 原生音訊 readyState=4、paused=false、loop=true，辨識長度 154.56 秒，播放進度持續增加。
- 播放、暫停、音量按鍵、重新整理後保留偏好均正常。
- 閱讀器內的暫停／恢復控制正常，整頁只有一個 audio 元素。
- 320px 閱讀工具列可容納音樂控制，沒有整頁橫向溢出。
- 「場景與流程」頁確認 audio 元素與播放器腳本皆為 0；返回首頁恢復播放。
- MP3 HEAD 的 MIME／長度、一般 range、suffix range 與無效 range 回應檢查通過。
- JavaScript 語法檢查通過；既有閱讀與標記測試共 18 項通過。

完成截圖：`2026-10-19-homepage-music.png`。未提交或推送 GitHub。
