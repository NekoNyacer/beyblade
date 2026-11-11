# 戰鬥陀螺音效試聽

三組各 19 種聲音，共 57 個 44.1 kHz / 16-bit PCM / 單聲道 WAV。音效是原創合成，沒有使用任天堂或其他遊戲原音。

- A 熱血競技場：厚實衝擊、明亮確認音、寬闊勝利號角。
- B 鋼鐵衝擊：金屬共鳴、機械扣鎖、較低沉的衝擊。
- C 霓虹派對：清脆電子、明快彈跳、輕盈勝利音。

## 開啟試聽

執行 `node scripts/sound-lab-server.mjs`，或雙擊 `start-sound-lab.cmd`，再於同一電腦開啟 http://localhost:3216/sound-lab.html 。服務只監聽 127.0.0.1，不對區網或網際網路開放，也不讀寫遊戲活動資料。若 3216 已被使用，可先設定 `SOUND_LAB_PORT`。如果既有遊戲服務已從本專案啟動，也可在該網址後加上 `/sound-lab.html`。

先降低喇叭音量，再按任一試聽按鈕。可整組比較，或每個情境分別選 A／B／C。選擇只保存在目前瀏覽器，匯出 JSON 可以保留混搭清單。選擇不會套用至正式遊戲。

高速旋轉預覽在比例 55% 以下完全靜音，超過門檻後平滑增加音量及音高。這是試聽用的正規化比例，不是已經校準的實體 RPM。切換組別、全部停止及離開頁面時會停止既有聲音。

## 配音狀態：TTS 節奏示範

倒數及 GO／SHOOT 是本機 Windows SAPI「Microsoft Zira Desktop」文字轉語音，附上三組不同音高與短回音處理。GO 使用合成延長。它們包含實際可辨識的英語字詞，但不是最終的熱血主持表演，更不是特定遊戲主持人仿聲。

要達到熱血格鬥遊戲主持效果，下一步應用原創角色的情緒配音或真人錄製，保留節奏「Three [1 秒] Two [1 秒] One [1 秒] Gooooo [2 秒] SHOOT!」。本機沒有可直接使用的情緒配音生成服務。公開發行前，亦應核對 Windows 語音引擎的再散布授權。

## 聲音清單

UI 移動、確認、返回、準備完成；倒數 3、2、1、GO、SHOOT；拉環發射、高速旋轉循環、輕碰撞、重碰撞、齒軌衝刺、護罩反彈、落坑撞底；出場淘汰、勝利、落敗。

音檔：`public/assets/sound-packs/{arena|metal|neon}/*.wav`。
清單及量測：`public/assets/sound-packs/manifest.json`。

## 重建與驗證

1. Windows PowerShell：`powershell -File scripts/generate-sound-voice.ps1`，需要已安裝 Microsoft Zira Desktop。
2. `node scripts/generate-sound-packs.mjs`。SFX 使用固定亂數種子，可重現；TTS 素材放在 `.qa/sound-voice-source`，不納入 Git。
3. `node --test test/sound-packs.test.mjs`。
4. `node scripts/sound-lab-browser-check.mjs`，使用已安裝 Chrome／Edge 與專案既有 playwright-core。

驗證涵蓋 WAV 格式、57 檔非靜音／峰值、循環接縫、瀏覽器解碼、各按鈕、低速門檻、停止、選擇保存與手機版。自動驗證不等於主觀聽感驗收；最終混音須使用活動現場喇叭確認。

## 等選定後再整合

目前只新增隔離試聽頁、資產、生成與驗證腳本，沒有更動 `net.js` 或遊戲行為，也沒有推送或部署。

正式整合時可沿用 `public/assets/net.js` 的啟用手勢、同時發聲數限制與壓縮器；旋轉聲應讀取權威 frame 的 `angularSpeed`，以 `angularSpeed * 60 / (2 * Math.PI)` 換算模擬 RPM，依實際玩法分佈調整門檻、淡入淡出和總混音上限。不要只看能量，因為能量歸零後仍保留殘餘旋轉。多人同場宜將旋轉彙整成受限的一至兩層，避免每顆疊加造成過大音量。
