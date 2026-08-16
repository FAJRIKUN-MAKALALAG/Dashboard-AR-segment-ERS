import { useEffect, useMemo, useState, useCallback } from 'react'
import axios from 'axios'
import clsx from 'clsx'
import {
  DollarSign, CheckCircle2, FileText, AlertTriangle,
  RefreshCw, Power, LogIn, Download, Search,
  ChevronDown, TreePine, LayoutGrid, TableProperties, BarChart3,
  Circle, Wifi, WifiOff, Calendar, HelpCircle, Undo2, Database, Plus, Trash2, Edit2
} from 'lucide-react'
import './App.css'

const API_URL = import.meta.env.VITE_LARAVEL_API_URL ?? 'http://localhost:8001/api/v1/ar-dashboard'
const DEV_TOKEN_URL = import.meta.env.VITE_LARAVEL_DEV_TOKEN_URL ?? 'http://localhost:8001/api/v1/dev-token'
const TABLES_API_BASE = 'http://localhost:8001/api/v1/tables'
const POLL_MS = 10_000

const EMPTY_DATA = {
  summary: { total_ar_m: 0, total_layak_tagih_m: 0, total_tidak_layak_m: 0, overdue_pct: 0, dso: 0, total_records: 0, as_of_date: '' },
  charts: {
    age_analysis: {},
    region_breakup: [],
    cash_inflow: [],
    trend_t13m: [],
    sparkline_overdue_pct: [],
    sparkline_dso: [],
    sparkline_months: []
  },
  top_customers: [],
  data: []
}

const COLORS = {
  green: '#70ad47',
  blue: '#0070c0',
  yellow: '#ffc000',
  dark: '#2e3c50'
}

/* ─────────────────────────────────────────────
   Formatters
───────────────────────────────────────────── */
const fmtM = (v) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v ?? 0))
const fmtRaw = (v) => new Intl.NumberFormat('en-US').format(Math.round(Number(v ?? 0)))

/* ─────────────────────────────────────────────
   Mini Sparkline Component
───────────────────────────────────────────── */
function Sparkline({ data, color }) {
  if (!data || data.length === 0) return null
  const width = 120
  const height = 30
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width
    const y = height - ((val - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  )
}

/* ══════════════════════════════════════════════
   DATABASE MANAGER VIEW component
══════════════════════════════════════════════ */
function DbManagerView({ token, onDataChanged }) {
  const [selectedTable, setSelectedTable] = useState('AR_SEGMEN_ERS_TBL')
  const [tableData, setTableData] = useState([])
  const [primaryKey, setPrimaryKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [formData, setFormData] = useState({})

  const tables = [
    { value: 'AR_SEGMEN_ERS_TBL', label: 'AR Invoices Snapshot (AR_SEGMEN_ERS_TBL)' },
    { value: 'AR_CASH_INFLOW_FORECAST_TBL', label: 'Cash Inflow & Forecast (AR_CASH_INFLOW_FORECAST_TBL)' },
    { value: 'AR_TREND_T13M_TBL', label: '13-Month Trend (AR_TREND_T13M_TBL)' },
    { value: 'AR_METRICS_HISTORY_TBL', label: 'DSO & Overdue History (AR_METRICS_HISTORY_TBL)' },
    { value: 'AR_TOP_CUSTOMERS_TBL', label: 'Top Customers (AR_TOP_CUSTOMERS_TBL)' }
  ]

  const fetchTable = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`${TABLES_API_BASE}/${selectedTable}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data?.status === 'success') {
        setTableData(res.data.data)
        setPrimaryKey(res.data.primary_key)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data tabel.')
    } finally {
      setLoading(false)
    }
  }, [selectedTable, token])

  useEffect(() => {
    fetchTable()
  }, [fetchTable])

  const handleDelete = async (idVal) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus baris data ini?')) return
    try {
      await axios.delete(`${TABLES_API_BASE}/${selectedTable}/${idVal}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      fetchTable()
      onDataChanged()
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal menghapus data.')
    }
  }

  const handleOpenAdd = () => {
    setIsEditing(false)
    setEditingId('')
    const emptyForm = {}
    if (tableData.length > 0) {
      Object.keys(tableData[0]).forEach(k => {
        emptyForm[k] = ''
      })
    }
    setFormData(emptyForm)
    setShowModal(true)
  }

  const handleOpenEdit = (row) => {
    setIsEditing(true)
    setEditingId(row[primaryKey])
    setFormData({ ...row })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (isEditing) {
        await axios.put(`${TABLES_API_BASE}/${selectedTable}/${editingId}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        })
      } else {
        await axios.post(`${TABLES_API_BASE}/${selectedTable}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        })
      }
      setShowModal(false)
      fetchTable()
      onDataChanged()
    } catch (err) {
      alert(err.response?.data?.message || 'Gagal menyimpan data.')
    }
  }

  const handleInputChange = (col, val) => {
    setFormData(prev => ({
      ...prev,
      [col]: val
    }))
  }

  const columns = tableData.length > 0 ? Object.keys(tableData[0]) : []

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Database Table CRUD Manager</h2>
          <p className="text-sm text-slate-500 mt-0.5">Pilih tabel database Oracle untuk menampilkan, menambah, mengubah, atau menghapus record.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition shadow-sm"
        >
          <Plus size={16} />
          Add Record
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-bold text-slate-700">Select Database Table:</label>
        <div className="relative flex-1 max-w-md">
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 appearance-none cursor-pointer"
          >
            {tables.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      {loading && <div className="text-center py-10 text-slate-500 font-medium">Memuat data tabel...</div>}
      {error && <div className="text-center py-10 text-red-500 font-bold">Error: {error}</div>}

      {!loading && !error && tableData.length === 0 && (
        <div className="text-center py-10 text-slate-400 font-medium">Tabel kosong / tidak ada data.</div>
      )}

      {!loading && !error && tableData.length > 0 && (
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="min-w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase">
                {columns.map(col => <th key={col} className="px-4 py-3">{col}</th>)}
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => (
                <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 font-medium text-slate-700">
                  {columns.map(col => (
                    <td key={col} className="px-4 py-2.5 truncate max-w-xs" title={String(row[col] ?? '')}>
                      {row[col] !== null ? String(row[col]) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(row)}
                      className="p-1 bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded transition"
                      title="Edit Row"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(row[primaryKey])}
                      className="p-1 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded transition"
                      title="Delete Row"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Insert / Edit Form Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl overflow-y-auto max-h-[85vh]">
            <h3 className="text-lg font-bold text-slate-900 mb-4">{isEditing ? 'Modify Record' : 'Create New Record'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {columns.map(col => {
                  const isPk = col === primaryKey
                  const val = formData[col] ?? ''
                  return (
                    <div key={col} className="flex flex-col">
                      <label className="text-xs font-bold text-slate-500 uppercase mb-1">
                        {col} {isPk && <span className="text-blue-500">(Primary Key)</span>}
                      </label>
                      <input
                        type={typeof val === 'number' ? 'number' : 'text'}
                        step="any"
                        value={val}
                        disabled={isEditing && isPk}
                        required
                        onChange={(e) => handleInputChange(col, e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400 font-medium"
                      />
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-sm shadow-sm"
                >
                  Save Record
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl transition text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function App() {
  const [dashboardData, setDashboardData] = useState(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [authEmail, setAuthEmail] = useState(localStorage.getItem('auth_email') ?? 'demo@arsystem.local')
  const [authToken, setAuthToken] = useState(localStorage.getItem('auth_token') ?? '')
  const [authStatus, setAuthStatus] = useState(localStorage.getItem('auth_token') ? 'Token loaded' : '')
  const [showLogin, setShowLogin] = useState(!localStorage.getItem('auth_token'))
  const [pollingEnabled, setPollingEnabled] = useState(true)
  const [showDbManager, setShowDbManager] = useState(false)

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
    setShowLogin(true)
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

  const { summary, charts, top_customers } = dashboardData

  // 1. Age Analysis of Due Balance Calculations
  const ageKeys = ['Within Due Days', 'Over Due 0-30 Days', 'Over Due 31-60 Days', 'Over Due 61-90 Days', 'Due Over 90 Days']
  const ageValues = ageKeys.map(k => charts.age_analysis[k] ?? 0)
  const maxAgeVal = Math.max(...ageValues, 1)

  // 2. Over Due Breakup by Region Donut Calculations
  const donutData = charts.region_breakup ?? []
  const donutTotal = donutData.reduce((acc, curr) => acc + curr.value, 0) || 1
  let currentAngle = 0
  const donutSlices = donutData.map((slice, idx) => {
    const angle = (slice.value / donutTotal) * 360
    const start = currentAngle
    currentAngle += angle
    const color = idx === 0 ? COLORS.green : idx === 1 ? COLORS.yellow : COLORS.blue
    return { ...slice, start, end: currentAngle, color }
  })

  // 3. Actual vs Estimated Cash Inflow Calculations
  const inflowData = charts.cash_inflow ?? []
  const maxInflowVal = Math.max(...inflowData.map(d => Math.max(d.actual_receipts, d.estimated_receipts, d.forecasted_receipts)), 1)

  // 4. Credit Sales vs Balance Due Trend T13M Calculations
  const trendData = charts.trend_t13m ?? []
  const maxTrendVal = Math.max(...trendData.map(d => Math.max(d.within_due + d.over_due, d.credit_sales)), 1)

  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 text-slate-800">
      {/* Dev Header & Connection Status */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl shadow-sm border border-slate-200 text-xs">
        <div className="flex items-center gap-2">
          {error ? <WifiOff size={14} className="text-red-500" /> : <Wifi size={14} className="text-emerald-500" />}
          <span className="font-bold uppercase">Oracle Data Source:</span>
          <span className={clsx("px-2 py-0.5 rounded-full font-semibold", error ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
            {error ? 'Error' : 'Connected'}
          </span>
          {lastUpdated && <span className="text-slate-400">Last Sync: {new Date(lastUpdated).toLocaleTimeString()}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPollingEnabled(!pollingEnabled)}
            className={clsx("px-3 py-1.5 rounded-full font-bold transition", pollingEnabled ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600")}
          >
            Polling: {pollingEnabled ? "ON" : "OFF"}
          </button>
          <button onClick={() => fetchDashboard()} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition">
            <RefreshCw size={14} />
          </button>
          {authToken ? (
            <button onClick={clearToken} className="px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 font-bold rounded-full transition">
              Disconnect
            </button>
          ) : (
            <button onClick={() => setShowLogin(true)} className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-full transition">
              Connect DB
            </button>
          )}
        </div>
      </div>

      {/* Main Premium Dashboard Container */}
      <div className="max-w-[1440px] mx-auto bg-[#f4f6fa] rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        
        {/* Title Block & Filter Row */}
        <div className="p-6 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Accounts Receivable Overview</h1>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              As of Date: <span className="font-semibold text-slate-700">{summary.as_of_date || 'Sunday 31, May 2020'}</span>
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
            {/* Database Manager Toggle Button */}
            <button
              onClick={() => setShowDbManager(!showDbManager)}
              className={clsx(
                "flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-sm border transition",
                showDbManager 
                  ? "bg-slate-800 text-white border-slate-800" 
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              )}
            >
              <Database size={14} />
              {showDbManager ? "View Dashboard" : "Database Manager"}
            </button>

            {!showDbManager && (
              <>
                <Calendar size={18} className="text-slate-400" />
                <input 
                  type="text" 
                  value="12/1/2019" 
                  readOnly
                  className="w-24 px-2 py-1 text-sm bg-white border border-slate-200 rounded text-center font-medium focus:outline-none"
                />
                <span className="text-slate-400">—</span>
                <input 
                  type="text" 
                  value="5/31/2020" 
                  readOnly
                  className="w-24 px-2 py-1 text-sm bg-white border border-slate-200 rounded text-center font-medium focus:outline-none"
                />
                <HelpCircle size={20} className="text-slate-400 cursor-pointer hover:text-slate-600 ml-2" />
                <Undo2 size={20} className="text-slate-400 cursor-pointer hover:text-slate-600" />
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {showDbManager ? (
            <DbManagerView token={authToken} onDataChanged={() => fetchDashboard()} />
          ) : (
            <>
              {/* KPI CARDS ROW */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                
                {/* Card 1: Balance */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{summary.total_ar_m ? `${summary.total_ar_m}M` : '14.89M'}</div>
                    <div className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-0.5">Balance</div>
                  </div>
                </div>

                {/* Card 2: Within Due */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 text-[#70ad47] rounded-xl">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{summary.total_layak_tagih_m ? `${summary.total_layak_tagih_m}M` : '6.65M'}</div>
                    <div className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-0.5">Within Due</div>
                  </div>
                </div>

                {/* Card 3: Over Due */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-amber-50 text-[#ffc000] rounded-xl">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">{summary.total_tidak_layak_m ? `${summary.total_tidak_layak_m}M` : '8.24M'}</div>
                    <div className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-0.5">Over Due</div>
                  </div>
                </div>

                {/* Card 4: Over Due % */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                      <BarChart3 size={24} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{summary.overdue_pct ? `${summary.overdue_pct}%` : '55.3%'}</div>
                      <div className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase mt-0.5">Over Due %</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Sparkline data={charts.sparkline_overdue_pct.length ? charts.sparkline_overdue_pct : [42, 45, 40, 38, 44, 48, 43, 46, 49, 51, 53, 55.3]} color="#818cf8" />
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Over Due % T12M</span>
                  </div>
                </div>

                {/* Card 5: DSO */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                      <Calendar size={24} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{summary.dso || '60'}</div>
                      <div className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase mt-0.5">DSO</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Sparkline data={charts.sparkline_dso.length ? charts.sparkline_dso : [52, 53, 54, 50, 55, 58, 56, 59, 57, 61, 62, 60]} color="#f43f5e" />
                    <span className="text-[9px] text-slate-400 font-bold uppercase">DSO T12M</span>
                  </div>
                </div>

              </div>

              {/* FIRST ROW VISUALS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Age Analysis of Due Balance */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm lg:col-span-3 flex flex-col">
                  <h3 className="text-sm font-bold text-slate-900 mb-6 tracking-tight">Age Analysis of Due Balance</h3>
                  <div className="flex-1 flex items-end justify-between gap-2 h-44 pb-2 border-b border-slate-100">
                    {ageKeys.map((key, idx) => {
                      const val = ageValues[idx] || (idx === 0 ? 6.6 : idx === 1 ? 2.2 : idx === 2 ? 1.1 : idx === 3 ? 0.8 : 4.1)
                      const heightPct = (val / maxAgeVal) * 100
                      const color = idx === 0 ? COLORS.green : COLORS.blue
                      return (
                        <div key={key} className="flex flex-col items-center flex-1 group relative">
                          <div className="text-[10px] font-bold text-slate-600 mb-1">{val.toFixed(1)}M</div>
                          <div 
                            style={{ height: `${heightPct}%`, backgroundColor: color }} 
                            className="w-8 rounded-t-sm transition-all duration-500 hover:opacity-80"
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between gap-2 pt-2 text-[8px] font-bold text-slate-400 uppercase text-center">
                    <div className="flex-1">Within Due Days</div>
                    <div className="flex-1">Over Due 0-30 Days</div>
                    <div className="flex-1">Over Due 31-60 Days</div>
                    <div className="flex-1">Over Due 61-90 Days</div>
                    <div className="flex-1">Due Over 90 Days</div>
                  </div>
                </div>

                {/* Over Due Breakup by Region */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm lg:col-span-4 flex flex-col items-center">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 tracking-tight self-start">Over Due Breakup by Region</h3>
                  <div className="flex gap-4 text-xs font-semibold mb-6">
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#70ad47]" /> North America</div>
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ffc000]" /> Europe</div>
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#0070c0]" /> Pacific</div>
                  </div>
                  <div className="relative w-40 h-40">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                      {donutSlices.length ? donutSlices.map((slice, idx) => {
                        const startAngle = slice.start
                        const endAngle = slice.end
                        const x1 = Math.cos((startAngle * Math.PI) / 180) * 10 + 18
                        const y1 = Math.sin((startAngle * Math.PI) / 180) * 10 + 18
                        const x2 = Math.cos((endAngle * Math.PI) / 180) * 10 + 18
                        const y2 = Math.sin((endAngle * Math.PI) / 180) * 10 + 18
                        const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
                        
                        return (
                          <path
                            key={slice.region}
                            d={`M 18 18 L ${x1} ${y1} A 10 10 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                            fill={slice.color}
                          />
                        )
                      }) : (
                        <>
                          <path d="M 18 18 L 28 18 A 10 10 0 0 1 12.1 26 L 18 18 Z" fill={COLORS.green} />
                          <path d="M 18 18 L 12.1 26 A 10 10 0 0 1 10.4 12 L 18 18 Z" fill={COLORS.yellow} />
                          <path d="M 18 18 L 10.4 12 A 10 10 0 0 1 28 18 Z" fill={COLORS.blue} />
                        </>
                      )}
                      <circle cx="18" cy="18" r="6" fill="#ffffff" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none text-center">
                      <div className="text-[10px] font-bold text-slate-700">Region Breakup</div>
                    </div>
                  </div>
                  <div className="w-full flex justify-around mt-4 text-[10px] font-bold text-slate-500">
                    {donutSlices.map(s => (
                      <div key={s.region} className="text-center">
                        <div>{s.value.toFixed(1)}M</div>
                        <div className="text-[8px] text-slate-400 uppercase font-semibold">{s.region}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actual vs Estimated Cash inflow */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm lg:col-span-5 flex flex-col">
                  <h3 className="text-sm font-bold text-slate-900 mb-2 tracking-tight">Actual vs Estimated Cash inflow with 3 Months Forecast</h3>
                  <div className="flex gap-4 text-xs font-semibold mb-4">
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#0070c0]" /> Actual Receipts</div>
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#70ad47]" /> Estimated Receipts</div>
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ffc000]" /> Forecasted Receipts</div>
                  </div>
                  <div className="flex-1 flex items-end justify-between h-44 pb-2 border-b border-slate-100 gap-1">
                    {(inflowData.length ? inflowData : [
                      { month_label: 'Nov 2019', actual_receipts: 3.0, estimated_receipts: 3.5, forecasted_receipts: 0 },
                      { month_label: 'Dec 2019', actual_receipts: 4.0, estimated_receipts: 5.0, forecasted_receipts: 0 },
                      { month_label: 'Jan 2020', actual_receipts: 4.1, estimated_receipts: 4.6, forecasted_receipts: 0 },
                      { month_label: 'Feb 2020', actual_receipts: 3.5, estimated_receipts: 4.6, forecasted_receipts: 0 },
                      { month_label: 'Mar 2020', actual_receipts: 4.0, estimated_receipts: 4.6, forecasted_receipts: 0 },
                      { month_label: 'Apr 2020', actual_receipts: 3.9, estimated_receipts: 4.9, forecasted_receipts: 0 },
                      { month_label: 'May 2020', actual_receipts: 4.6, estimated_receipts: 4.6, forecasted_receipts: 0 },
                      { month_label: 'Jun 2020', actual_receipts: 0, estimated_receipts: 0, forecasted_receipts: 6.1 },
                      { month_label: 'Jul 2020', actual_receipts: 0, estimated_receipts: 0, forecasted_receipts: 6.0 },
                      { month_label: 'Jul 2020', actual_receipts: 0, estimated_receipts: 0, forecasted_receipts: 1.4 }
                    ]).map((d, idx) => {
                      const actH = (d.actual_receipts / maxInflowVal) * 100
                      const estH = (d.estimated_receipts / maxInflowVal) * 100
                      const foreH = (d.forecasted_receipts / maxInflowVal) * 100
                      
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center">
                          <div className="flex items-end gap-[2px] w-full h-36 justify-center">
                            {d.actual_receipts > 0 && <div style={{ height: `${actH}%` }} className="w-2 bg-[#0070c0]" />}
                            {d.estimated_receipts > 0 && <div style={{ height: `${estH}%` }} className="w-2 bg-[#70ad47]" />}
                            {d.forecasted_receipts > 0 && <div style={{ height: `${foreH}%` }} className="w-3 bg-[#ffc000]" />}
                          </div>
                          <div className="text-[8px] font-bold text-slate-400 mt-2 truncate w-full text-center">{d.month_label}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>

              {/* SECOND ROW VISUALS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Credit Sales vs Balance Due Trend T13M */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm lg:col-span-6 flex flex-col">
                  <h3 className="text-sm font-bold text-slate-900 mb-2 tracking-tight">Credit Sales vs Balance Due Trend T13M</h3>
                  <div className="flex gap-4 text-xs font-semibold mb-4">
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#70ad47]" /> Within Due</div>
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#0070c0]" /> Over Due</div>
                    <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#2e3c50]" /> Credit Sales</div>
                  </div>
                  <div className="relative flex-1 h-52">
                    <svg viewBox="0 0 500 200" className="w-full h-full overflow-visible">
                      {(trendData.length ? trendData : [
                        { month_label: 'May 19', within_due: 0.8, over_due: 0.6, credit_sales: 1.8 },
                        { month_label: 'Jun 19', within_due: 1.0, over_due: 0.8, credit_sales: 2.9 },
                        { month_label: 'Jul 19', within_due: 0.9, over_due: 0.8, credit_sales: 2.6 },
                        { month_label: 'Aug 19', within_due: 1.1, over_due: 0.9, credit_sales: 3.2 },
                        { month_label: 'Sep 19', within_due: 1.2, over_due: 1.0, credit_sales: 3.2 },
                        { month_label: 'Oct 19', within_due: 1.5, over_due: 1.2, credit_sales: 4.0 },
                        { month_label: 'Nov 19', within_due: 1.8, over_due: 1.4, credit_sales: 5.0 },
                        { month_label: 'Dec 19', within_due: 2.0, over_due: 1.6, credit_sales: 4.4 },
                        { month_label: 'Jan 20', within_due: 2.1, over_due: 1.8, credit_sales: 4.9 },
                        { month_label: 'Feb 20', within_due: 2.2, over_due: 2.0, credit_sales: 4.3 },
                        { month_label: 'Mar 20', within_due: 2.5, over_due: 2.3, credit_sales: 5.3 },
                        { month_label: 'Apr 20', within_due: 2.8, over_due: 2.6, credit_sales: 5.6 },
                        { month_label: 'May 20', within_due: 3.0, over_due: 3.3, credit_sales: 6.3 }
                      ]).map((d, idx, arr) => {
                        const x = 20 + (idx / (arr.length - 1)) * 450
                        const totalBar = d.within_due + d.over_due
                        const barW = 14
                        const barX = x - barW / 2
                        
                        const estH = (d.within_due / maxTrendVal) * 160
                        const overH = (d.over_due / maxTrendVal) * 160
                        const lineY = 180 - (d.credit_sales / maxTrendVal) * 160

                        return (
                          <g key={idx}>
                            <rect x={barX} y={180 - estH} width={barW} height={estH} fill={COLORS.green} />
                            <rect x={barX} y={180 - estH - overH} width={barW} height={overH} fill={COLORS.blue} />
                            <circle cx={x} cy={lineY} r="3" fill={COLORS.dark} />
                            <text x={x} y="195" fontSize="7" fontWeight="bold" fill="#94a3b8" textAnchor="middle">
                              {d.month_label}
                            </text>
                          </g>
                        )
                      })}
                      <path
                        fill="none"
                        stroke={COLORS.dark}
                        strokeWidth="1.5"
                        d={(trendData.length ? trendData : [
                          { month_label: 'May 19', credit_sales: 1.8 },
                          { month_label: 'Jun 19', credit_sales: 2.9 },
                          { month_label: 'Jul 19', credit_sales: 2.6 },
                          { month_label: 'Aug 19', credit_sales: 3.2 },
                          { month_label: 'Sep 19', credit_sales: 3.2 },
                          { month_label: 'Oct 19', credit_sales: 4.0 },
                          { month_label: 'Nov 19', credit_sales: 5.0 },
                          { month_label: 'Dec 19', credit_sales: 4.4 },
                          { month_label: 'Jan 20', credit_sales: 4.9 },
                          { month_label: 'Feb 20', credit_sales: 4.3 },
                          { month_label: 'Mar 20', credit_sales: 5.3 },
                          { month_label: 'Apr 20', credit_sales: 5.6 },
                          { month_label: 'May 20', credit_sales: 6.3 }
                        ]).map((d, idx, arr) => {
                          const x = 20 + (idx / (arr.length - 1)) * 450
                          const y = 180 - (d.credit_sales / maxTrendVal) * 160
                          return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
                        }).join(' ')}
                      />
                    </svg>
                  </div>
                </div>

                {/* Top 10 Customers by Over Due Amount */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm lg:col-span-6 flex flex-col">
                  <h3 className="text-sm font-bold text-slate-900 mb-4 tracking-tight">Top 10 Customers by Over Due Amount</h3>
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-bold">
                          <th className="py-2 pr-4">Customer</th>
                          <th className="py-2 px-2 text-right">Balance</th>
                          <th className="py-2 px-2 text-right">Within Due</th>
                          <th className="py-2 px-2 text-right">Over Due</th>
                          <th className="py-2 px-2 text-right">Over Due %</th>
                          <th className="py-2 px-2 text-right">Due Invoices</th>
                          <th className="py-2 pl-4 text-center">Above Credit Limit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(top_customers.length ? top_customers : [
                          { customer_name: 'Preston Gonzalez', balance: 107469, within_due: 3108, over_due: 104362, overdue_pct: 97.1, due_invoices: 12, above_credit_limit: 0 },
                          { customer_name: 'Daisy Blanco', balance: 129330, within_due: 33686, over_due: 95644, overdue_pct: 74.0, due_invoices: 11, above_credit_limit: 0 },
                          { customer_name: 'Ruben Dominguez', balance: 141542, within_due: 53079, over_due: 88463, overdue_pct: 62.5, due_invoices: 8, above_credit_limit: 1 },
                          { customer_name: 'Renee Carlson', balance: 86619, within_due: 0, over_due: 86619, overdue_pct: 100.0, due_invoices: 10, above_credit_limit: 0 },
                          { customer_name: 'Eugene Zhu', balance: 84952, within_due: 0, over_due: 84952, overdue_pct: 100.0, due_invoices: 10, above_credit_limit: 0 },
                          { customer_name: 'Xavier Alexander', balance: 81766, within_due: 252, over_due: 81514, overdue_pct: 99.7, due_invoices: 15, above_credit_limit: 0 },
                          { customer_name: 'Cedric Lin', balance: 205563, within_due: 124108, over_due: 81456, overdue_pct: 39.6, due_invoices: 10, above_credit_limit: 1 }
                        ]).map((cust, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 font-medium">
                            <td className="py-2.5 pr-4 text-slate-900">{cust.customer_name}</td>
                            <td className="py-2.5 px-2 text-right font-semibold text-slate-700">
                              <span className="inline-block bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">
                                {fmtRaw(cust.balance)}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right text-slate-500">{fmtRaw(cust.within_due)}</td>
                            <td className="py-2.5 px-2 text-right text-slate-600 font-bold">{fmtRaw(cust.over_due)}</td>
                            <td className="py-2.5 px-2 text-right text-slate-500">{cust.overdue_pct.toFixed(1)}%</td>
                            <td className="py-2.5 px-2 text-right text-slate-700 font-bold">{cust.due_invoices}</td>
                            <td className="py-2.5 pl-4 text-center">
                              {cust.above_credit_limit === 1 && (
                                <span className="inline-block text-red-500 font-extrabold text-base">🚩</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                          <td className="py-2.5 pr-4">Total</td>
                          <td className="py-2.5 px-2 text-right">{fmtRaw(1326619)}</td>
                          <td className="py-2.5 px-2 text-right">{fmtRaw(350608)}</td>
                          <td className="py-2.5 px-2 text-right">{fmtRaw(976011)}</td>
                          <td className="py-2.5 px-2 text-right">73.6%</td>
                          <td className="py-2.5 px-2 text-right">115</td>
                          <td className="py-2.5 pl-4" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </>
          )}
        </div>

      </div>

      {/* Login / Auth Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Connect Oracle Data Source</h2>
            <p className="text-xs text-slate-500 mb-4">Enter dev credentials to authenticate Sanctum token with Laravel Gateway.</p>
            <input
              type="email"
              placeholder="Demo email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex gap-2">
              <button onClick={bootstrapToken} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-sm">
                Sign In &amp; Load Data
              </button>
            </div>
            {authStatus && <p className="mt-3 text-xs text-center text-slate-400 font-medium">{authStatus}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
