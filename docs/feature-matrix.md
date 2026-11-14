# 功能對照表（舊版 → 新版）

舊版：`legacy/index.html`（3,200 行單一檔案，只作為重構參考，不再部署）。
原則：**所有功能不分裝置都要能用**，手機與電腦只是排版不同。

標記：✅ 保留　🔧 調整　❌ 刪除

| # | 舊版功能區（函式） | 新版 | 新版位置 | 說明 |
|---|---|---|---|---|
| 1 | 系統常數與預設資料：時間範圍 07:00–17:00、10 分鐘一格、`GRADE_BLOCKS`、`COLOR_THEMES`、`EQUIPMENT_PRESETS`、`REFEREE_ROLE_PRESETS`、範例資料 | ✅ | `src/shared/constants.ts` | 範例資料改為「空專案時可一鍵載入」 |
| 2 | 應用程式狀態（全域 `state`） | 🔧 | `src/web/stores/*` | 拆成 project（賽程資料）與 session（角色、篩選、選取） |
| 3 | 初始化、localStorage、雲端同步（輪詢、延遲寫入、密碼驗證） | 🔧 | `src/web/services/*` | 輪詢改為 Durable Object 推送（§J），輪詢只當備援 |
| 4 | 雙向連鎖磁吸 `applyMagneticChain`、檢錄重疊 `checkIfCheckInOverlaps` | ✅ | `src/shared/schedule.ts` | 改成純函式並加單元測試 |
| 5 | 場地管理：新增、刪除、改名 | ✅ | `ManageVenues` | 手機、電腦共用 |
| 6 | 篩選列：導師「年級積木」、工作人員「人員搜尋」 | ✅ | `FilterBar` | 手機版收進「篩選」分頁 |
| 7 | 司令台中控置頂層：播報／頒獎時段 CRUD、啟用／停用 | ✅ | `CommandDeck`、`CommandSlotForm` | 手機版：當日總覽中的一張卡片 |
| 8 | 演示／正式模式、模擬時間（快轉、±10 分）、現在時間線 | 🔧 | `useClock`、`TimeControls` | 保留模擬時間（演練用）；正式模式用真實時間 |
| 9 | 角色切換（管理者／工作人員／導師）、網址 `?role=` | ✅ | `session` store | 寫入權限仍以管理者密碼為準 |
| 10 | 日期樹狀目錄：選日期、新增、刪除 | ✅ | `DayPicker`、`DayForm` | 手機版：上方橫向日期切換 |
| 11 | 時間軸畫布：時間 × 場地格狀表、檢錄緩衝區、重疊警示 | 🔧 | 電腦 `TimelineGrid`；手機 `VenueTimeline`（單一場地）、`AgendaList` | 手機不顯示多場地格狀表 |
| 12 | 拖放建立／移動、邊緣拉伸時間 | 🔧 | dnd-kit | 滑鼠與觸控都能用；手機長按拖曳 |
| 13 | 右側細節抽屜（檢視 + 編輯所有欄位） | 🔧 | `EventDetail`、`EventForm` | 電腦：右側面板；手機：底部滑出面板 + 全螢幕表單 |
| 14 | 現場即時調度：標記開始／結束、重設、延後後續賽程 `cascadeDelaySubsequentEvents` | ✅ | `LiveControls` + `src/shared/schedule.ts` | 手機上大按鈕 |
| 15 | 道次表附件：圖片壓縮、PDF、預覽、刪除 | ✅ | `Attachments` | 手機可直接用相機拍照（`capture`）。之後改存 R2（H7） |
| 16 | 欄位更新輔助：時間、檢錄提早、場地切換／全場地、裁判列、器材預設／自訂、複製、刪除 | ✅ | `EventForm` | |
| 17 | 細流表：公文格式預覽、CSV 匯出、大會人員編輯、範圍（當日／全部） | ✅ | I8 | 本次（I0–I7）先保留入口 |
| 18a | 匯出獨立分享網頁 | ❌ | — | 2026-11-14 決定刪除，改由 PWA 提供離線瀏覽 |
| 18b | JSON 匯出／匯入 | ✅ | I8 | 匯入時用 Zod 檢查格式 |
| 19 | 工具函式：分鐘 ⇄ HH:MM、時間選項、Toast | ✅ | `src/shared/time.ts`、`Toast` | |
| — | 彈窗 `cloudSyncModal` | 🔧 | `Settings` | 管理者密碼、專案代碼、連線狀態 |
| — | 彈窗 `venueManagerModal`、`commandSlotModal`、`addDateModal` | ✅ | 對應表單 | 手機為全螢幕表單，電腦為對話框 |
| — | 彈窗 `attachmentPreviewModal` | ✅ | `AttachmentPreview` | |
| — | 彈窗 `rundownModal` | ✅ | I8 | |
| — | 列印樣式 `@media print` | ✅ | I8 | |

## 新增功能
- 手機首頁「進行中／下一項（幾分鐘後檢錄）」
- Durable Object 即時推送（取代 4 秒輪詢）
- 離線瀏覽（PWA，I9）
