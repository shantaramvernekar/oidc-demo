# OIDC Demo (React + FastAPI + AWS Cognito)

This repository contains a minimal demo app to learn OAuth 2.0 + OIDC flows using:

- **Frontend**: React (Vite)
- **Backend**: FastAPI
- **Auth Server**: AWS Cognito Hosted UI

The app demonstrates:
- Authorization Code + PKCE login flow
- Access token validation in FastAPI via Cognito JWKS
- Role-based access (Cognito groups)
- Protected API calls

---

## Architecture (Summary)

1. React SPA redirects to Cognito Hosted UI with PKCE.
2. Cognito returns an authorization code to the SPA.
3. SPA exchanges the code for tokens (ID + access).
4. SPA calls FastAPI with the access token.
5. FastAPI validates the JWT against Cognito JWKS.

---

## Prerequisites

- Node.js 18+
- Python 3.11+
- AWS account with Cognito configured
- (Optional) AWS CLI for managing Cognito

---

## Cognito Setup (One-Time)

1. Create a **User Pool**.
2. Create an **App client** (no client secret for browser-based flow).
3. Enable **Hosted UI** and choose a domain name.
4. Configure **Callback URLs** and **Logout URLs**:
   - `http://localhost:5173`
5. Enable scopes: `openid`, `email`, `profile`.
6. (Optional) Create groups: `basic`, `admin`.

Record the following values:

- Cognito Domain (e.g. `your-domain.auth.us-east-1.amazoncognito.com`)
- User Pool ID
- App Client ID
- Region

---

## Project Layout

```
backend/
  app/main.py
  requirements.txt
  .env.example
frontend/
  src/
  package.json
  .env.example
```

---

## Local Development

### 1) Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env with your Cognito values

export $(grep -v '^#' .env | xargs)
uvicorn app.main:app --reload --port 8000
```

### 2) Frontend (React)

```bash
cd frontend
npm install
cp .env.example .env
# edit .env with your Cognito + API URL values

npm run dev
```

Open: `http://localhost:5173`

---

## Deployment Steps

### Backend Deployment (example: Render / ECS / EC2)

1. Build your image or deploy code.
2. Set environment variables:
   - `COGNITO_REGION`
   - `COGNITO_USER_POOL_ID`
   - `COGNITO_APP_CLIENT_ID`
3. Run the app on a public URL, e.g. `https://api.example.com`.

### Frontend Deployment (example: Vercel / Netlify / S3)

1. Update `frontend/.env` with production URLs.
2. Build the app:

```bash
cd frontend
npm run build
```

3. Deploy `dist/` to your hosting provider.

---

## Post-Deployment Steps

1. Update Cognito **Callback URLs** and **Logout URLs** with your production frontend URL.
2. Update `VITE_API_BASE_URL` in frontend env to your production backend URL.
3. Verify HTTPS is enabled for both frontend and backend.

---

## Validation Checklist

### Backend Validation

```bash
curl http://localhost:8000/health
```

Expected:
```json
{"status": "ok"}
```

### End-to-End Validation

1. Open the frontend app.
2. Click **Login with Cognito**.
3. Confirm tokens appear in the UI.
4. Click **Load Profile**, **Load Transactions**, and **Load Admin Report**.
5. (Optional) Log in with a user in the `admin` group to access the admin report.

---

## Notes

- Access tokens are validated against Cognito JWKS.
- This demo stores tokens in `sessionStorage` for simplicity.
- For production, consider storing tokens in memory and using secure cookies.

---

## Useful Environment Variables

Backend:
```
COGNITO_REGION
COGNITO_USER_POOL_ID
COGNITO_APP_CLIENT_ID
```

Frontend:
```
VITE_COGNITO_DOMAIN
VITE_COGNITO_CLIENT_ID
VITE_COGNITO_CLIENT_SECRET (optional; only if app client uses a secret)
VITE_REDIRECT_URI
VITE_LOGOUT_URI
VITE_SCOPES
VITE_API_BASE_URL
```
