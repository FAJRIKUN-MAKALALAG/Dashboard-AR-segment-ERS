# How to Run This Project Locally

This repository contains 3 parts:

- `ar-engine-python`: FastAPI + Oracle data engine
- `ar-gateway-laravel`: Laravel API gateway
- `ar-frontend-react`: React/Vite frontend

It also includes Oracle SQL/Python helpers for creating tables and importing Excel data.

## 1. Prerequisites

Install these first:

- Python 3.10+ (the code uses `venv`, `fastapi`, `pandas`, and `oracledb`)
- PHP 8.3+ with Composer
- Node.js 20+ with npm
- Oracle Database XE or another Oracle instance you can connect to
- Oracle Instant Client, if required by your local Oracle setup

You also need access to the Excel snapshot file used by the importer:

- `ar-engine-python/Open-Item-Snapshot-13-Agustus-2026.xlsx`

## 2. Recommended Start Order

Start services in this order:

1. Oracle Database
2. Python engine
3. Laravel gateway
4. React frontend

## 3. Oracle Database Setup

The Python engine reads and writes Oracle tables. There are 2 setup paths in this repo:

- `oracle-ddl/create_ar_segm_ers_tbl.sql`
- `oracle-ddl/populate_db.py`

There is also a second script:

- `ar-engine-python/setup_tables.py`

### Recommended path for this project

Use `oracle-ddl/create_ar_segm_ers_tbl.sql` as the base schema for the dashboard data model, because it is closer to the Excel import flow and the FastAPI engine than `setup_tables.py`.

### Important schema note

The current scripts are not fully aligned:

- `ar-engine-python/import_excel_to_oracle.py` expects additional columns such as `REPORT_MONTH`, `PENGELOLAAN`, `BP_NUM`, `NIPNAS`, `WITEL`, `SATKER`, `REG`, and `STATUS_INVOICE`
- `oracle-ddl/create_ar_segm_ers_tbl.sql` defines only the core invoice columns
- `ar-engine-python/setup_tables.py` creates a different sample schema again

If you want the Excel importer to work as-is, make sure the Oracle table schema includes all columns the importer inserts.

## 4. Python Engine Setup

Go to the engine folder:

```bash
cd ar-engine-python
```

Create and activate a virtual environment:

```bash
python -m venv venv
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create a local `.env` file in `ar-engine-python/` with Oracle connection settings:

```env
ORACLE_USER=your_oracle_user
ORACLE_PASS=your_oracle_password
ORACLE_DSN=localhost:1521/XEPDB1
APP_HOST=127.0.0.1
APP_PORT=8000
```

Notes:

- `ORACLE_DSN=localhost:1521/XEPDB1` is the common Oracle XE 21c format
- `find_service.py` can help you test other service names such as `XE`, `FREE`, or `ORCL`

Start the engine:

```bash
python oracle_engine.py
```

The main endpoint used by Laravel is:

- `GET /internal/v1/ar-data`

Other useful engine endpoints:

- `GET /`
- `GET /internal/v1/ar-months`
- `GET /internal/v1/ar-segments`
- `GET /internal/v1/tables/{table}`

## 5. Import Excel Data to Oracle

The Excel import script is:

- `ar-engine-python/import_excel_to_oracle.py`

It reads:

- `ar-engine-python/Open-Item-Snapshot-13-Agustus-2026.xlsx`

It maps sheets such as:

- `OI 202606`
- `OI 202607`
- `OI 202608`
- `Detail`

### Import flow

1. Make sure Oracle is running.
2. Make sure the target tables exist in Oracle.
3. Put the Oracle credentials in `ar-engine-python/.env`.
4. Run:

```bash
python import_excel_to_oracle.py
```

### What the importer does

- Reads Excel by header name, not by fixed column position
- Converts monthly snapshot sheets into invoice rows
- Groups customer data into `AR_TOP_CUSTOMERS_TBL`
- Deletes existing rows before inserting fresh data
- Inserts records in batches

### Current limitation

The importer currently writes columns that are not present in the simplest DDL file. If you see Oracle errors like invalid column names, you need to do one of these:

- extend the Oracle table schema to match the importer
- or adjust the importer to match your actual table schema

### Quick validation scripts

There are 2 helpers for checking Oracle connectivity:

- `ar-engine-python/find_service.py`
- `ar-engine-python/check_tables.py`

Use them if you are unsure about the DSN or which schema contains the AR tables.

## 6. Laravel Gateway Setup

Go to the gateway folder:

```bash
cd ar-gateway-laravel
```

Install PHP dependencies:

```bash
composer install
```

Create the app environment file:

```bash
copy .env.example .env
```

Generate the app key:

```bash
php artisan key:generate
```

Set the following values in `ar-gateway-laravel/.env`:

```env
APP_URL=http://localhost:8001
PYTHON_ENGINE_URL=http://127.0.0.1:8000/internal/v1/ar-data
CACHE_STORE=array
SESSION_DRIVER=array
```

If you use a different Oracle engine host or port, update `PYTHON_ENGINE_URL` accordingly.

Run migrations:

```bash
php artisan migrate
```

Run tests if needed:

```bash
php artisan test
```

Start the Laravel server:

```bash
php artisan serve --port=8001
```

Useful Laravel API routes:

- `POST /api/v1/dev-token`
- `GET /api/v1/ar-dashboard`
- `GET /api/v1/tables/{table}`
- `POST /api/v1/tables/{table}`
- `PUT /api/v1/tables/{table}/{id}`
- `DELETE /api/v1/tables/{table}/{id}`

## 7. React Frontend Setup

Go to the frontend folder:

```bash
cd ar-frontend-react
```

Install dependencies:

```bash
npm install
```

Create a `.env` file if the app expects one:

```env
VITE_LARAVEL_API_URL=http://localhost:8001/api/v1/ar-dashboard
VITE_LARAVEL_DEV_TOKEN_URL=http://localhost:8001/api/v1/dev-token
```

Start the frontend:

```bash
npm run dev
```

Build check:

```bash
npm run build
```

## 8. End-to-End Local Run

After all setup is complete:

1. Start Oracle Database.
2. Run `python oracle_engine.py` in `ar-engine-python`.
3. Run `php artisan serve --port=8001` in `ar-gateway-laravel`.
4. Run `npm run dev` in `ar-frontend-react`.
5. Open the React app in the browser.

## 9. Troubleshooting

### Oracle connection fails

- Verify `ORACLE_USER`, `ORACLE_PASS`, and `ORACLE_DSN`
- Try `find_service.py` to test `XE`, `XEPDB1`, `FREE`, `ORCL`, and related service names
- Confirm Oracle XE is running and listening on port `1521`

### Excel import fails on missing columns

- The current schema and importer are not fully synchronized
- Check the Oracle table definition before running the import
- Add the missing columns or adapt the importer

### Laravel cannot reach the Python engine

- Confirm the engine is running on port `8000`
- Confirm `PYTHON_ENGINE_URL` points to `/internal/v1/ar-data`
- Check firewall or localhost binding issues

### React shows no data

- Verify the Laravel gateway is running on port `8001`
- Verify the dev token endpoint works
- Check browser console and Laravel logs

## 10. Files Most Relevant To Local Setup

- [Python engine](/C:/FAJRIKUN/PROJECT%20PORTOFOLIO%20DAN%20CV/PORTOFOLIO/Dashboard-AR-segmen-ERS/ar-engine-python/oracle_engine.py)
- [Excel import script](/C:/FAJRIKUN/PROJECT%20PORTOFOLIO%20DAN%20CV/PORTOFOLIO/Dashboard-AR-segmen-ERS/ar-engine-python/import_excel_to_oracle.py)
- [Oracle DDL](/C:/FAJRIKUN/PROJECT%20PORTOFOLIO%20DAN%20CV/PORTOFOLIO/Dashboard-AR-segmen-ERS/oracle-ddl/create_ar_segm_ers_tbl.sql)
- [Laravel README](/C:/FAJRIKUN/PROJECT%20PORTOFOLIO%20DAN%20CV/PORTOFOLIO/Dashboard-AR-segmen-ERS/ar-gateway-laravel/README.md)

