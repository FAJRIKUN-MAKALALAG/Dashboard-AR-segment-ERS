import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import axios from 'axios'
import clsx from 'clsx'
import {
  DollarSign, CheckCircle2, AlertTriangle, TrendingDown, Building2,
  RefreshCw, LogIn, Download, Search, Filter,
  ChevronDown, ChevronRight, Wifi, WifiOff, Calendar, Database,
  Layers, BarChart3, FileText, Users, ArrowRight, Circle
} from 'lucide-react'
import './App.css'

// ── API Config ───────────────────────────────────────────────────────
const LARAVEL_API    = 'http://localhost:8001/api/v1/ar-dashboard'
const DEV_TOKEN_URL  = 'http://localhost:8001/api/v1/dev-token'
const PYTHON_API     = 'http://localhost:8000/internal/v1'
const TABLES_API     = 'http://localhost:8001/api/v1/tables'
const POLL_MS        = 15_000

// ── Empty State ──────────────────────────────────────────────────────
const EMPTY = {
  summary: {
    total_ar_m: 0, total_layak_tagih_m: 0, total_tidak_layak_m: 0,
    total_bermasalah_m: 0, over_due_m: 0, overdue_pct: 0, dso: 0,
    largest_segment: '-', as_of_date: '', total_records: 0,
    active_filters: { month: 'ALL', segment: 'ALL', region: 'ALL' }
  },
  charts: {
    age_analysis: {}, segment_breakdown: {}, category_breakdown: {},
    region_breakup: [], ar_flow: {}, history_trend: {},
    cash_inflow: [], trend_t13m: [],
    sparkline_overdue_pct: [], sparkline_dso: [], sparkline_months: []
  },
  action_plan: [],
  top_customers: [],
  data: []
}

// ── Palette ──────────────────────────────────────────────────────────
const C = {
  green:   '#22c55e',
  emerald: '#10b981',
  blue:    '#3b82f6',
  indigo:  '#6366f1',
  amber:   '#f59e0b',
  red:     '#ef4444',
  rose:    '#f43f5e',
  slate:   '#64748b',
  teal:    '#14b8a6',
  violet:  '#8b5cf6',
}

const PALETTE = [C.blue, C.emerald, C.amber, C.violet, C.teal, C.rose, C.indigo]

// ── Formatters ───────────────────────────────────────────────────────
const fmtM   = (v, dec = 2) => `${Number(v ?? 0).toFixed(dec)} M`
const fmtB   = (v) => `Rp ${Number(v ?? 0).toFixed(2)} M`
const fmtNum = (v) => new Intl.NumberFormat('id-ID').format(Math.round(Number(v ?? 0)))
const fmtPct = (v) => `${Number(v ?? 0).toFixed(1)}%`

// ── Sparkline ────────────────────────────────────────────────────────
function Sparkline({ data, color = C.blue }) {
  if (!data?.length) return null
  const W = 90, H = 28
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color, spark, sparkColor }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl" style={{ background: color + '18' }}>
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400 font-medium">{sub}</div>}
      {spark && (
        <div className="mt-1">
          <Sparkline data={spark} color={sparkColor ?? color} />
        </div>
      )}
    </div>
  )
}

// ── Filter Select ────────────────────────────────────────────────────
function FilterSelect({ label, value, options, onChange, icon: Icon }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon size={14} className="text-slate-400" />}
      <label className="text-xs text-slate-500 font-semibold whitespace-nowrap">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer hover:border-blue-300 transition"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── AR Flow Panel ────────────────────────────────────────────────────
function ArFlowPanel({ flow, onSelectFilter, activeFilter }) {
  const [expanded, setExpanded] = useState({ jakarta: true, regional: false })
  
  if (!flow?.total_m) return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-center min-h-48 text-slate-400 text-sm animate-pulse">
      AR Flow: memuat data...
    </div>
  )

  const total      = flow.total_m || 0
  const tidakLayak = flow.tidak_layak_m || 0
  const layak      = flow.layak_tagih_m || 0
  const bermasalah = flow.bermasalah_m || 0
  const jakarta    = flow.jakarta || {}
  const regional   = flow.regional || {}

  const BELUM_CATS  = ['KONTRAK', 'BAST/BAPP', 'REKON/SLG', 'TERMYN', 'PROSES IDENTIFIKASI', 'KOREKSI', 'CHECKER']
  const SUDAH_CATS  = ['SUDAH INVOICE']
  const cats        = flow.jakarta?.categories || {}

  const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0%'

  const isNodeActive = (type, value = null) => {
    if (!activeFilter) return false
    if (activeFilter.type !== type) return false
    if (value !== null && activeFilter.value !== value) return false
    return true
  }

  const FlowBox = ({ label, value, color, children, expandKey, filterType, filterVal }) => {
    const isAct = filterType ? isNodeActive(filterType, filterVal) : false
    const clickable = !!filterType

    return (
      <div className="flex flex-col gap-1.5 w-full">
        <div
          className={clsx(
            "flex items-center justify-between px-3 py-2.5 rounded-xl text-white text-xs font-bold select-none transition-all duration-300",
            clickable ? "cursor-pointer hover:scale-[1.015] hover:brightness-105 active:scale-95" : "",
            isAct ? "ring-4 ring-offset-2 shadow-lg" : "shadow-sm"
          )}
          style={{ 
            background: color,
            '--tw-ring-color': color,
          }}
          onClick={(e) => {
            if (clickable && onSelectFilter) {
              onSelectFilter({ type: filterType, value: filterVal, label })
            }
            if (expandKey) {
              setExpanded(s => ({ ...s, [expandKey]: !s[expandKey] }))
            }
          }}
        >
          <span className="flex items-center gap-2">
            {expandKey && (expanded[expandKey] ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
            {label}
            {isAct && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <span>{fmtM(value)}</span>
            <span className="opacity-75 text-[10px]">({pct(value)})</span>
          </div>
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-4 relative overflow-hidden">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Layers size={16} className="text-blue-500" />
          AR Receivable Flow
        </h3>
        {activeFilter && (
          <button 
            onClick={() => onSelectFilter(null)}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-lg transition"
          >
            Reset Filter
          </button>
        )}
      </div>

      <p className="text-[10px] text-slate-400 font-medium -mt-2">
        💡 Klik pada kotak alur untuk memfilter tabel detail secara langsung.
      </p>

      {/* Total */}
      <div 
        onClick={() => onSelectFilter(null)}
        className={clsx(
          "flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800 text-white text-sm font-bold cursor-pointer transition-all duration-300 hover:brightness-110",
          !activeFilter ? "ring-4 ring-offset-2 ring-slate-800" : ""
        )}
      >
        <span>Total AR</span>
        <span>{fmtM(total)}</span>
      </div>

      <div className="flex gap-3 ml-4">
        <div className="w-0.5 bg-slate-100 self-stretch" />
        <div className="flex-1 flex flex-col gap-3">

          {/* Tidak Layak */}
          <FlowBox 
            label="AR Tidak Layak Tagih" 
            value={tidakLayak} 
            color={C.red} 
            filterType="status_tagih" 
            filterVal="AR TIDAK LAYAK TAGIH" 
          />

          {/* Bermasalah */}
          <FlowBox 
            label="AR Bermasalah" 
            value={bermasalah} 
            color={C.amber} 
            filterType="status_tagih" 
            filterVal="AR BERMASALAH" 
          />

          {/* Layak */}
          <FlowBox 
            label="AR Layak Tagih" 
            value={layak} 
            color={C.emerald} 
            expandKey="layak"
            filterType="status_tagih"
            filterVal="AR LAYAK TAGIH"
          >
            {expanded.layak !== false && (
              <div className="flex gap-3 ml-4 mt-1">
                <div className="w-0.5 bg-slate-100 self-stretch" />
                <div className="flex-1 flex flex-col gap-3">

                  {/* Regional */}
                  <FlowBox 
                    label="Regional" 
                    value={regional.total_m || 0} 
                    color={C.teal} 
                    expandKey="regional"
                    filterType="region_not_jakarta"
                  >
                    {expanded.regional && regional.breakdown && (
                      <div className="ml-4 flex flex-col gap-1.5 mt-1">
                        {Object.entries(regional.breakdown).map(([name, v]) => {
                          const isAct = isNodeActive('regional_name', name)
                          return (
                            <div 
                              key={name} 
                              onClick={() => onSelectFilter({ type: 'regional_name', value: name, label: `Region: ${name}` })}
                              className={clsx(
                                "flex justify-between text-xs px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer transition-all hover:bg-teal-100",
                                isAct ? "bg-teal-200 text-teal-900 font-bold border-l-4 border-teal-600" : "bg-teal-50 text-teal-800"
                              )}
                            >
                              <span>{name}</span><span>{fmtM(v)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </FlowBox>

                  {/* Jakarta */}
                  <FlowBox 
                    label="Jakarta" 
                    value={jakarta.total_m || 0} 
                    color={C.indigo} 
                    expandKey="jakarta"
                    filterType="region_jakarta"
                  >
                    {expanded.jakarta && (
                      <div className="flex gap-3 ml-4 mt-1">
                        <div className="w-0.5 bg-slate-100 self-stretch" />
                        <div className="flex-1 flex flex-col gap-3">

                          {/* Sudah Invoice */}
                          <FlowBox 
                            label="Sudah Invoiced" 
                            value={jakarta.sudah_invoice_m || 0} 
                            color={C.blue}
                            filterType="jakarta_status_invoice"
                            filterVal="SUDAH INVOICE"
                          >
                            {SUDAH_CATS.filter(c => cats[c] > 0).map(c => {
                              const isAct = isNodeActive('invoice_status', c)
                              return (
                                <div 
                                  key={c}
                                  onClick={() => onSelectFilter({ type: 'invoice_status', value: c, label: c })}
                                  className={clsx(
                                    "flex justify-between text-xs px-2.5 py-1.5 rounded-lg font-semibold ml-4 cursor-pointer transition-all hover:bg-blue-100",
                                    isAct ? "bg-blue-200 text-blue-900 font-bold border-l-4 border-blue-600" : "bg-blue-50 text-blue-800"
                                  )}
                                >
                                  <span>{c}</span><span>{fmtM(cats[c])}</span>
                                </div>
                              )
                            })}
                          </FlowBox>

                          {/* Belum Invoice */}
                          <FlowBox 
                            label="Belum Invoiced" 
                            value={jakarta.belum_invoice_m || 0} 
                            color={C.violet}
                            filterType="jakarta_status_invoice"
                            filterVal="BELUM INVOICE"
                          >
                            {BELUM_CATS.filter(c => cats[c] > 0).map(c => {
                              const isAct = isNodeActive('invoice_status', c)
                              return (
                                <div 
                                  key={c}
                                  onClick={() => onSelectFilter({ type: 'invoice_status', value: c, label: c })}
                                  className={clsx(
                                    "flex justify-between text-xs px-2.5 py-1.5 rounded-lg font-semibold ml-4 cursor-pointer transition-all hover:bg-violet-100",
                                    isAct ? "bg-violet-200 text-violet-900 font-bold border-l-4 border-violet-600" : "bg-violet-50 text-violet-800"
                                  )}
                                >
                                  <span>{c}</span><span>{fmtM(cats[c])}</span>
                                </div>
                              )
                            })}
                          </FlowBox>

                        </div>
                      </div>
                    )}
                  </FlowBox>

                </div>
              </div>
            )}
          </FlowBox>

        </div>
      </div>
    </div>
  )
}


// ── Action Plan Table ─────────────────────────────────────────────────
function ActionPlanTable({ rows }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
      <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 tracking-tight">
        <FileText size={16} className="text-amber-500" />
        Action Plan & UIC
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 font-bold">
              <th className="pb-2 pr-3">Kategori</th>
              <th className="pb-2 px-2 text-right">Nilai (M)</th>
              <th className="pb-2 px-2">UIC</th>
              <th className="pb-2 px-2">Tindak Lanjut</th>
              <th className="pb-2 pl-2 text-center">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {(rows?.length ? rows : []).map((row, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                <td className="py-2.5 pr-3">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background: row.kategori === 'AR TIDAK LAYAK TAGIH' ? '#fef2f2' : row.kategori === 'SUDAH INVOICE' ? '#eff6ff' : '#f5f3ff',
                      color: row.kategori === 'AR TIDAK LAYAK TAGIH' ? '#dc2626' : row.kategori === 'SUDAH INVOICE' ? '#1d4ed8' : '#7c3aed'
                    }}>
                    {row.kategori}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right font-bold text-slate-700">{fmtM(row.nilai_m)}</td>
                <td className="py-2.5 px-2 text-slate-600 font-medium">{row.uic}</td>
                <td className="py-2.5 px-2 text-slate-500">{row.tindak_lanjut}</td>
                <td className="py-2.5 pl-2 text-center">
                  <span className="inline-block bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{row.due_date}</span>
                </td>
              </tr>
            ))}
            {!rows?.length && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400 text-xs">Tidak ada data action plan</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Historical Trend Chart ────────────────────────────────────────────
function HistoryTrendChart({ history }) {
  const entries = Object.entries(history || {})
  if (!entries.length) return null

  const months  = entries.map(([m]) => m)
  const maxVal  = Math.max(...entries.flatMap(([, v]) => [v.total_m || 0]), 1)
  const barW    = Math.min(80, Math.floor(480 / entries.length) - 8)

  const SERIES  = [
    { key: 'layak_m',       label: 'Layak Tagih',       color: C.emerald },
    { key: 'bermasalah_m',  label: 'Bermasalah',         color: C.amber },
    { key: 'tidak_layak_m', label: 'Tidak Layak Tagih', color: C.red },
  ]

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 tracking-tight">
          <BarChart3 size={16} className="text-indigo-500" />
          Tren Historis AR per Bulan
        </h3>
        <div className="flex gap-3">
          {SERIES.map(s => (
            <div key={s.key} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
              <div className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${entries.length * (barW + 12) + 40} 200`} className="w-full" style={{ minHeight: 160 }}>
          {entries.map(([month, vals], mi) => {
            const x0 = 30 + mi * (barW + 12)
            let stackY = 180
            return (
              <g key={month}>
                {SERIES.map(s => {
                  const v  = vals[s.key] || 0
                  const h  = (v / maxVal) * 140
                  const y  = stackY - h
                  stackY   = y
                  return (
                    <rect key={s.key} x={x0} y={y} width={barW} height={h}
                      fill={s.color} rx="2" opacity="0.85">
                      <title>{s.label}: {fmtM(v)}</title>
                    </rect>
                  )
                })}
                <text x={x0 + barW / 2} y="196" textAnchor="middle"
                  fontSize="7" fill="#94a3b8" fontWeight="bold">
                  {month.substring(0, 7)}
                </text>
                <text x={x0 + barW / 2} y={stackY - 4} textAnchor="middle"
                  fontSize="7" fill="#475569" fontWeight="bold">
                  {fmtM(vals.total_m || 0)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ── Segment Breakdown Bar Chart ───────────────────────────────────────
function SegmentBreakdown({ data }) {
  const entries = Object.entries(data || {}).filter(([, v]) => v > 0)
  if (!entries.length) return null
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 tracking-tight">
        <Layers size={16} className="text-violet-500" />
        AR per Segmen PENGELOLAAN
      </h3>
      <div className="flex flex-col gap-2">
        {entries.sort(([, a], [, b]) => b - a).map(([seg, val], i) => {
          const pct = (val / max) * 100
          return (
            <div key={seg} className="flex items-center gap-3">
              <div className="w-16 text-right text-xs font-bold text-slate-600">{seg}</div>
              <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 flex items-center pl-2"
                  style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }}
                >
                  <span className="text-[10px] text-white font-bold truncate">{fmtM(val)}</span>
                </div>
              </div>
              <div className="text-xs text-slate-400 font-semibold w-12 text-right">{fmtPct(pct)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Detail Table ──────────────────────────────────────────────────────
function DetailTable({ rows, onExport, activeFlowFilter, onClearFlowFilter }) {
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const PAGE_SIZE = 25

  const filtered = useMemo(() => {
    let result = rows || []

    // Apply active flow filter
    if (activeFlowFilter) {
      const { type, value } = activeFlowFilter
      const cleanVal = (v) => String(v ?? '').toLowerCase().trim()
      
      if (type === 'status_tagih') {
        result = result.filter(r => r.status_tagih === value)
      } else if (type === 'region_jakarta') {
        result = result.filter(r => r.status_tagih === 'AR LAYAK TAGIH' && cleanVal(r.region) === 'jakarta')
      } else if (type === 'region_not_jakarta') {
        result = result.filter(r => r.status_tagih === 'AR LAYAK TAGIH' && cleanVal(r.region) !== 'jakarta')
      } else if (type === 'jakarta_status_invoice') {
        result = result.filter(r => 
          r.status_tagih === 'AR LAYAK TAGIH' && 
          cleanVal(r.region) === 'jakarta' && 
          r.status_invoice === value
        )
      } else if (type === 'invoice_status') {
        result = result.filter(r => r.invoice_status === value)
      } else if (type === 'regional_name') {
        result = result.filter(r => 
          r.status_tagih === 'AR LAYAK TAGIH' && 
          cleanVal(r.region) !== 'jakarta' && 
          r.region === value
        )
      }
    }

    // Apply search query
    const q = search.toLowerCase()
    return result.filter(r =>
      !q ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.pengelolaan || '').toLowerCase().includes(q) ||
      (r.region || '').toLowerCase().includes(q) ||
      (r.invoice_status || '').toLowerCase().includes(q) ||
      (r.status_tagih || '').toLowerCase().includes(q) ||
      (r.bp_num || '').toLowerCase().includes(q) ||
      (r.nipnas || '').toLowerCase().includes(q)
    )
  }, [rows, search, activeFlowFilter])

  const pages    = Math.ceil(filtered.length / PAGE_SIZE) || 1
  const sliced   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const COLS = [
    { key: 'customer_name',  label: 'Nama Pelanggan' },
    { key: 'bp_num',         label: 'BP Num' },
    { key: 'nipnas',         label: 'NIPNAS' },
    { key: 'pengelolaan',    label: 'Segmen' },
    { key: 'region',         label: 'Area' },
    { key: 'witel',          label: 'Witel' },
    { key: 'invoice_status', label: 'Kategori' },
    { key: 'status_tagih',   label: 'Status Tagih' },
    { key: 'aging_category', label: 'Aging' },
    { key: 'nilai_m',        label: 'Nilai (M)', right: true },
    { key: 'uic',            label: 'UIC' },
    { key: 'report_month',   label: 'Periode' },
  ]

  const statusColor = (s) => {
    if (s === 'AR LAYAK TAGIH')       return { bg: '#f0fdf4', text: '#16a34a' }
    if (s === 'AR TIDAK LAYAK TAGIH') return { bg: '#fef2f2', text: '#dc2626' }
    return { bg: '#fffbeb', text: '#d97706' }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
      {/* Active Flow Filter Badge */}
      {activeFlowFilter && (
        <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-100 px-4 py-2.5 rounded-xl text-xs font-semibold text-blue-800">
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Flow Filter Aktif</span>
            <span>Menampilkan data untuk: <strong className="underline">{activeFlowFilter.label}</strong></span>
          </div>
          <button 
            onClick={onClearFlowFilter}
            className="text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800 transition"
          >
            [ Hapus Filter ]
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 tracking-tight">
          <Users size={16} className="text-slate-500" />
          Data Detail Akun
          <span className="ml-1 text-xs font-medium text-slate-400">({filtered.length.toLocaleString()} records)</span>
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, segmen, area..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 w-52"
            />
          </div>
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
          >
            <Download size={12} />
            Export CSV
          </button>
        </div>
      </div>


      <div className="overflow-x-auto flex-1">
        <table className="w-full text-xs text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b-2 border-slate-100 text-slate-400 font-bold text-[10px] uppercase tracking-wide">
              {COLS.map(c => (
                <th key={c.key} className={clsx('py-2 px-2 whitespace-nowrap', c.right && 'text-right')}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sliced.map((row, i) => {
              const sc = statusColor(row.status_tagih)
              return (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="py-2 px-2 font-medium text-slate-800 max-w-[200px] truncate">{row.customer_name || '-'}</td>
                  <td className="py-2 px-2 text-slate-500">{row.bp_num || '-'}</td>
                  <td className="py-2 px-2 text-slate-500">{row.nipnas || '-'}</td>
                  <td className="py-2 px-2">
                    <span className="inline-block px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded font-bold text-[10px]">{row.pengelolaan || '-'}</span>
                  </td>
                  <td className="py-2 px-2 text-slate-600">{row.region || '-'}</td>
                  <td className="py-2 px-2 text-slate-500 truncate max-w-[100px]">{row.witel || '-'}</td>
                  <td className="py-2 px-2">
                    <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">{row.invoice_status || '-'}</span>
                  </td>
                  <td className="py-2 px-2">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: sc.bg, color: sc.text }}>
                      {row.status_tagih || '-'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-slate-500 whitespace-nowrap">{row.aging_category || '-'}</td>
                  <td className="py-2 px-2 text-right font-bold text-slate-700">{Number(row.nilai_m || 0).toFixed(4)}</td>
                  <td className="py-2 px-2 text-slate-500 truncate max-w-[80px]">{row.uic || '-'}</td>
                  <td className="py-2 px-2 text-slate-400 whitespace-nowrap">{row.report_month || '-'}</td>
                </tr>
              )
            })}
            {!sliced.length && (
              <tr><td colSpan={COLS.length} className="py-8 text-center text-slate-400">Tidak ada data</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
        <span>Hal {page} dari {pages} ({filtered.length.toLocaleString()} total)</span>
        <div className="flex gap-1">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition">Prev</button>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 rounded border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition">Next</button>
        </div>
      </div>
    </div>
  )
}

// ── DB Manager (unchanged) ────────────────────────────────────────────
function DbManagerView({ token, onDataChanged }) {
  const TABLES = Object.keys({ AR_SEGMEN_ERS_TBL: 1, AR_CASH_INFLOW_FORECAST_TBL: 1, AR_TREND_T13M_TBL: 1, AR_METRICS_HISTORY_TBL: 1, AR_TOP_CUSTOMERS_TBL: 1 })
  const [table, setTable]   = useState(TABLES[0])
  const [data, setData]     = useState([])
  const [pk, setPk]         = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]       = useState('')

  const load = useCallback(async (t) => {
    setLoading(true)
    try {
      const r = await axios.get(`${TABLES_API}/${t}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      setData(r.data?.data ?? [])
      setPk(r.data?.primary_key ?? '')
    } catch { setMsg('Gagal load tabel.') }
    setLoading(false)
  }, [token])

  useEffect(() => { load(table) }, [table, load])

  const deleteRow = async (idVal) => {
    if (!window.confirm(`Delete row ${idVal}?`)) return
    try {
      await axios.delete(`${TABLES_API}/${table}/${idVal}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      setMsg('Deleted.'); load(table); onDataChanged()
    } catch { setMsg('Delete gagal.') }
  }

  const cols = data.length ? Object.keys(data[0]) : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        {TABLES.map(t => (
          <button key={t} onClick={() => { setTable(t); setMsg('') }}
            className={clsx('px-3 py-1.5 text-xs font-bold rounded-lg border transition', table === t ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
            {t.replace('AR_', '').replace('_TBL', '')}
          </button>
        ))}
      </div>
      {msg && <div className="text-xs bg-blue-50 text-blue-700 px-3 py-2 rounded-lg font-semibold">{msg}</div>}
      {loading ? (
        <div className="text-center text-slate-400 py-12 text-sm">Loading...</div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold bg-slate-50">
                <th className="py-2 px-3">Actions</th>
                {cols.map(c => <th key={c} className="py-2 px-3 text-left uppercase tracking-wide">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 200).map((row, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="py-1.5 px-3">
                    <button onClick={() => deleteRow(row[pk])}
                      className="text-red-400 hover:text-red-600 font-bold transition text-[10px]">DEL</button>
                  </td>
                  {cols.map(c => (
                    <td key={c} className="py-1.5 px-3 text-slate-700 max-w-[120px] truncate">{String(row[c] ?? '-')}</td>
                  ))}
                </tr>
              ))}
              {!data.length && (
                <tr><td colSpan={cols.length + 1} className="py-8 text-center text-slate-400">Tabel kosong</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {data.length > 200 && <div className="text-xs text-slate-400 text-center">Menampilkan 200 / {data.length} baris</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════════════ */
export default function App() {
  const [dashData,        setDashData]        = useState(EMPTY)
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [lastUpdated,     setLastUpdated]     = useState(null)

  // Auth
  const [authEmail,       setAuthEmail]       = useState(localStorage.getItem('auth_email') ?? 'demo@arsystem.local')
  const [authToken,       setAuthToken]       = useState(localStorage.getItem('auth_token') ?? '')
  const [showLogin,       setShowLogin]       = useState(!localStorage.getItem('auth_token'))
  const [authStatus,      setAuthStatus]      = useState('')

  // Filters (FR-01, FR-02, FR-03)
  const [selectedMonth,   setSelectedMonth]   = useState('ALL')
  const [selectedSegment, setSelectedSegment] = useState('ALL')
  const [selectedRegion,  setSelectedRegion]  = useState('ALL')
  const [availMonths,     setAvailMonths]     = useState([])
  const [availSegments,   setAvailSegments]   = useState([])
  const [availRegions,    setAvailRegions]    = useState([])

  // UI
  const [showDbManager,   setShowDbManager]   = useState(false)
  const [pollingEnabled,  setPollingEnabled]  = useState(true)
  const [flowFilter,      setFlowFilter]      = useState(null)


  // ── Fetch Available Months & Segments ──────────────────────────────
  const fetchMeta = useCallback(async () => {
    try {
      const [mRes, sRes] = await Promise.all([
        axios.get(`${PYTHON_API}/ar-months`),
        axios.get(`${PYTHON_API}/ar-segments`)
      ])
      const months = mRes.data?.months ?? []
      const segs   = sRes.data?.segments ?? []
      setAvailMonths(months)
      setAvailSegments(segs)
    } catch { /* silent */ }
  }, [])

  // ── Fetch Dashboard (FR-04 Cross-filtering) ────────────────────────
  const fetchDashboard = useCallback(async (tokenOverride) => {
    const token = tokenOverride ?? localStorage.getItem('auth_token')
    try {
      const params = new URLSearchParams()
      if (selectedMonth   !== 'ALL') params.append('month',   selectedMonth)
      if (selectedSegment !== 'ALL') params.append('segment', selectedSegment)
      if (selectedRegion  !== 'ALL') params.append('region',  selectedRegion)

      const url = `${LARAVEL_API}?${params.toString()}`
      const res = await axios.get(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (res.data?.success) {
        const payload = res.data.payload ?? EMPTY
        setDashData(payload)
        // Extract regions from data for filter dropdown
        const regions = [...new Set((payload.data || []).map(r => r.region).filter(Boolean))]
        setAvailRegions(regions)
        setError(null)
        setLastUpdated(res.data.timestamp ?? new Date().toISOString())
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyinkronkan data.')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth, selectedSegment, selectedRegion])

  const bootstrapToken = async () => {
    try {
      setAuthStatus('Requesting token...')
      const res = await axios.post(DEV_TOKEN_URL, { email: authEmail, name: authEmail.split('@')[0] || 'demo' })
      const token = res.data?.token ?? ''
      if (!token) throw new Error('Token tidak diterima.')
      localStorage.setItem('auth_token', token)
      localStorage.setItem('auth_email', authEmail)
      setAuthToken(token)
      setShowLogin(false)
      setAuthStatus(`Authenticated as ${res.data?.user?.email ?? authEmail}`)
      await fetchMeta()
      await fetchDashboard(token)
    } catch (err) {
      setAuthStatus(err.response?.data?.message || err.message || 'Gagal mengambil token.')
    }
  }

  const clearToken = () => {
    localStorage.removeItem('auth_token')
    setAuthToken(''); setShowLogin(true)
  }

  useEffect(() => {
    if (!authToken) { setLoading(false); return }
    fetchMeta()
    fetchDashboard()
    const t = setInterval(() => {
      if (pollingEnabled && localStorage.getItem('auth_token')) fetchDashboard()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [authToken, pollingEnabled])

  // Re-fetch when filters change (FR-04 cross-filtering)
  useEffect(() => {
    if (authToken) {
      setFlowFilter(null) // Reset detail flow filter when main parameters change
      fetchDashboard()
    }
  }, [selectedMonth, selectedSegment, selectedRegion])


  // ── Export CSV (FR-11) ─────────────────────────────────────────────
  const exportCsv = () => {
    const rows = dashData.data || []
    if (!rows.length) return
    const cols = Object.keys(rows[0])
    const csv  = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `AR_Data_${selectedMonth}_${selectedSegment}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const { summary, charts, action_plan, top_customers, data } = dashData

  // Month dropdown options
  const monthOpts   = [{ value: 'ALL', label: 'Semua Periode' }, ...availMonths.map(m => ({ value: m, label: m }))]
  const segmentOpts = [{ value: 'ALL', label: 'Semua Segmen' }, ...availSegments.map(s => ({ value: s, label: s }))]
  const regionOpts  = [{ value: 'ALL', label: 'Semua Region' }, ...availRegions.map(r => ({ value: r, label: r }))]

  // ── Donut for region breakup ───────────────────────────────────────
  const donutData   = charts.region_breakup ?? []
  const donutTotal  = donutData.reduce((a, c) => a + c.value, 0) || 1
  let   curAngle    = 0
  const donutSlices = donutData.map((s, i) => {
    const ang = (s.value / donutTotal) * 360
    const res = { ...s, start: curAngle, end: curAngle + ang, color: PALETTE[i % PALETTE.length] }
    curAngle += ang
    return res
  })

  return (
    <div className="min-h-screen bg-[#f1f5f9] font-sans text-slate-800">

      {/* ── Top Status Bar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-white border-b border-slate-200 text-xs sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          {error ? <WifiOff size={13} className="text-red-500" /> : <Wifi size={13} className="text-emerald-500" />}
          <span className={clsx('px-2 py-0.5 rounded-full font-semibold', error ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>
            {error ? 'Error' : 'Oracle Connected'}
          </span>
          {lastUpdated && <span className="text-slate-400">Sync: {new Date(lastUpdated).toLocaleTimeString('id-ID')}</span>}
          {summary.total_records > 0 && (
            <span className="text-slate-400">{summary.total_records.toLocaleString()} records</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPollingEnabled(p => !p)}
            className={clsx('px-2.5 py-1 rounded-full font-bold transition text-[10px]',
              pollingEnabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600')}>
            Polling {pollingEnabled ? 'ON' : 'OFF'}
          </button>
          <button onClick={() => fetchDashboard()} title="Refresh"
            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition">
            <RefreshCw size={12} />
          </button>
          <button onClick={() => setShowDbManager(v => !v)}
            className={clsx('flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full border transition',
              showDbManager ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
            <Database size={11} />
            {showDbManager ? 'Dashboard' : 'DB Manager'}
          </button>
          {authToken ? (
            <button onClick={clearToken}
              className="px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-100 font-bold rounded-full border border-red-100 transition text-[10px]">
              Disconnect
            </button>
          ) : (
            <button onClick={() => setShowLogin(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white font-bold rounded-full transition text-[10px]">
              <LogIn size={11} /> Connect
            </button>
          )}
        </div>
      </div>

      {/* ── Main Container ──────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto p-4 sm:p-6 space-y-6">

        {/* Title + Filter Bar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              AR Dashboard — Segmen ERS
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Periode: <span className="font-semibold text-slate-600">{summary.as_of_date || '-'}</span>
              {summary.active_filters?.segment !== 'ALL' && (
                <span className="ml-2 px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-[10px] font-bold">
                  Segmen: {summary.active_filters?.segment}
                </span>
              )}
            </p>
          </div>

          {/* FR-01, FR-02, FR-03: Filter Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <Filter size={14} className="text-slate-400" />
            <FilterSelect label="Periode" value={selectedMonth}   options={monthOpts}   onChange={v => { setSelectedMonth(v);   setLoading(true) }} icon={Calendar} />
            <FilterSelect label="Segmen"  value={selectedSegment} options={segmentOpts} onChange={v => { setSelectedSegment(v); setLoading(true) }} icon={Layers} />
            <FilterSelect label="Region"  value={selectedRegion}  options={regionOpts}  onChange={v => { setSelectedRegion(v);  setLoading(true) }} icon={Building2} />
          </div>
        </div>

        {showDbManager ? (
          <DbManagerView token={authToken} onDataChanged={fetchDashboard} />
        ) : loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <RefreshCw size={28} className="animate-spin text-blue-500" />
              <span className="text-sm font-medium">Memuat data Oracle...</span>
            </div>
          </div>
        ) : (
          <>
            {/* ── KPI Row (FR-05 Drill-down via detail table) ─────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard
                icon={DollarSign} label="Total AR" color={C.blue}
                value={fmtM(summary.total_ar_m)}
                sub={`${summary.total_records?.toLocaleString() || 0} records`}
              />
              <KpiCard
                icon={CheckCircle2} label="AR Layak Tagih" color={C.emerald}
                value={fmtM(summary.total_layak_tagih_m)}
                sub={`${fmtPct((summary.total_layak_tagih_m / summary.total_ar_m) * 100)} dari total`}
              />
              <KpiCard
                icon={AlertTriangle} label="AR Tidak Layak" color={C.red}
                value={fmtM(summary.total_tidak_layak_m)}
                sub="Dorong DO/Adj Negatif"
              />
              <KpiCard
                icon={TrendingDown} label="AR Bermasalah" color={C.amber}
                value={fmtM(summary.total_bermasalah_m)}
                sub={`Overdue ${fmtPct(summary.overdue_pct)}`}
                spark={charts.sparkline_overdue_pct}
                sparkColor={C.amber}
              />
              <KpiCard
                icon={Building2} label="Segmen Terbesar" color={C.violet}
                value={summary.largest_segment || '-'}
                sub={summary.largest_segment && charts.segment_breakdown?.[summary.largest_segment]
                  ? fmtM(charts.segment_breakdown[summary.largest_segment])
                  : 'berdasarkan AR'}
              />
            </div>

            {/* ── Row 1: AR Flow + Action Plan ─────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ArFlowPanel flow={charts.ar_flow} onSelectFilter={setFlowFilter} activeFilter={flowFilter} />
              <ActionPlanTable rows={action_plan} />
            </div>

            {/* ── Row 2: Segment Breakdown + Region Donut ──────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SegmentBreakdown data={charts.segment_breakdown} />

              {/* Region Donut */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
                <h3 className="text-sm font-bold text-slate-900 mb-4 tracking-tight">Distribusi AR per Region</h3>
                <div className="flex items-center gap-6">
                  <div className="relative w-36 h-36 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      {donutSlices.length ? donutSlices.map((s, i) => {
                        const a1 = s.start * Math.PI / 180, a2 = s.end * Math.PI / 180
                        const x1 = Math.cos(a1) * 10 + 18, y1 = Math.sin(a1) * 10 + 18
                        const x2 = Math.cos(a2) * 10 + 18, y2 = Math.sin(a2) * 10 + 18
                        return (
                          <path key={i}
                            d={`M18,18 L${x1},${y1} A10,10 0 ${s.end - s.start > 180 ? 1 : 0} 1 ${x2},${y2} Z`}
                            fill={s.color} />
                        )
                      }) : <circle cx="18" cy="18" r="10" fill="#e2e8f0" />}
                      <circle cx="18" cy="18" r="6" fill="white" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-slate-600">Region</div>
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    {donutSlices.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                          <span className="font-semibold text-slate-600 truncate max-w-[100px]">{s.region}</span>
                        </div>
                        <span className="font-bold text-slate-700">{fmtM(s.value)}</span>
                      </div>
                    ))}
                    {!donutSlices.length && <div className="text-xs text-slate-400">Belum ada data region</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Row 3: Historical Trend ───────────────────────────── */}
            <HistoryTrendChart history={charts.history_trend} />

            {/* ── Row 4: Top Customers ──────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 tracking-tight">
                <Users size={16} className="text-blue-500" />
                Top Pelanggan (AR Terbesar)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-100 text-slate-400 font-bold text-[10px] uppercase">
                      <th className="pb-2 pr-3">Pelanggan</th>
                      <th className="pb-2 px-2 text-right">Balance (Jt)</th>
                      <th className="pb-2 px-2 text-right">Within Due</th>
                      <th className="pb-2 px-2 text-right">Over Due</th>
                      <th className="pb-2 px-2 text-right">OD%</th>
                      <th className="pb-2 px-2 text-right">Inv Due</th>
                      <th className="pb-2 pl-2">Periode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(top_customers || []).slice(0, 15).map((c, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-2 pr-3 font-medium text-slate-800 max-w-[200px] truncate">{c.customer_name}</td>
                        <td className="py-2 px-2 text-right">
                          <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{fmtNum(c.balance)}</span>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-500">{fmtNum(c.within_due)}</td>
                        <td className="py-2 px-2 text-right font-bold text-red-600">{fmtNum(c.over_due)}</td>
                        <td className="py-2 px-2 text-right">
                          <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-bold',
                            c.overdue_pct > 80 ? 'bg-red-50 text-red-700' : c.overdue_pct > 50 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                            {fmtPct(c.overdue_pct)}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-slate-700">{c.due_invoices}</td>
                        <td className="py-2 pl-2 text-slate-400">{c.report_month}</td>
                      </tr>
                    ))}
                    {!top_customers?.length && (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-400">Tidak ada data pelanggan</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Row 5: Detail Table (FR-08, FR-11) ───────────────── */}
            <DetailTable rows={data} onExport={exportCsv} activeFlowFilter={flowFilter} onClearFlowFilter={() => setFlowFilter(null)} />
          </>
        )}
      </div>

      {/* ── Login Modal ─────────────────────────────────────────────── */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-50 rounded-xl"><Database size={20} className="text-blue-600" /></div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Connect Oracle DB</h2>
                <p className="text-[10px] text-slate-400">Authenticate via Laravel Sanctum</p>
              </div>
            </div>
            <input
              type="email" placeholder="Email demo"
              value={authEmail} onChange={e => setAuthEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button onClick={bootstrapToken}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-sm flex items-center justify-center gap-2">
              <LogIn size={15} />
              Sign In & Load Data
            </button>
            {authStatus && <p className="mt-3 text-xs text-center text-slate-400 font-medium">{authStatus}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
