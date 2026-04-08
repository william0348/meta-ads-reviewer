/**
 * DashboardCharts — Two cumulative bar charts for Dashboard
 * 1. Cumulative disapproved ad count by day
 * 2. Cumulative affected spend amount by day
 */

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { DisapprovedAd } from "@/lib/metaApi";

interface DashboardChartsProps {
  ads: DisapprovedAd[];
}

interface DayData {
  date: string;
  dailyCount: number;
  cumulativeCount: number;
  dailySpend: number;
  cumulativeSpend: number;
}

function buildCumulativeData(ads: DisapprovedAd[]): DayData[] {
  if (ads.length === 0) return [];

  // Group ads by date (using updated_time as the disapproval date)
  const dayMap = new Map<string, { count: number; spend: number }>();

  for (const ad of ads) {
    const dateStr = ad.updated_time || ad.created_time;
    if (!dateStr) continue;
    const day = dateStr.slice(0, 10); // YYYY-MM-DD
    const existing = dayMap.get(day) || { count: 0, spend: 0 };
    existing.count++;
    existing.spend += ad.spend_30d ?? 0;
    dayMap.set(day, existing);
  }

  // Sort by date ascending
  const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Build cumulative data
  let cumulativeCount = 0;
  let cumulativeSpend = 0;
  const result: DayData[] = [];

  for (const [date, { count, spend }] of sortedDays) {
    cumulativeCount += count;
    cumulativeSpend += spend;
    result.push({
      date,
      dailyCount: count,
      cumulativeCount,
      dailySpend: spend,
      cumulativeSpend,
    });
  }

  return result;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DayData }>;
  label?: string;
  type: "count" | "spend";
}

function CustomTooltip({ active, payload, label, type }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-popover text-popover-foreground border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {type === "count" ? (
        <>
          <p className="text-muted-foreground">當日新增: <span className="text-foreground font-medium">{data.dailyCount}</span></p>
          <p className="text-rose-500 font-semibold">累計總數: {data.cumulativeCount}</p>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">當日花費: <span className="text-foreground font-medium">${data.dailySpend.toFixed(2)}</span></p>
          <p className="text-amber-500 font-semibold">累計花費: ${data.cumulativeSpend.toFixed(2)}</p>
        </>
      )}
    </div>
  );
}

export default function DashboardCharts({ ads }: DashboardChartsProps) {
  const chartData = useMemo(() => buildCumulativeData(ads), [ads]);

  if (chartData.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Cumulative Ad Count Chart */}
      <div className="gradient-border p-4">
        <h3 className="text-sm font-semibold mb-3 text-foreground">
          累計被拒登廣告數量
        </h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                width={45}
              />
              <Tooltip content={<CustomTooltip type="count" />} />
              <Bar
                dataKey="cumulativeCount"
                fill="hsl(346.8, 77.2%, 49.8%)"
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cumulative Spend Chart */}
      <div className="gradient-border p-4">
        <h3 className="text-sm font-semibold mb-3 text-foreground">
          累計受影響花費金額
        </h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.3} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                width={55}
              />
              <Tooltip content={<CustomTooltip type="spend" />} />
              <Bar
                dataKey="cumulativeSpend"
                fill="hsl(37.7, 92.1%, 50.2%)"
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
