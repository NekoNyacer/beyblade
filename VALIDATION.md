# 手機拉環與立體衝擊版驗證 · 2026-11-10

版本：1.6.0-preview.1。

- `npm test`：65 項通過。包含拉速量測、螢幕尺度正規化、無效／短手勢、發射角度輸入驗證、可重現軌跡、齒軌過載撞罩與耗損、強力發射不保證勝出、三維碰撞／坑洞、2／10／16人收斂，以及原有伺服器、權限和賽程檢查。
- `npm run test:phone`：通過。隔離 Chrome 的 390×844 觸控環境透過真正 Pointer/Touch 事件進行兩場：加入、確認組裝、12° 慢拉、比賽結束、改為20°快拉、再戰。伺服器收到不同力道及正確角度，桌面收到即時戰鬥；高速圓盤模糊啟用；無頁面執行錯誤。紀錄 `.qa/phone-launch-results.json`。
- `npm run test:integration`：通過八個示範情境、暫停／繼續、桌機與手機尺寸、護罩／齒軌幾何、坑洞垂直位置及減少動態。紀錄 `.qa/stadium-browser-results.json`。
- 本機服務監聽 `0.0.0.0:3215`，本機請求 `http://<LAN_IP>:3215/launch-test` 回應200；區網介面排序先選實體網路，虛擬網卡列於其後。
- 圖片：`.qa/phone-launch-ready.png`、`.qa/phone-launch-slow.png`、`.qa/phone-launch-fast.png`、`.qa/phone-launch-desktop.png`；另有 stadium-* 畫面。
- 一次性設計檢查：新手機文字已提高至至少12px；QR來源於活動建立後動態產生，載入前隱藏；既有金屬按鈕陰影保留。

限制：觸控驗證為瀏覽器模擬，尚未在使用者的實體手機、Wi-Fi與投影設備進行本輪彩排。本機透過區網IP存取成功並不等同驗證另一台實體裝置的防火牆路徑。未修改防火牆、網路安全設定或部署公開網站。速度映射、模擬RPM與反彈參數仍屬娛樂模擬，未使用真實陀螺硬體校準。

## 2026-11-11 bowl revision

77 core tests pass, including flat-to-steep surface continuity, six grounded/airborne pocket gates, high/medium/low motion, gear acceleration and upper exit center crossing, residual spin and simultaneous exhaustion. Browser stadium checks pass for all eight scenes, pause, reduced motion, overhead Sprite identity, six exterior pockets, low-spin lean (0.0658 radians), incomplete settling state and no page errors. Two live phone rounds pass with current horizontal gestures and distinct measured powers. Desktop 1440, phone 390, isolated arena 1600 and 16-player captures were inspected; independent screenshot review: ship at that visual scope.

Screenshots: `.qa/stadium-desktop.png`, `.qa/stadium-mobile.png`, `.qa/bowl-arena.png`, `.qa/bowl-dense.png`, `.qa/bowl-low-spin.png`, `.qa/bowl-settling.png`. Runtime reports: `.qa/stadium-browser-results.json`, `.qa/phone-launch-results.json`. Physical tops, projector and real phone hardware were not calibrated in this pass.
