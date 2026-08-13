import { useEffect, useMemo, useState, useCallback } from 'react'
import axios from 'axios'
import clsx from 'clsx'
import {
  DollarSign, CheckCircle2, FileText, AlertTriangle,
  RefreshCw, Power, LogIn, Download, Search,
  ChevronDown, TreePine, LayoutGrid, TableProperties, BarChart3,
  Circle, Wifi, WifiOff,
} from 'lucide-react'
import './App.css'

/* ─────────────────────────────────────────────
   Config
───────────────────────────────────────────── */
const API_URL       = import.meta.env.VITE_LARAVEL_API_URL       ?? 'http://localhost:8001/api/v1/ar-dashboard'
const DEV_TOKEN_URL = import.meta.env.VITE_LARAVEL_DEV_TOKEN_URL ?? 'http://localhost:8001/api/v1/dev-token'
const POLL_MS = 10_000

const TABS = [
  { key: 'mindmap',   Icon: TreePine,        label: 'Diagram Mind-Map AR (XMind)' },
  { key: 'drilldown', Icon: LayoutGrid,       label: 'Cards + Grouped Drill-down Table' },
  { key: 'raw',       Icon: TableProperties,  label: 'Data Transaksi ("Data_AR")' },
  { key: 'analytics', Icon: BarChart3,        label: 'Analitik & Sebaran Chart' },
]

const EMPTY_DATA = {
  summary: { total_ar_m: 0, total_layak_tagih_m: 0, total_tidak_layak_m: 0, total_records: 0 },
  data: [],
}

/* ─────────────────────────────────────────────
   Formatters
───────────────────────────────────────────── */
const fmtM   = (v) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(v ?? 0))
const fmtPct = (v) => `${Math.round(Number(v ?? 0))}%`
const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
const nowTime = () => {
  const n = new Date()
  return `${String(n.getHours()).padStart(2,'0')}.${String(n.getMinutes()).padStart(2,'0')}.${String(n.getSeconds()).padStart(2,'0')}`
}

/* ─────────────────────────────────────────────
   Badge helpers
───────────────────────────────────────────── */
function agingClass(a) {
  if (a === '0-3 bln')  return 'bg-emerald-100 text-emerald-700 border border-emerald-200'
  if (a === '4-12 bln') return 'bg-amber-100 text-amber-700 border border-amber-200'
  return 'bg-red-100 text-red-700 border border-red-200'
}

function statusClass(s) {
  if (s === 'AR LAYAK TAGIH')       return 'bg-green-100 text-green-700 border border-green-200'
  if (s === 'AR TIDAK LAYAK TAGIH') return 'bg-red-100 text-red-700 border border-red-200'
  return 'bg-amber-100 text-amber-700 border border-amber-200'
}

function invoiceClass(s) {
  return s === 'SUDAH INVOICED'
    ? 'bg-blue-100 text-blue-700 border border-blue-200'
    : 'bg-slate-100 text-slate-600 border border-slate-200'
}

function Pill({ label, className }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', className)}>
      {label}
    </span>
  )
}

/* ─────────────────────────────────────────────
   CSV Export
───────────────────────────────────────────── */
function exportCSV(rows) {
  const H = ['Invoice ID','Aging','Status Tagih','Region','Status Invoice','Nilai (M)','UIC','Due Date','Action Plan']
  const body = rows.map((r) =>
    [r.invoice_id, r.aging_category, r.status_tagih, r.region, r.invoice_status,
      r.nilai_m, r.uic, r.due_date, r.action_plan].map((c) => `"${c ?? ''}"`).join(',')
  )
  const blob = new Blob([[H.join(','), ...body].join('\n')], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'ar-data.csv' })
  a.click(); URL.revokeObjectURL(a.href)
}

/* ══════════════════════════════════════════════
   HEADER
══════════════════════════════════════════════ */
function DashHeader({ error, lastUpdated, pollingEnabled, onRefresh, onPollToggle, onSignIn, hasToken }) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
      {/* Brand */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-sm font-black text-white shadow-md">
          AR
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wide text-slate-900">AR SEGMEN ERS</div>
          <div className="text-xs text-slate-500">v1.0 &nbsp;•&nbsp; Oracle DB Real-time</div>
        </div>
      </div>

      {/* Status pill — centre */}
      <div className="mx-auto hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-medium md:flex">
        {error
          ? <WifiOff size={13} className="text-red-500" />
          : <Wifi size={13} className={lastUpdated ? 'text-emerald-500' : 'text-amber-400'} />
        }
        <span className="text-slate-500 uppercase tracking-wider">Status Data Source</span>
        <span className="font-semibold text-slate-800">
          ORACLE DB : {error ? 'Error' : lastUpdated ? 'Connected' : 'Awaiting'}
        </span>
        {lastUpdated && (
          <span className="text-slate-400">— {new Date(lastUpdated).toLocaleTimeString('id-ID')}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          onClick={onPollToggle}
          type="button"
          className={clsx(
            'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all',
            pollingEnabled
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200',
          )}
        >
          <Power size={12} />
          POLLING ({POLL_MS / 1000}S)
        </button>

        <button
          onClick={onRefresh}
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100"
        >
          <RefreshCw size={12} />
          REFRESH DATA
        </button>

        {!hasToken && (
          <button
            onClick={onSignIn}
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:bg-slate-900"
          >
            <LogIn size={12} />
            Sign in
          </button>
        )}
      </div>
    </header>
  )
}

/* ══════════════════════════════════════════════
   KPI CARDS
══════════════════════════════════════════════ */
function KpiTotal({ summary }) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Outstanding</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100">
          <DollarSign size={16} className="text-blue-600" />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-semibold text-slate-500">IDR</span>
        <span className="text-3xl font-black tracking-tight text-slate-900">{fmtM(summary.total_ar_m)}</span>
        <span className="text-lg font-bold text-slate-500">M</span>
      </div>
      <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
        <span>Total Volume: <span className="font-semibold text-slate-700">{summary.total_records} Inv</span></span>
        <span className="font-mono">{nowTime()}</span>
      </div>
    </article>
  )
}

function KpiStatus({ summary }) {
  const layakPct = summary.total_ar_m ? (summary.total_layak_tagih_m / summary.total_ar_m) * 100 : 0
  const tidakPct = summary.total_ar_m ? (summary.total_tidak_layak_m / summary.total_ar_m) * 100 : 0
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Current (0-3 Bln) &amp; Status</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
          <CheckCircle2 size={16} className="text-emerald-600" />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-semibold text-emerald-600">IDR</span>
        <span className="text-3xl font-black tracking-tight text-emerald-600">{fmtM(summary.total_layak_tagih_m)}</span>
        <span className="text-lg font-bold text-emerald-500">M</span>
      </div>
      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="flex h-full">
          <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${layakPct}%` }} />
          <div className="h-full bg-red-400 transition-all duration-700" style={{ width: `${tidakPct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-emerald-600">Layak: {fmtPct(layakPct)}</span>
        <span className="font-semibold text-red-500">Tdk Layak: {fmtPct(tidakPct)}</span>
      </div>
    </article>
  )
}

function KpiInvoice({ data }) {
  const sudah = data.filter((r) => r.invoice_status === 'SUDAH INVOICED').reduce((s, r) => s + Number(r.nilai_m ?? 0), 0)
  const belum = data.filter((r) => r.invoice_status !== 'SUDAH INVOICED').reduce((s, r) => s + Number(r.nilai_m ?? 0), 0)
  const total = sudah + belum
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status Invoice Tagihan</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100">
          <FileText size={16} className="text-teal-600" />
        </div>
      </div>
      <div className="mt-1 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Sudah:</span>
          <span className="font-bold text-slate-800">IDR {fmtM(sudah)} M</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-teal-500 transition-all duration-700" style={{ width: `${total ? (sudah / total) * 100 : 0}%` }} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Belum:</span>
          <span className="font-bold text-slate-800">IDR {fmtM(belum)} M</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-slate-400 transition-all duration-700" style={{ width: `${total ? (belum / total) * 100 : 0}%` }} />
        </div>
      </div>
    </article>
  )
}

function KpiCritical({ data }) {
  const rows = data.filter((r) => r.aging_category === '>12 bln')
  const val  = rows.reduce((s, r) => s + Number(r.nilai_m ?? 0), 0)
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Critical (&gt;12 Bln)</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100">
          <AlertTriangle size={16} className="text-amber-600" />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-semibold text-amber-600">IDR</span>
        <span className="text-3xl font-black tracking-tight text-amber-600">{fmtM(val)}</span>
        <span className="text-lg font-bold text-amber-500">M</span>
      </div>
      <div className="mt-auto flex items-center justify-between text-xs">
        <span className="text-slate-500">Action Required: <span className="font-semibold text-slate-700">{rows.length} Inv</span></span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">&gt; 12 Bln</span>
      </div>
    </article>
  )
}

/* ══════════════════════════════════════════════
   TAB BAR
══════════════════════════════════════════════ */
function TabBar({ active, onChange }) {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      {TABS.map(({ key, Icon, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={clsx(
            'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 whitespace-nowrap',
            active === key
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          )}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </nav>
  )
}

/* ══════════════════════════════════════════════
   MIND MAP
══════════════════════════════════════════════ */
function MindMapLeaf({ label, value, color }) {
  return (
    <span className={clsx('flex flex-col rounded-lg px-2.5 py-1.5 text-xs', color)}>
      <b className="font-semibold opacity-70 uppercase tracking-wide text-[10px]">{label}</b>
      <em className="font-bold not-italic">{fmtM(value)} M</em>
    </span>
  )
}

function MindRegion({ r, idx }) {
  const tone =
    r.tidak > 0 && r.tidak >= r.layak ? 'red'
    : r.bermasalah > r.layak ? 'amber'
    : 'green'

  const borderColor = tone === 'red' ? 'border-l-red-400' : tone === 'amber' ? 'border-l-amber-400' : 'border-l-emerald-400'
  const dotColor    = tone === 'red' ? 'bg-red-400' : tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400'

  const layakPct = r.total ? (r.layak / r.total) * 100 : 0
  const berPct   = r.total ? (r.bermasalah / r.total) * 100 : 0
  const tidakPct = r.total ? (r.tidak / r.total) * 100 : 0

  return (
    <div
      className={clsx('mm-node rounded-2xl border border-slate-200 border-l-4 bg-white p-3.5 shadow-sm w-64', borderColor)}
      style={{ animationDelay: `${idx * 70}ms` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', dotColor)} />
        <strong className="flex-1 truncate text-sm font-bold text-slate-800">{r.region || '—'}</strong>
        <span className="text-xs font-bold text-slate-500 shrink-0">{fmtM(r.total)} M</span>
      </div>

      {/* stacked progress */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 mb-2.5">
        <div className="h-full bg-emerald-500" style={{ width: `${layakPct}%` }} />
        <div className="h-full bg-amber-400"   style={{ width: `${berPct}%` }} />
        <div className="h-full bg-red-400"     style={{ width: `${tidakPct}%` }} />
      </div>

      {/* leaf chips */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {r.layak      > 0 && <MindMapLeaf label="Layak"       value={r.layak}      color="bg-emerald-50 text-emerald-700" />}
        {r.bermasalah > 0 && <MindMapLeaf label="Bermasalah"  value={r.bermasalah} color="bg-amber-50 text-amber-700" />}
        {r.tidak      > 0 && <MindMapLeaf label="Tidak Layak" value={r.tidak}      color="bg-red-50 text-red-700" />}
      </div>

      {/* aging */}
      {Object.entries(r.aging ?? {}).some(([, v]) => v > 0) && (
        <div className="flex flex-wrap gap-1 border-t border-dashed border-slate-200 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 self-center">Aging›</span>
          {Object.entries(r.aging).map(([b, v]) => v > 0 ? (
            <span key={b} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
              {b}: <b>{fmtM(v)} M</b>
            </span>
          ) : null)}
        </div>
      )}

      {/* invoice */}
      <div className="flex gap-1.5 mt-2">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">{r.invoiced} invoiced</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{r.unbilled} unbilled</span>
      </div>
    </div>
  )
}

function MindMapView({ grouped, summary }) {
  const layakPct = summary.total_ar_m ? (summary.total_layak_tagih_m / summary.total_ar_m) * 100 : 0
  const riskPct  = summary.total_ar_m ? (summary.total_tidak_layak_m  / summary.total_ar_m) * 100 : 0

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400">
        <div className="text-5xl">🔌</div>
        <p className="max-w-xs text-center text-sm">Belum ada data. Hubungkan token untuk memuat data real dari Oracle DB.</p>
      </div>
    )
  }

  const half  = Math.ceil(grouped.length / 2)
  const left  = grouped.slice(0, half)
  const right = grouped.slice(half)

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-center justify-center gap-0 py-8">

        {/* Left branches */}
        <div className="flex flex-col items-end gap-5 pr-0">
          {left.map((r, i) => (
            <div key={r.region} className="flex items-center gap-0">
              <MindRegion r={r} idx={i} />
              {/* connector */}
              <div className="flex items-center">
                <div className="h-px w-10 bg-gradient-to-r from-slate-300 to-slate-400" />
                <div className="h-2 w-2 rounded-full bg-slate-400" />
              </div>
            </div>
          ))}
        </div>

        {/* Root node */}
        <div className="flex shrink-0 flex-col items-center gap-3 px-4">
          <div className="relative h-44 w-44">
            <svg viewBox="0 0 140 140" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="70" cy="70" r="60" fill="none" stroke="#e2e8f0" strokeWidth="10" />
              <circle cx="70" cy="70" r="60" fill="none" stroke="url(#rg)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(layakPct / 100) * 376.8} 376.8`}
              />
              <defs>
                <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">AR SEGMEN ERS</span>
              <strong className="text-xl font-black text-slate-900 leading-tight mt-0.5">{fmtM(summary.total_ar_m)} M</strong>
              <span className="text-[11px] text-slate-400">{summary.total_records} records</span>
            </div>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">Layak {fmtPct(layakPct)}</span>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-600">Risk {fmtPct(riskPct)}</span>
          </div>
        </div>

        {/* Right branches */}
        <div className="flex flex-col items-start gap-5 pl-0">
          {right.map((r, i) => (
            <div key={r.region} className="flex items-center gap-0">
              {/* connector */}
              <div className="flex items-center">
                <div className="h-2 w-2 rounded-full bg-slate-400" />
                <div className="h-px w-10 bg-gradient-to-r from-slate-400 to-slate-300" />
              </div>
              <MindRegion r={r} idx={half + i} />
            </div>
          ))}
        </div>
      </div>

      {/* legend */}
      <div className="flex justify-center gap-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><Circle size={8} className="fill-emerald-500 text-emerald-500" /> Layak Tagih</span>
        <span className="flex items-center gap-1.5"><Circle size={8} className="fill-amber-400 text-amber-400" /> Bermasalah</span>
        <span className="flex items-center gap-1.5"><Circle size={8} className="fill-red-400 text-red-400" /> Tidak Layak</span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   DRILLDOWN VIEW
══════════════════════════════════════════════ */
function DrilldownView({ grouped, summary }) {
  return (
    <div className="space-y-5">
      {/* Region cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {grouped.map((r) => {
          const layakPct = r.total ? (r.layak / r.total) * 100 : 0
          return (
            <article key={r.region} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 truncate">{r.region}</h3>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-black text-slate-900">{fmtM(r.total)}</span>
                <span className="text-sm font-semibold text-slate-400">M</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-700" style={{ width: `${layakPct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {r.layak > 0 && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Layak {fmtM(r.layak)} M</span>}
                {r.bermasalah > 0 && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Bermasalah {fmtM(r.bermasalah)} M</span>}
                {r.tidak > 0 && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">Tidak Layak {fmtM(r.tidak)} M</span>}
              </div>
            </article>
          )
        })}
      </div>

      {/* Summary table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['REGION','TOTAL (M)','LAYAK (M)','BERMASALAH (M)','TIDAK LAYAK (M)','INVOICED','UNBILLED'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((r, i) => (
                <tr key={r.region} className={clsx('border-b border-slate-100 transition-colors hover:bg-slate-50', i % 2 === 0 ? '' : 'bg-slate-50/40')}>
                  <td className="px-4 py-3 font-semibold text-slate-800">{r.region}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{fmtM(r.total)}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{fmtM(r.layak)}</td>
                  <td className="px-4 py-3 font-semibold text-amber-600">{fmtM(r.bermasalah)}</td>
                  <td className="px-4 py-3 font-semibold text-red-500">{fmtM(r.tidak)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.invoiced}</td>
                  <td className="px-4 py-3 text-slate-600">{r.unbilled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   RAW DATA TABLE
══════════════════════════════════════════════ */
function RawTableView({ data }) {
  const [search,        setSearch]        = useState('')
  const [filterAging,   setFilterAging]   = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [filterRegion,  setFilterRegion]  = useState('')
  const [filterInvoice, setFilterInvoice] = useState('')

  const opts = useMemo(() => ({
    aging:   [...new Set(data.map((r) => r.aging_category).filter(Boolean))].sort(),
    status:  [...new Set(data.map((r) => r.status_tagih).filter(Boolean))].sort(),
    region:  [...new Set(data.map((r) => r.region).filter(Boolean))].sort(),
    invoice: [...new Set(data.map((r) => r.invoice_status).filter(Boolean))].sort(),
  }), [data])

  const q = search.toLowerCase()
  const filtered = useMemo(() => data.filter((r) => {
    if (q && !Object.values(r).join(' ').toLowerCase().includes(q)) return false
    if (filterAging   && r.aging_category !== filterAging)   return false
    if (filterStatus  && r.status_tagih   !== filterStatus)  return false
    if (filterRegion  && r.region         !== filterRegion)  return false
    if (filterInvoice && r.invoice_status !== filterInvoice) return false
    return true
  }), [data, q, filterAging, filterStatus, filterRegion, filterInvoice])

  const selectClass = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 appearance-none cursor-pointer'

  return (
    <div className="space-y-4">
      {/* Panel header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide">DATA TRANSAKSI AR ("DATA_AR")</h2>
          <p className="text-sm text-slate-500">Menampilkan {filtered.length} dari total {data.length} transaksi AR</p>
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative min-w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Cari Invoice ID / UIC / Action..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Dropdowns */}
        {[
          { value: filterAging,   setter: setFilterAging,   placeholder: 'Semua Aging Category', opts: opts.aging },
          { value: filterStatus,  setter: setFilterStatus,  placeholder: 'Semua Status Tagih',   opts: opts.status },
          { value: filterRegion,  setter: setFilterRegion,  placeholder: 'Semua Region',          opts: opts.region },
          { value: filterInvoice, setter: setFilterInvoice, placeholder: 'Semua Status Invoice',  opts: opts.invoice },
        ].map(({ value, setter, placeholder, opts: o }) => (
          <div key={placeholder} className="relative">
            <select
              className={selectClass}
              value={value}
              onChange={(e) => setter(e.target.value)}
            >
              <option value="">{placeholder}</option>
              {o.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['INVOICE ID','AGING','STATUS TAGIH','REGION','STATUS INVOICE','NILAI (M)','UIC','DUE DATE','ACTION PLAN'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                    Tidak ada data yang sesuai filter.
                  </td>
                </tr>
              ) : filtered.map((r, i) => (
                <tr
                  key={r.invoice_id}
                  className={clsx(
                    'border-b border-slate-100 transition-colors hover:bg-blue-50/40',
                    i % 2 !== 0 && 'bg-slate-50/50',
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-blue-600">{r.invoice_id}</td>
                  <td className="px-4 py-3"><Pill label={r.aging_category} className={agingClass(r.aging_category)} /></td>
                  <td className="px-4 py-3"><Pill label={r.status_tagih}   className={statusClass(r.status_tagih)} /></td>
                  <td className="px-4 py-3 font-medium text-slate-700">{r.region}</td>
                  <td className="px-4 py-3"><Pill label={r.invoice_status} className={invoiceClass(r.invoice_status)} /></td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-800">Rp {fmtM(r.nilai_m)} M</td>
                  <td className="px-4 py-3 text-slate-600">{r.uic}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(r.due_date)}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-48 truncate" title={r.action_plan}>{r.action_plan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   ANALYTICS VIEW
══════════════════════════════════════════════ */
function AnalyticsView({ grouped, agingBuckets, uicBuckets, summary }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {/* Stacked bar region */}
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-700 uppercase tracking-wide">Stacked Bar Per Region</h3>
        <div className="space-y-3">
          {grouped.map((r) => (
            <div key={r.region} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate text-xs text-slate-600">{r.region}</span>
              <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500" style={{ width: `${summary.total_ar_m ? (r.layak / summary.total_ar_m) * 100 : 0}%` }} />
                <div className="h-full bg-amber-400"   style={{ width: `${summary.total_ar_m ? (r.bermasalah / summary.total_ar_m) * 100 : 0}%` }} />
                <div className="h-full bg-red-400"     style={{ width: `${summary.total_ar_m ? (r.tidak / summary.total_ar_m) * 100 : 0}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-bold text-slate-700">{fmtM(r.total)} M</span>
            </div>
          ))}
        </div>
      </article>

      {/* Donut aging */}
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-700 uppercase tracking-wide">Donut Aging Category</h3>
        <div className="flex items-center gap-6">
          <div
            className="relative h-40 w-40 shrink-0 rounded-full"
            style={{ background: `conic-gradient(#1d4ed8 0 ${summary.total_ar_m ? (agingBuckets['0-3 bln'] / summary.total_ar_m) * 360 : 0}deg, #f59e0b ${summary.total_ar_m ? (agingBuckets['0-3 bln'] / summary.total_ar_m) * 360 : 0}deg ${summary.total_ar_m ? ((agingBuckets['0-3 bln'] + agingBuckets['4-12 bln']) / summary.total_ar_m) * 360 : 0}deg, #ef4444 ${summary.total_ar_m ? ((agingBuckets['0-3 bln'] + agingBuckets['4-12 bln']) / summary.total_ar_m) * 360 : 0}deg 360deg)` }}
          >
            <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white text-center">
              <strong className="text-sm font-black text-slate-800">{fmtM(summary.total_ar_m)} M</strong>
              <span className="text-[10px] text-slate-400">AR total</span>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-blue-700" /> 0-3 bln — <b>{fmtM(agingBuckets['0-3 bln'])} M</b></li>
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" /> 4-12 bln — <b>{fmtM(agingBuckets['4-12 bln'])} M</b></li>
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-500" /> &gt;12 bln — <b>{fmtM(agingBuckets['>12 bln'])} M</b></li>
          </ul>
        </div>
      </article>

      {/* UIC distribution */}
      <article className="col-span-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-slate-700 uppercase tracking-wide">Distribusi UIC Horizontal</h3>
        <div className="space-y-3">
          {uicBuckets.map((r) => (
            <div key={r.uic} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate text-xs text-slate-600">{r.uic}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600 transition-all duration-700"
                  style={{ width: `${summary.total_ar_m ? (r.total / summary.total_ar_m) * 100 : 0}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-bold text-slate-700">{fmtM(r.total)} M</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  )
}

/* ══════════════════════════════════════════════
   LOGIN MODAL
══════════════════════════════════════════════ */
function LoginModal({ email, onEmailChange, onSignIn, onClear, onClose, status }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Local Auth</span>
            <h2 className="mt-1 text-xl font-black text-slate-900">Connect Dev Token</h2>
          </div>
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" type="button" onClick={onClose}>×</button>
        </div>
        <p className="mt-3 text-sm text-slate-600">Enter a demo email to request a Sanctum token from Laravel and unlock live polling.</p>
        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo email</span>
          <input
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </label>
        <div className="mt-4 flex gap-2">
          <button
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            type="button"
            onClick={onSignIn}
          >
            Sign in
          </button>
          <button
            className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200"
            type="button"
            onClick={onClear}
          >
            Clear token
          </button>
        </div>
        {status && <p className="mt-3 text-xs text-slate-500">{status}</p>}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   PANEL WRAPPER
══════════════════════════════════════════════ */
function Panel({ title, subtitle, children, action }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-bold uppercase tracking-wide text-slate-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════
   APP ROOT
══════════════════════════════════════════════ */
export default function App() {
  const [dashboardData,  setDashboardData]  = useState(EMPTY_DATA)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [lastUpdated,    setLastUpdated]    = useState(null)
  const [authEmail,      setAuthEmail]      = useState(localStorage.getItem('auth_email') ?? 'demo@arsystem.local')
  const [authToken,      setAuthToken]      = useState(localStorage.getItem('auth_token') ?? '')
  const [authStatus,     setAuthStatus]     = useState(localStorage.getItem('auth_token') ? 'Token loaded' : '')
  const [showLogin,      setShowLogin]      = useState(!localStorage.getItem('auth_token'))
  const [activeTab,      setActiveTab]      = useState('mindmap')
  const [pollingEnabled, setPollingEnabled] = useState(true)

  const fetchDashboard = useCallback(async (tokenOverride) => {
    const token = tokenOverride ?? localStorage.getItem('auth_token')
    try {
      const res = await axios.get(API_URL, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.data?.success) {
        setDashboardData(res.data.payload ?? EMPTY_DATA)
        setError(null)
        setLastUpdated(res.data.timestamp ?? new Date().toISOString())
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyinkronkan data.')
    } finally {
      setLoading(false)
    }
  }, [])

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
      await fetchDashboard(token)
    } catch (err) {
      setAuthStatus(err.response?.data?.message || err.message || 'Gagal mengambil token.')
      setError(err.response?.data?.message || 'Gagal mengambil token.')
    }
  }

  const clearToken = () => {
    localStorage.removeItem('auth_token')
    setAuthToken('')
    setAuthStatus('Token cleared.')
  }

  useEffect(() => {
    let cancelled = false
    if (!authToken) { setLoading(false) }
    else { fetchDashboard() }
    const t = window.setInterval(() => {
      if (!cancelled && pollingEnabled && localStorage.getItem('auth_token')) fetchDashboard()
    }, POLL_MS)
    return () => { cancelled = true; window.clearInterval(t) }
  }, [authToken, pollingEnabled, fetchDashboard])

  /* derived */
  const data    = dashboardData?.data    ?? []
  const summary = dashboardData?.summary ?? EMPTY_DATA.summary

  const grouped = useMemo(() => {
    const map = new Map()
    data.forEach((r) => {
      const cur = map.get(r.region) ?? {
        region: r.region, total: 0, layak: 0, bermasalah: 0, tidak: 0,
        aging: { '0-3 bln': 0, '4-12 bln': 0, '>12 bln': 0 },
        invoiced: 0, unbilled: 0,
      }
      const v = Number(r.nilai_m ?? 0)
      cur.total += v
      if (r.status_tagih === 'AR LAYAK TAGIH')       cur.layak      += v
      if (r.status_tagih === 'AR BERMASALAH')         cur.bermasalah += v
      if (r.status_tagih === 'AR TIDAK LAYAK TAGIH') cur.tidak      += v
      if (cur.aging[r.aging_category] !== undefined)  cur.aging[r.aging_category] += v
      if (r.invoice_status === 'SUDAH INVOICED') cur.invoiced++; else cur.unbilled++
      map.set(r.region, cur)
    })
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [data])

  const agingBuckets = useMemo(() => {
    const b = { '0-3 bln': 0, '4-12 bln': 0, '>12 bln': 0 }
    data.forEach((r) => { b[r.aging_category] = (b[r.aging_category] ?? 0) + Number(r.nilai_m ?? 0) })
    return b
  }, [data])

  const uicBuckets = useMemo(() => {
    const m = new Map()
    data.forEach((r) => m.set(r.uic, (m.get(r.uic) ?? 0) + Number(r.nilai_m ?? 0)))
    return [...m.entries()].map(([uic, total]) => ({ uic, total })).sort((a, b) => b.total - a.total)
  }, [data])

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <DashHeader
        error={error}
        lastUpdated={lastUpdated}
        pollingEnabled={pollingEnabled}
        onRefresh={() => fetchDashboard()}
        onPollToggle={() => setPollingEnabled((v) => !v)}
        onSignIn={() => setShowLogin(true)}
        hasToken={!!authToken}
      />

      <main className="mx-auto max-w-[1440px] space-y-4 p-4 sm:p-6">
        {/* KPI Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTotal    summary={summary} />
          <KpiStatus   summary={summary} />
          <KpiInvoice  data={data} />
          <KpiCritical data={data} />
        </div>

        {/* Banners */}
        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
            <RefreshCw size={14} className="animate-spin" /> Memuat data dashboard…
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Tab bar */}
        <TabBar active={activeTab} onChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === 'mindmap' && (
          <Panel
            title="Diagram Mind-Map AR (XMind)"
            subtitle="Hierarchical view — all regions with aging buckets, status split, and invoice coverage"
            action={
              <button
                className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                type="button"
                onClick={() => setActiveTab('drilldown')}
              >
                Open drill-down →
              </button>
            }
          >
            <MindMapView grouped={grouped} summary={summary} />
          </Panel>
        )}

        {activeTab === 'drilldown' && (
          <Panel title="Cards + Grouped Drill-down" subtitle="Summary per region • sorted by total outstanding">
            <DrilldownView grouped={grouped} summary={summary} />
          </Panel>
        )}

        {activeTab === 'raw' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <RawTableView data={data} />
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold uppercase tracking-wide text-slate-800">Analitik &amp; Sebaran Chart</h2>
              <span className="text-sm text-slate-400">— distribusi AR per region, aging, dan UIC</span>
            </div>
            <AnalyticsView grouped={grouped} agingBuckets={agingBuckets} uicBuckets={uicBuckets} summary={summary} />
          </div>
        )}

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs text-slate-500 shadow-sm">
          <span className="font-semibold text-slate-700">AR Monitoring Dashboard v1.0</span>
          <span>Oracle DB › Python Engine › Laravel Gateway</span>
          <span>{lastUpdated ? `Updated: ${new Date(lastUpdated).toLocaleString('id-ID')}` : 'No data yet'}</span>
        </footer>
      </main>

      {/* Login Modal */}
      {showLogin && (
        <LoginModal
          email={authEmail}
          onEmailChange={setAuthEmail}
          onSignIn={bootstrapToken}
          onClear={clearToken}
          onClose={() => setShowLogin(false)}
          status={authStatus}
        />
      )}
    </div>
  )
}
