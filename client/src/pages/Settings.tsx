/**
 * Settings Page — Access Token Configuration
 * 
 * Saves token to both localStorage (for immediate use) and database (for persistence across devices).
 */

import { useState, useEffect } from "react";
import {
  Key,
  Eye,
  EyeOff,
  Check,
  Loader2,
  AlertTriangle,
  Shield,
  Trash2,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  Cloud,
  CloudOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { validateToken } from "@/lib/metaApi";
import {
  getAccessToken,
  setAccessToken,
  getAutoFetch,
  setAutoFetch,
  clearAllSettings,
} from "@/lib/store";
import { useSettingsSync } from "@/hooks/useSettingsSync";

/* ─── Token Guide Component ─── */
function TokenGuide() {
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const toggleSection = (idx: number) => {
    setExpandedSection(expandedSection === idx ? null : idx);
  };

  const sections = [
    {
      title: "Part 1：建立全新的 APP",
      icon: "🔧",
      steps: [
        {
          label: '前往 Meta for Developers 建立新的應用程式',
          detail: '在「你希望應用程式執行哪些工作？」頁面中，選擇「其他」，然後點擊「繼續」。',
          link: { url: 'https://developers.facebook.com/apps/', text: 'Meta for Developers' },
        },
        {
          label: '選擇應用程式類型為「企業商家」',
          detail: '在類型選擇頁面中，選擇「企業商家」，後面填寫 Email 即可完成建立。',
        },
      ],
    },
    {
      title: "Part 2：指派資產與應用程式",
      icon: "🏢",
      steps: [
        {
          label: '回到企業管理平台',
          detail: '前往企業管理平台的設定頁面。',
          link: { url: 'https://business.facebook.com/settings/', text: '企業管理平台設定' },
        },
        {
          label: '新增系統工作人員',
          detail: '在左側選單中找到「系統工作人員」，新增一位系統工作人員。',
        },
        {
          label: '指派資產給系統工作人員',
          detail: '系統工作人員 → 指派資產 → 選擇需要測試的廣告帳號（或全選），給予完整權限。',
        },
        {
          label: '指派應用程式權限',
          detail: '給予完整權限 → 應用程式 → 選擇剛剛新增的應用程式，給予完整權限。',
        },
        {
          label: '在應用程式中新增人員',
          detail: '前往應用程式 → 選擇剛剛建立的應用程式 → 新增人員 → 給予自己完整權限。',
        },
      ],
    },
    {
      title: "Part 3：申請 API 權限並產生 Token",
      icon: "🔑",
      steps: [
        {
          label: '前往圖形 API 測試工具',
          detail: '在 Meta APP 下拉選單中，選擇剛剛新增的 APP（需要有管理員權限）。',
          link: { url: 'https://developers.facebook.com/tools/explorer/', text: 'Graph API Explorer' },
        },
        {
          label: '新增必要的 API 權限',
          detail: '在最下方的「新增權限」中，展開 Events Groups Pages 區塊，勾選以下三個權限：',
          permissions: ['ads_read', 'ads_management', 'business_management'],
        },
        {
          label: '選擇「取得用戶存取權杖」',
          detail: '點擊「取得用戶存取權杖」按鈕。',
        },
        {
          label: '產生 Access Token',
          detail: '點擊藍色的「Generate Access Token」按鈕。會跳出視窗詢問是否授權給所有的目錄及廣告帳號，請按「允許」。完成後按右邊的複製按鈕複製 Token。',
        },
      ],
    },
    {
      title: "Part 4：延長 Token 有效期",
      icon: "⏰",
      important: true,
      steps: [
        {
          label: '上述 Token 只會存活 1 小時，需要延長',
          detail: '前往 Access Token Debugger 工具來延長 Token 的有效時間。',
          link: { url: 'https://developers.facebook.com/tools/debug/accesstoken', text: 'Access Token Debugger' },
        },
        {
          label: '貼上剛剛產生的 Access Token',
          detail: '在頂部的輸入欄位中，貼上剛剛複製的 Access Token，然後點擊「Debug」按鈕。',
        },
        {
          label: '點擊「Extend Access Token」',
          detail: '頁面最下方會出現「Extend Access Token」按鈕，點擊後會產生一組新的 Long-lived Token，有效期約 3 個月。複製這組新的 Token 貼到上方欄位即可。',
        },
      ],
    },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 p-4">
        <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Access Token 完整生成步驟
        </h4>
        <p className="text-xs text-muted-foreground mt-1">
          依照以下 4 個步驟建立並延長你的 Meta Marketing API Access Token
        </p>
      </div>

      {/* Accordion sections */}
      {sections.map((section, idx) => (
        <div
          key={idx}
          className={`rounded-lg border transition-colors ${
            section.important
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30'
              : 'border-border bg-card'
          }`}
        >
          <button
            onClick={() => toggleSection(idx)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/30 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{section.icon}</span>
              <div>
                <span className="text-sm font-medium text-foreground">{section.title}</span>
                {section.important && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
                    <Clock className="w-2.5 h-2.5" />
                    重要
                  </span>
                )}
              </div>
            </div>
            <div className="text-muted-foreground">
              {expandedSection === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {expandedSection === idx && (
            <div className="px-4 pb-4 pt-0 space-y-3">
              <div className="border-t border-border pt-3" />
              {section.steps.map((step, stepIdx) => (
                <div key={stepIdx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {stepIdx + 1}
                    </div>
                    {stepIdx < section.steps.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="pb-3 flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{step.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                    {step.link && (
                      <a
                        href={step.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {step.link.text}
                      </a>
                    )}
                    {'permissions' in step && step.permissions && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {step.permissions.map((perm: string) => (
                          <code key={perm} className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">
                            {perm}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Settings() {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [validating, setValidating] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [userName, setUserName] = useState<string | null>(null);
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(true);

  const { syncTokenToDb, syncAllToDb, isAuthenticated, dbSettings, isLoading } = useSettingsSync();

  // Load token: prefer DB if authenticated, fallback to localStorage
  useEffect(() => {
    if (isLoading) return;
    
    if (isAuthenticated && dbSettings?.accessToken) {
      // DB has token — use it and sync to localStorage
      setToken(dbSettings.accessToken);
      setAccessToken(dbSettings.accessToken);
    } else {
      // Fallback to localStorage
      setToken(getAccessToken());
    }
    setAutoFetchEnabled(getAutoFetch());
  }, [isAuthenticated, dbSettings, isLoading]);

  const handleSaveToken = async () => {
    if (!token.trim()) {
      toast.error("請輸入 Access Token");
      return;
    }

    setValidating(true);
    setTokenStatus("idle");

    const result = await validateToken(token.trim());

    if (result.valid) {
      // Save to localStorage
      setAccessToken(token.trim());
      setTokenStatus("valid");
      setUserName(result.name || null);

      // Also save to database if authenticated
      if (isAuthenticated) {
        await syncTokenToDb(token.trim());
        toast.success(`Token 驗證成功並已同步至雲端！使用者：${result.name}`);
      } else {
        toast.success(`Token 驗證成功！使用者：${result.name}`);
      }
    } else {
      setTokenStatus("invalid");
      toast.error(`Token 驗證失敗：${result.error}`);
    }

    setValidating(false);
  };

  const handleAutoFetchToggle = (checked: boolean) => {
    setAutoFetchEnabled(checked);
    setAutoFetch(checked);
    toast.success(checked ? "已啟用自動抓取帳號" : "已停用自動抓取帳號");
  };

  const handleClearAll = async () => {
    if (confirm("確定要清除所有設定嗎？這將刪除 Access Token 和所有手動帳號。")) {
      clearAllSettings();
      setToken("");
      setTokenStatus("idle");
      setUserName(null);

      // Also clear from DB
      if (isAuthenticated) {
        try {
          await syncAllToDb();
        } catch {
          // ignore
        }
      }

      toast.success("所有設定已清除");
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          設定
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置 Meta Marketing API 連線設定
        </p>
      </div>

      {/* Cloud sync status */}
      {isAuthenticated && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/50 p-3 flex items-center gap-3">
          <Cloud className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-300">雲端同步已啟用</p>
            <p className="text-xs text-muted-foreground">Token 和帳號設定會自動同步至資料庫，跨裝置可用</p>
          </div>
        </div>
      )}

      {!isAuthenticated && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3 flex items-center gap-3">
          <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">僅本地儲存</p>
            <p className="text-xs text-muted-foreground">登入後可將 Token 同步至雲端，跨裝置使用</p>
          </div>
        </div>
      )}

      {/* Token section */}
      <div className="gradient-border p-5 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Access Token
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              輸入你的 Meta Marketing API Access Token。需要 ads_read 權限。
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              placeholder="EAAxxxxxxxx..."
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setTokenStatus("idle");
              }}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Token status */}
          {tokenStatus === "valid" && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
              <Check className="w-4 h-4" />
              <span>Token 有效 {userName && `— ${userName}`}</span>
              {isAuthenticated && (
                <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded">
                  <Cloud className="w-2.5 h-2.5" />
                  已同步
                </span>
              )}
            </div>
          )}
          {tokenStatus === "invalid" && (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Token 無效或已過期</span>
            </div>
          )}

          <Button
            onClick={handleSaveToken}
            disabled={validating || !token.trim()}
            className="w-full gap-1.5"
          >
            {validating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                驗證中...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                驗證並儲存
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Auto-fetch toggle */}
      <div className="gradient-border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950 flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <Label className="text-sm font-medium text-foreground">自動抓取廣告帳號</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                使用 Token 自動取得所有關聯的廣告帳號
              </p>
            </div>
          </div>
          <Switch
            checked={autoFetchEnabled}
            onCheckedChange={handleAutoFetchToggle}
          />
        </div>
      </div>

      {/* Complete Token Guide */}
      <TokenGuide />

      {/* Danger zone */}
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-red-600 dark:text-red-400">清除所有設定</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              刪除 Access Token 和所有手動新增的帳號
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清除
          </Button>
        </div>
      </div>
    </div>
  );
}
