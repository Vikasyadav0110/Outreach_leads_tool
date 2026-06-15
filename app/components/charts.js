"use client";

import { useEffect, useId, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
} from "recharts";

// Colors live in a plain (non-client) module so server pages can import them too.
import { CHART, SERIES } from "./chartColors";

const axisTick = { fontSize: 11, fill: "#6b7280" };
const tooltipStyle = { fontSize: 12, borderRadius: 8, border: "1px solid #eee", padding: "6px 10px" };
const Tip = (p) => <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.04)" }} {...p} />;

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

// Reserves the height on SSR; mounts the (client-only) chart after hydration so
// Recharts always measures a real width — no width(0) warnings, no mismatch.
function ChartFrame({ height = 256, children }) {
  const mounted = useMounted();
  return (
    <div style={{ width: "100%", height }}>
      {mounted ? (
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

function Empty({ height = 256 }) {
  return (
    <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>
      No data yet.
    </div>
  );
}

// ---- KPI tile (no chart) ----
const TONE = {
  ink: "text-ink",
  accent: "text-accent",
  accent2: "text-accent2",
  success: "text-success",
  warning: "text-warning",
  violet: "text-violet-700",
};

export function KpiCard({ label, value, sub, tone = "ink" }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold tracking-tight ${TONE[tone] || TONE.ink}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium text-muted">{label}</div>
      {sub != null && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

// ---- Card wrapper for consistent chart headers / alignment ----
export function ChartCard({ title, right, children, className = "" }) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---- Donut + legend ----
export function DonutChart({ data, height = 165 }) {
  const shown = (data || []).filter((d) => d.value > 0);
  if (shown.length === 0) return <Empty height={height} />;
  return (
    <div>
      <ChartFrame height={height}>
        <PieChart>
          <Pie data={shown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">
            {shown.map((d, i) => (
              <Cell key={i} fill={d.color || SERIES[i % SERIES.length]} />
            ))}
          </Pie>
          <Tip />
        </PieChart>
      </ChartFrame>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color || SERIES[i % SERIES.length] }} />
            {d.name} <span className="font-medium text-ink">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- Horizontal bars ----
export function HBarChart({ data, color = CHART.accent, height = 195 }) {
  if (!data || data.length === 0) return <Empty height={height} />;
  return (
    <ChartFrame height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 18, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#f0f0f0" />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={112} tick={axisTick} axisLine={false} tickLine={false} />
        <Tip />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ChartFrame>
  );
}

// ---- Area trend (time series) ----
export function AreaTrendChart({ data, color = CHART.accent, height = 195 }) {
  const gid = useId().replace(/[:]/g, "");
  if (!data || data.length === 0) return <Empty height={height} />;
  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 10, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
        <Tip />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gid})`} />
      </AreaChart>
    </ChartFrame>
  );
}

// ---- Funnel (name + value labels) ----
export function FunnelChartC({ data, height = 225 }) {
  const colored = (data || []).map((d, i) => ({ ...d, fill: SERIES[i % SERIES.length] }));
  if (colored.length === 0 || colored[0].value === 0) return <Empty height={height} />;
  return (
    <ChartFrame height={height}>
      <FunnelChart margin={{ left: 4, right: 90, top: 4, bottom: 4 }}>
        <Tip />
        <Funnel dataKey="value" data={colored} isAnimationActive>
          <LabelList position="right" dataKey="name" stroke="none" fill="#374151" fontSize={12} />
          <LabelList position="left" dataKey="value" stroke="none" fill="#374151" fontSize={12} />
        </Funnel>
      </FunnelChart>
    </ChartFrame>
  );
}
