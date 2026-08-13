Berikut adalah **Product Requirement Document (PRD) & Technical Specification** terpadu yang dibagi menjadi 4 Modul PRD saling terhubung (_End-to-End_).

Dokumen ini dirancang agar kamu dan tim pengembang bisa langsung mengeksekusi setiap _layer_ tanpa ada celah (_gap_) atau ketidaksesuaian data (_data contract mismatch_).

---

# 📑 MASTER PRD: REAL-TIME AR DASHBOARD SYSTEM

**Architecture Pattern:** Microservices (Python Engine) + Monolith Gateway (Laravel) + SPA (React)

**Database Source:** Oracle Enterprise DB (`AR_SEGMEN_ERS_TBL`)

---

## 1. SHARED DATA CONTRACT & SCHEMA DEFINITION

_Seluruh layer (Oracle, Python, Laravel, React) WAJIB mematuhi skema data standar ini._

### A. Database Column Mapping (Oracle $\rightarrow$ System Standard)

| Oracle Column    | JSON Key Standard | Data Type | Sample Value         | Description                                                        |
| ---------------- | ----------------- | --------- | -------------------- | ------------------------------------------------------------------ |
| `INVOICE_ID`     | `invoice_id`      | String    | `"INV-2026-001"`     | Primary Key / No. Invoice                                          |
| `AGING_CATEGORY` | `aging_category`  | String    | `"0-3 bln"`          | Umur Piutang (`0-3 bln`, `4-12 bln`, `>12 bln`)                    |
| `STATUS_TAGIH`   | `status_tagih`    | String    | `"AR LAYAK TAGIH"`   | Status (`AR LAYAK TAGIH`, `AR BERMASALAH`, `AR TIDAK LAYAK TAGIH`) |
| `REGION`         | `region`          | String    | `"JAKARTA"`          | Area Wilayah                                                       |
| `INVOICE_STATUS` | `invoice_status`  | String    | `"SUDAH INVOICED"`   | Status Penerbitan (`SUDAH INVOICED`, `UNBILLED`)                   |
| `NILAI_M`        | `nilai_m`         | Float     | `68.95`              | Nominal dalam Miliar Rupiah                                        |
| `UIC`            | `uic`             | String    | `"CGA & SEGMEN"`     | Unit In Charge                                                     |
| `DUE_DATE`       | `due_date`        | String    | `"JUNI 2026"`        | Tanggal/Bulan Jatuh Tempo                                          |
| `ACTION_PLAN`    | `action_plan`     | String    | `"Monitoring bayar"` | Rencana Tindak Lanjut                                              |

---

## 2. PRD MODUL 1: PYTHON DATA ENGINE (MICROSERVICE)

### A. Objective & Scope

Membuat _lightweight microservice_ berbasis Python yang bertugas mengekstraksi data dari Oracle DB, melakukan data cleaning/handling `NULL`, menghitung agregasi finansial via **Pandas**, dan mengekspos REST API internal port `8000`.

### B. Functional Requirements (FR)

1. **FR-PY-01:** Menghubungkan ke Oracle DB menggunakan `python-oracledb` (Thin/Thick mode).
2. **FR-PY-02:** Menangani data `NULL` pada `NILAI_M` (default `0.0`) dan string (default `""`).
3. **FR-PY-03:** Meng-agregasi ringkasan finansial secara _real-time_:

- `total_ar_m`: Sum seluruh `nilai_m`.
- `total_layak_tagih_m`: Sum `nilai_m` di mana `status_tagih == 'AR LAYAK TAGIH'`.
- `total_tidak_layak_m`: Sum `nilai_m` di mana `status_tagih == 'AR TIDAK LAYAK TAGIH'`.

4. **FR-PY-04:** Menyediakan endpoint internal `GET /internal/v1/ar-data`.

### C. Technical Implementation Code (`oracle_engine.py`)

```python
from fastapi import FastAPI, HTTPException
import oracledb
import pandas as pd
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Internal Python Oracle Engine")

# Environment Variables
ORACLE_USER = os.getenv("ORACLE_USER", "db_usr")
ORACLE_PASS = os.getenv("ORACLE_PASS", "db_pwd")
ORACLE_DSN = os.getenv("ORACLE_DSN", "10.10.10.1:1521/ORCL")

def get_connection():
    return oracledb.connect(user=ORACLE_USER, password=ORACLE_PASS, dsn=ORACLE_DSN)

@app.get("/internal/v1/ar-data")
def get_ar_data():
    try:
        conn = get_connection()
        query = """
            SELECT INVOICE_ID, AGING_CATEGORY, STATUS_TAGIH, REGION,
                   INVOICE_STATUS, NILAI_M, UIC, DUE_DATE, ACTION_PLAN
            FROM AR_SEGMEN_ERS_TBL
        """
        df = pd.read_sql(query, con=conn)
        conn.close()

        # Normalisasi Column Name ke JSON Standard
        df.columns = [
            'invoice_id', 'aging_category', 'status_tagih', 'region',
            'invoice_status', 'nilai_m', 'uic', 'due_date', 'action_plan'
        ]

        # Cleaning Data
        df['nilai_m'] = df['nilai_m'].fillna(0.0).astype(float)
        df = df.fillna("")

        # Agregasi Financial Summary
        total_ar = float(df['nilai_m'].sum())
        layak = float(df[df['status_tagih'] == 'AR LAYAK TAGIH']['nilai_m'].sum())
        tidak_layak = float(df[df['status_tagih'] == 'AR TIDAK LAYAK TAGIH']['nilai_m'].sum())

        return {
            "status": "success",
            "summary": {
                "total_ar_m": round(total_ar, 2),
                "total_layak_tagih_m": round(layak, 2),
                "total_tidak_layak_m": round(tidak_layak, 2),
                "total_records": len(df)
            },
            "data": df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Oracle Engine Error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

```

---

## 3. PRD MODUL 2: LARAVEL API GATEWAY & AUTHENTICATION

### A. Objective & Scope

Laravel bertindak sebagai pintu masuk utama (_API Gateway_) bagi Frontend. Laravel mengelola **Autentikasi (Sanctum/OAuth2)**, menembak Python Service di latar belakang, memproteksi Oracle dari _overload_ dengan **Caching 15 detik**, dan merespons Frontend dalam format terstandar.

### B. Functional Requirements (FR)

1. **FR-LV-01:** Memproteksi endpoint dengan middleware `auth:sanctum`.
2. **FR-LV-02:** Mengambil data dari Python Service (`[http://127.0.0.1:8000/internal/v1/ar-data](http://127.0.0.1:8000/internal/v1/ar-data)`).
3. **FR-LV-03:** Menerapkan **In-Memory Caching (Redis/Cache)** selama 15 detik. Jika cache tersedia, Laravel **tidak memanggil Python/Oracle**.
4. **FR-LV-04:** Mengembalikan response JSON terenkapsulasi ke Frontend.

### C. Technical Implementation Code (`ArDashboardController.php`)

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;

class ArDashboardController extends Controller
{
    public function index(Request $request)
    {
        try {
            // Caching Strategy: Keep data in memory for 15 seconds
            $responsePayload = Cache::remember('oracle_ar_data_cache', 15, function () {
                $pythonServiceUrl = config('services.python_engine.url', 'http://127.0.0.1:8000/internal/v1/ar-data');

                $response = Http::timeout(5)->get($pythonServiceUrl);

                if ($response->failed()) {
                    throw new \Exception("Gagal menghubungi Python Data Engine Service.");
                }

                return $response->json();
            });

            return response()->json([
                'success' => true,
                'cached' => Cache::has('oracle_ar_data_cache'),
                'timestamp' => now()->toIso8601String(),
                'payload' => $responsePayload
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }
}

```

#### Routes (`routes/api.php`):

```php
use App\Http\Controllers\ArDashboardController;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/v1/ar-dashboard', [ArDashboardController::class, 'index']);
});

```

---

## 4. PRD MODUL 3: REACT FRONTEND INTEGRATION

### A. Objective & Scope

Membangun antarmuka Dashboard interaktif pada React.js yang mengkonsumsi API Laravel, memperbarui indikator finansial secara _real-time_ via **Polling (tiap 10-15 detik)**, serta menyediakan visualisasi ringkasan kartu dan tabel data.

### B. Functional Requirements (FR)

1. **FR-FE-01:** Menyimpan dan mengirimkan `Bearer Token` pada setiap API Request ke Laravel.
2. **FR-FE-02:** Menjalankan _Auto-polling_ data setiap 15 detik menggunakan `setInterval` / `React Query`.
3. **FR-FE-03:** Menampilkan **Summary Cards** (`Total AR`, `AR Layak Tagih`, `AR Tidak Layak Tagih`).
4. **FR-FE-04:** Menampilkan **Data Table** dengan status badge sesuai `status_tagih`.

### C. Technical Implementation Code (`ArDashboard.jsx`)

```jsx
import React, { useState, useEffect } from "react";
import axios from "axios";

const LARAVEL_API = "http://localhost:8000/api/v1/ar-dashboard";

export default function ArDashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    try {
      const token = localStorage.getItem("auth_token"); // Get Sanctum Token
      const response = await axios.get(LARAVEL_API, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        setDashboardData(response.data.payload);
        setError(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Gagal menyinkronkan data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    // Set Interval Polling 15 Detik
    const timer = setInterval(fetchDashboard, 15000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <div>Loading Dashboard Data...</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;

  const { summary, data } = dashboardData;

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Dashboard AR Segmen ERS</h1>

      {/* Summary Cards */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
        <Card
          title="TOTAL AR"
          value={`Rp ${summary.total_ar_m} M`}
          color="#1e293b"
        />
        <Card
          title="LAYAK TAGIH"
          value={`Rp ${summary.total_layak_tagih_m} M`}
          color="#16a34a"
        />
        <Card
          title="TIDAK LAYAK TAGIH"
          value={`Rp ${summary.total_tidak_layak_m} M`}
          color="#dc2626"
        />
      </div>

      {/* Data Table */}
      <table
        border="1"
        cellPadding="10"
        cellSpacing="0"
        style={{ width: "100%", textAlign: "left" }}
      >
        <thead>
          <tr style={{ backgroundColor: "#f1f5f9" }}>
            <th>Invoice ID</th>
            <th>Aging</th>
            <th>Status Tagih</th>
            <th>Region</th>
            <th>Nilai ($M)</th>
            <th>UIC</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.invoice_id}>
              <td>
                <b>{row.invoice_id}</b>
              </td>
              <td>{row.aging_category}</td>
              <td>
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: "4px",
                    color: "#fff",
                    backgroundColor:
                      row.status_tagih === "AR LAYAK TAGIH"
                        ? "#16a34a"
                        : "#dc2626",
                  }}
                >
                  {row.status_tagih}
                </span>
              </td>
              <td>{row.region}</td>
              <td>
                <b>{row.nilai_m}</b>
              </td>
              <td>{row.uic}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ title, value, color }) {
  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: "15px",
        borderRadius: "8px",
        minWidth: "200px",
      }}
    >
      <span style={{ fontSize: "12px", color: "#666" }}>{title}</span>
      <h2 style={{ margin: "5px 0 0 0", color }}>{value}</h2>
    </div>
  );
}
```

---

## 5. MATRIX VERIFIKASI INTEGRASI (TIADA MIS)

Gunakan tabel pengujian ini saat menyambungkan ketiga _layer_ pada _environment development_:

| Skenario Pengujian                    | Langkah Pengujian                                                                                                                      | Expected Outcome                                                                      | Status Check |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------ |
| **Test Python $\rightarrow$ Oracle**  | Jalankan `python oracle_engine.py` lalu buka `[http://127.0.0.1:8000/internal/v1/ar-data](http://127.0.0.1:8000/internal/v1/ar-data)`. | Menerima JSON berisi `summary` dan `data` dari Oracle tanpa error.                    | `[ ] PASS`   |
| **Test Laravel $\rightarrow$ Python** | Tembak endpoint Laravel `GET /api/v1/ar-dashboard` (dengan Token).                                                                     | Laravel sukses mengembalikan data dari Python dengan HTTP 200.                        | `[ ] PASS`   |
| **Test Caching Protection**           | Refresh endpoint Laravel 5x dalam kurun waktu 10 detik.                                                                                | Field `"cached": true` pada respon Laravel, dan log query Oracle **TIDAK bertambah**. | `[ ] PASS`   |
| **Test React UI Refresh**             | Buka Dashboard React, ubah 1 nilai data di Oracle/Spreadsheet staging.                                                                 | Dalam kurun waktu 15 detik, angka pada Card React **otomatis berubah**.               | `[ ] PASS`   |

---

### Langkah Eksekusi Proyek

1. Simpan dokumen PRD ini sebagai panduan utama arsitektur sistem.
2. Buat service Python `oracle_engine.py` terlebih dahulu dan uji koneksi ke database staging Oracle.
3. Jalankan Laravel dan buat controller `ArDashboardController.php` untuk mengonsumsi service Python tersebut.
4. Hubungkan komponen React `ArDashboard.jsx` ke API Laravel.

### contoh folder dan frameworkny

Dashboard-AR-segmen-ERS/
│
├── 📁 ar-engine-python/ <-- [1] Folder Engine Microservice (Python)
│ ├── venv/ (Virtual environment Python)
│ ├── oracle_engine.py (Script FastAPI & Pandas)
│ ├── requirements.txt (Daftar library: fastapi, pandas, oracledb)
│ └── .env (Kredensial Oracle DB)
│
├── 📁 ar-gateway-laravel/ <-- [2] Folder API Gateway & Auth (Laravel)
│ ├── app/Http/Controllers/ (ArDashboardController.php)
│ ├── routes/api.php (Route API Sanctum)
│ ├── composer.json (Dependencies PHP)
│ └── .env (Kredensial DB Laravel & URL Python Engine)
│
└── 📁 ar-frontend-react/ <-- [3] Folder User Interface (React)
├── src/
│ ├── components/
│ └── ArDashboard.jsx (Tampilan Dashboard UI)
├── package.json (Dependencies React)
└── .env (URL API Laravel)
