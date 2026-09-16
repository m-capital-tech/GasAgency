"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactINR, formatNumber } from "@/lib/format";

const PALETTE = ["#F26B1D", "#2F6FED", "#1E9E5A", "#9A6B00", "#6A3FC7", "#0E8A8A"];

function TooltipBox({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span> <span className="font-semibold tabular-nums">{money && p.dataKey !== "orders" && p.dataKey !== "delivered" ? formatCompactINR(p.value) : formatNumber(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function OrdersAreaChart({ data, height = 220, keys = [{ key: "orders", name: "Orders", color: "#F26B1D" }] }: { data: any[]; height?: number; keys?: { key: string; name: string; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -18, right: 6, top: 8, bottom: 0 }}>
        <defs>
          {keys.map((k) => (
            <linearGradient key={k.key} id={`g-${k.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={k.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={k.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: "var(--border)" }} />
        {keys.map((k) => (
          <Area key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={k.color} strokeWidth={2} fill={`url(#g-${k.key})`} dot={false} activeDot={{ r: 4 }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MoneyBarChart({ data, dataKey = "revenue", name = "Revenue", height = 220, color = "#2F6FED" }: { data: any[]; dataKey?: string; name?: string; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -10, right: 6, top: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactINR(v)} width={64} />
        <Tooltip content={<TooltipBox money />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 200, nameKey = "name", valueKey = "qty" }: { data: any[]; height?: number; nameKey?: string; valueKey?: string }) {
  const total = data.reduce((s, d) => s + (d[valueKey] ?? 0), 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={height} height={height}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={height * 0.3} outerRadius={height * 0.45} paddingAngle={3} strokeWidth={0}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d[nameKey]} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 truncate text-muted-foreground">{d[nameKey]}</span>
            <span className="font-semibold tabular-nums">{formatNumber(d[valueKey])}</span>
            <span className="w-9 text-right text-faint">{total ? Math.round((d[valueKey] / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBarList({ data, nameKey, valueKey, money }: { data: any[]; nameKey: string; valueKey: string; money?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d[nameKey]} className="text-xs">
          <div className="mb-1 flex justify-between">
            <span className="font-medium">{d[nameKey]}</span>
            <span className="tabular-nums text-muted-foreground">{money ? formatCompactINR(d[valueKey]) : formatNumber(d[valueKey])}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full" style={{ width: `${(d[valueKey] / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
