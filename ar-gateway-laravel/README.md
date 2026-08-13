# AR Dashboard Gateway

Laravel API gateway for the real-time AR dashboard stack.

## Services

- Python engine: `ar-engine-python/oracle_engine.py`
- Laravel gateway: this project
- React frontend: `ar-frontend-react`

## Local Setup

### 1. Python engine

```bash
cd ar-engine-python
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python oracle_engine.py
```

Optional `.env` values:

```env
ORACLE_USER=db_usr
ORACLE_PASS=db_pwd
ORACLE_DSN=localhost:1521/XEPDB1
APP_HOST=127.0.0.1
APP_PORT=8000
```

Oracle XE 21c local connection usually uses:

```env
ORACLE_DSN=localhost:1521/XEPDB1
```

### 2. Laravel gateway

```bash
cd ar-gateway-laravel
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate
php artisan test
php artisan serve --port=8001
```

Laravel environment variables:

```env
APP_KEY=base64:...
PYTHON_ENGINE_URL=http://127.0.0.1:8000/internal/v1/ar-data
APP_URL=http://localhost:8001
CACHE_STORE=array
SESSION_DRIVER=array
```

Useful endpoints:

- `POST /api/v1/dev-token`
- `GET /api/v1/ar-dashboard`

### 3. React frontend

```bash
cd ar-frontend-react
npm install
npm run dev
```

React environment variables:

```env
VITE_LARAVEL_API_URL=http://localhost:8001/api/v1/ar-dashboard
VITE_LARAVEL_DEV_TOKEN_URL=http://localhost:8001/api/v1/dev-token
```

## Recommended Start Order

1. Start the Python engine on port `8000`.
2. Start Laravel on port `8001`.
3. Start the React app.

## Verification

Laravel:

```bash
php artisan test
```

React:

```bash
npm run build
```

## Notes

- The React login panel uses the Laravel dev-token endpoint for local development.
- The Laravel dashboard endpoint is protected by `auth:sanctum`.
- The Laravel controller returns cached payloads when available and stale cache if the Python engine is temporarily unavailable.
