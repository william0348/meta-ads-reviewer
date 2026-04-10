/**
 * DashboardLayout — Sidebar Navigation with Theme Toggle
 *
 * Supports both light and dark modes with a toggle button.
 * Font: Space Grotesk for headings, Inter for body.
 */

import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Settings,
  Users,
  AlertTriangle,
  Menu,
  Shield,
  Sun,
  Moon,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  Loader2,
  Timer,
  Building2,
} from "lucide-react";
import { useDashboardData } from "@/contexts/DashboardDataContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  {
    path: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "被拒登廣告總覽",
  },
  {
    path: "/accounts",
    label: "帳號管理",
    icon: Users,
    description: "管理廣告帳號",
  },
  {
    path: "/organization",
    label: "公司管理",
    icon: Building2,
    description: "管理公司成員",
  },
  {
    path: "/settings",
    label: "設定",
    icon: Settings,
    description: "API Token 設定",
  },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, user, logout } = useAuth();
  const { loading, batchProgress, autoRefreshInterval, ads } = useDashboardData();
  const orgQuery = trpc.org.my.useQuery(undefined, { enabled: isAuthenticated, retry: false, refetchOnWindowFocus: false });

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-50 h-screen w-64
          bg-sidebar border-r border-sidebar-border
          flex flex-col transition-transform duration-300 ease-out
          lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo area */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-sidebar-foreground tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Ads Reviewer
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Meta Marketing API
              </p>
            </div>
          </div>
        </div>

        {/* Background loading indicator */}
        {loading && location !== "/" && (
          <div className="mx-3 mt-3 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-2 text-xs text-primary">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="font-medium">背景載入中...</span>
            </div>
            {batchProgress && (
              <div className="mt-1.5">
                <div className="text-[10px] text-muted-foreground">
                  {batchProgress.completed}/{batchProgress.total} 帳號
                  {ads.length > 0 && ` · ${ads.length} 廣告`}
                </div>
                <div className="mt-1 h-1 rounded-full bg-primary/10 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${(batchProgress.completed / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Auto-refresh indicator in sidebar */}
        {!loading && autoRefreshInterval && location !== "/" && (
          <div className="mx-3 mt-3 px-2.5 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
            <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400">
              <Timer className="w-3 h-3 shrink-0" />
              <span>自動刷新：每 {autoRefreshInterval} 分鐘</span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <motion.div
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                    transition-colors duration-150 group relative
                    ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                    }
                  `}
                  onClick={() => setSidebarOpen(false)}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-primary' : ''}`} />
                  <div>
                    <span className="font-medium">{item.label}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Footer with theme toggle */}
        <div className="p-4 border-t border-sidebar-border space-y-3">
          {/* Theme toggle */}
          {toggleTheme && (
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            >
              {theme === "dark" ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
              <span className="font-medium">
                {theme === "dark" ? "切換淺色模式" : "切換深色模式"}
              </span>
            </button>
          )}
          {isAuthenticated ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-green-600 dark:text-green-400 px-1">
                <Cloud className="w-3.5 h-3.5" />
                <span>
                  {orgQuery.data ? `${orgQuery.data.orgName} · 已同步` : '已登入 · Token 已同步至雲端'}
                </span>
              </div>
              <button
                onClick={() => logout()}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
              >
                <LogOut className="w-[18px] h-[18px]" />
                <span className="font-medium">登出 ({user?.name || user?.email || 'User'})</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400 px-1">
                <CloudOff className="w-3.5 h-3.5" />
                <span>Token 資料僅存於瀏覽器</span>
              </div>
              <a
                href={getLoginUrl()}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
              >
                <LogIn className="w-[18px] h-[18px]" />
                <span className="font-medium">登入以同步至雲端</span>
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 text-foreground">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl flex items-center justify-between px-4">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="mr-3"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm" style={{ fontFamily: 'var(--font-display)' }}>
                Ads Reviewer
              </span>
            </div>
          </div>
          {toggleTheme && (
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
