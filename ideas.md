# Meta Ads Reviewer - 設計構思

## 需求概述
一個用來收集和展示多個 Meta 廣告帳號中被拒登廣告的 Web App。功能包括：
- Access Token 設定
- 自動抓取所有關聯廣告帳號
- 手動輸入廣告帳號 ID
- 被拒登廣告儀表板

---

<response>
<idea>

## 方案一：「控制中心」— 工業監控美學

**Design Movement**: Industrial Dashboard / Control Room Aesthetic
受航空管制台和工業監控系統啟發，以功能性為核心的暗色介面。

**Core Principles**:
1. 資訊密度優先 — 在有限空間內展示最多有用資訊
2. 狀態視覺化 — 用顏色編碼即時反映廣告審核狀態
3. 層級分明 — 透過亮度梯度建立清晰的視覺層級

**Color Philosophy**:
- 深灰底色 (#0F1117) 搭配冷藍高亮 (#3B82F6)
- 紅色警告 (#EF4444) 標記被拒登項目
- 琥珀色 (#F59E0B) 用於警告狀態
- 低飽和度的輔助色保持專業感

**Layout Paradigm**:
- 左側固定導航欄 + 右側主內容區
- 頂部狀態列顯示帳號概覽
- 卡片式數據面板，支援展開/收合

**Signature Elements**:
1. 帳號狀態指示燈（綠/黃/紅圓點）
2. 數據表格帶有行級展開詳情
3. 頂部統計摘要條

**Interaction Philosophy**: 精確且高效 — 最少點擊完成最多操作

**Animation**: 數據載入時的脈衝動畫，狀態變更的平滑過渡

**Typography System**: JetBrains Mono 用於數據，Inter 用於標題和說明文字

</idea>
<text>工業監控風格，暗色主題，強調資訊密度和狀態視覺化</text>
<probability>0.08</probability>
</response>

<response>
<idea>

## 方案二：「清澈報表」— 北歐極簡主義

**Design Movement**: Scandinavian Minimalism / Swiss Design
受北歐設計和瑞士國際主義風格啟發，極度乾淨的淺色介面。

**Core Principles**:
1. 留白即設計 — 大量留白讓數據自己說話
2. 排版即結構 — 用字體大小和粗細建立層級
3. 克制用色 — 僅在關鍵處使用色彩

**Color Philosophy**:
- 純白底 (#FAFBFC) 搭配暖灰文字 (#374151)
- 單一強調色：深靛藍 (#4338CA)
- 被拒登用柔和紅 (#DC2626)
- 邊框和分隔線用極淡灰 (#E5E7EB)

**Layout Paradigm**:
- 頂部導航 + 全寬內容區
- 大量留白的卡片佈局
- 表格式數據展示，行距寬鬆

**Signature Elements**:
1. 超大字號的統計數字
2. 極細線條分隔區塊
3. 圓角標籤式狀態指示

**Interaction Philosophy**: 安靜且優雅 — 交互反饋含蓄但確實

**Animation**: 微妙的淡入效果，hover 時的輕微上浮

**Typography System**: DM Sans 用於標題，System UI 用於正文

</idea>
<text>北歐極簡風格，淺色主題，大量留白，排版驅動</text>
<probability>0.06</probability>
</response>

<response>
<idea>

## 方案三：「戰術面板」— 深色數據驅動

**Design Movement**: Dark Mode Data Dashboard / Tactical UI
受現代 SaaS 分析工具（如 Linear、Vercel Dashboard）啟發的深色數據介面。

**Core Principles**:
1. 對比驅動 — 深色背景讓數據和狀態色彩更突出
2. 卡片分區 — 每個功能模塊獨立成卡片，邊界清晰
3. 漸進揭露 — 先展示摘要，按需展開細節

**Color Philosophy**:
- 深色底 (#09090B) 搭配微妙的邊框 (rgba(255,255,255,0.08))
- 主色調：翠綠 (#10B981) 代表正常
- 警告色：珊瑚紅 (#F43F5E) 代表被拒登
- 資訊色：天藍 (#38BDF8) 用於連結和操作

**Layout Paradigm**:
- 可收合的側邊欄導航
- 主區域採用響應式網格
- 頂部固定的搜索和篩選列
- 底部分頁控制

**Signature Elements**:
1. 漸層邊框的卡片（微妙的彩色邊框光暈）
2. 帶有圖標的狀態標籤（pill badges）
3. 可展開的廣告詳情抽屜（slide-over panel）

**Interaction Philosophy**: 流暢且直覺 — 每個操作都有即時視覺反饋

**Animation**: 
- 頁面切換的滑動過渡
- 卡片載入的交錯淡入（staggered fade-in）
- 展開/收合的彈簧動畫
- 按鈕的微妙縮放反饋

**Typography System**: 
- 標題：Space Grotesk（幾何感，現代）
- 正文：Inter（可讀性高）
- 數據/代碼：IBM Plex Mono（等寬，專業）

</idea>
<text>深色數據面板風格，受 Linear/Vercel 啟發，漸層邊框卡片，流暢動畫</text>
<probability>0.07</probability>
</response>
