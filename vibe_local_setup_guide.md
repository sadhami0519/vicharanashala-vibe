# ViBe — Complete Local Setup Guide (Beginner-Friendly)

> Assumes you have **nothing** set up yet. You have forked and cloned the repo,
> and that is all. This guide takes you from a fresh machine to a running ViBe
> application on your local system.

**Time estimate:** 45–90 minutes for a first-time setup.

---

## Before You Start

You will need a computer with:
- **Windows 10/11**, **macOS**, or **Linux**
- Internet connection
- At least 10 GB of free disk space
- A GitHub account (to fork the repo)

This guide uses **PowerShell** commands. If you are on macOS or Linux, the bash equivalents are included where they differ.

---

## Phase 1 — One-Time Machine Setup

These tools only need to be installed once. After that, you never need to do them again.

---

### Step 1.1 — Install Git

**What it is:** A version control tool. You need this to clone the repo and save your changes.

**Download:** [https://git-scm.com/download/win](https://git-scm.com/download/win)

**What to do:**
1. Open the installer. Click through the wizard.
2. On the **"Adjusting your PATH environment"** screen, choose **"Git from the command line and also from 3rd-party software"** (recommended).
3. Keep all other defaults. Click **Install**.
4. When done, click **Finish**.

**Verify it worked:**
```powershell
git --version
# You should see something like: git version 2.49.0.windows.1
```

---

### Step 1.2 — Install Node.js

**What it is:** The runtime that runs JavaScript/TypeScript code. ViBe needs **Node.js 20 LTS or 22**.

**Download:** [https://nodejs.org/](https://nodejs.org/) — click the **LTS** button (the one on the left, not Current).

**What to do:**
1. Run the installer. Click **Next** through all screens.
2. **Important:** On the screen titled **"Tools for Native Modules"**, check ✅ **"Automatically install necessary tools"**. This installs build tools the Node ecosystem needs. Accept all defaults.
3. Click **Install**. Wait for it to finish. Click **Finish**.

**Verify it worked:**
```powershell
node --version
# You should see something like: v20.18.1
npm --version
# You should see something like: 10.9.0
```

> **Note:** If you already have Node installed but it's an older version (e.g. v14 or v16), uninstall it first from Windows Settings → Apps → Installed Apps → search "Node.js" → Uninstall. Then install the LTS version fresh.

---

### Step 1.3 — Install pnpm

**What it is:** A faster, more efficient package manager for Node.js. ViBe uses pnpm instead of npm.

**Open a new PowerShell window** (close and reopen it so Node is on your PATH), then run:

```powershell
npm install -g pnpm
```

**Verify:**
```powershell
pnpm --version
# You should see something like: 10.5.1
```

---

### Step 1.4 — Install Docker Desktop

**What it is:** Docker runs MongoDB (your database) in a lightweight container. You could install MongoDB directly, but Docker is much easier and is what the ViBe team uses.

**Download:** [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)

**What to do:**
1. Run the installer. Check ✅ **"Use WSL 2 instead of Hyper-V"** if prompted (recommended for Windows).
2. Click **Install**. Wait. Restart your computer when asked.
3. After restart, Docker Desktop will open. Wait for the whale icon in your system tray to say **"Docker Desktop is running"** — this takes about 1–2 minutes on first boot.

**Verify:**
Open a new PowerShell window and run:
```powershell
docker --version
# You should see: Docker version 27.x.x, build xxxxxx
docker ps
# You should see: CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES
# (empty list is fine — no containers running yet)
```

> If Docker fails to start (common on Windows first time), open **Windows Features** (`appwiz.cpl`), make sure **Virtual Machine Platform** and **Windows Subsystem for Linux** are enabled. Restart your PC and try again.

---

### Step 1.5 — Install Firebase CLI

**What it is:** Firebase's command-line tool. You need this to run the **Auth emulator** — a local fake Firebase that handles login/signup without needing a real Firebase account or internet.

**Open a new PowerShell window and run:**

```powershell
npm install -g firebase-tools
```

**Verify:**
```powershell
firebase --version
# You should see something like: 13.4.0
```

---

## Phase 2 — Fork and Clone the Repo

*Skip this phase if you already have the repo cloned.*

---

### Step 2.1 — Fork the Repository on GitHub

1. Go to: [https://github.com/vicharanashala/ViBe](https://github.com/vicharanashala/ViBe)
2. Click the **Fork** button (top right corner of the page).
3. If prompted "Where should we fork this repository?", click your GitHub username.
4. Wait a few seconds. You'll be taken to your own copy at `github.com/<your-username>/ViBe`.

### Step 2.2 — Clone Your Fork

Back in PowerShell, navigate to where you want to keep the project (e.g. your home folder or Desktop — anywhere you can find it again):

```powershell
cd ~
# Or to go to Desktop:
# cd ~/Desktop

git clone https://github.com/<your-username>/ViBe.git
# Example: git clone https://github.com/johndoe/ViBe.git
```

> Replace `<your-username>` with your actual GitHub username.

This downloads the repo to a new folder called `ViBe` in your current directory.

### Step 2.3 — Navigate Into the Project

```powershell
cd ViBe
```

From now on, all commands in this guide assume you are inside the project folder:

```powershell
# Verify you're in the right place
pwd
# Should show something like: C:\Users\<YourName>\ViBe

ls
# You should see folders like: backend, frontend, docs, self-hosting...
```

---

## Phase 3 — Install Project Dependencies

### Step 3.1 — Install all npm packages

From inside the `ViBe` project folder (you should already be there from Step 2.3):

```powershell
pnpm install
```

This installs all the packages the project needs. It will take 2–5 minutes.

> **Do not** pass `--ignore-scripts`. The project has a `postinstall` script that patches a library bug — skipping it will cause confusing errors.

### Step 3.2 — Download the MongoDB test binary (one-time)

The project uses an in-memory MongoDB for tests. Download the binary so tests start instantly:

```powershell
pnpm binaries
```

> You will only need to do this once. It downloads about 200 MB.

---

## Phase 4 — Start MongoDB

MongoDB is your database. It needs to be running before the backend starts.

### Step 4.1 — Start MongoDB with Docker

```powershell
docker run -d --name vibe-mongo -p 27017:27017 mongo:7
```

**What this does:**
- Downloads the official MongoDB image (first time only, ~200 MB)
- Starts it in the background (`-d`) as a container named `vibe-mongo`
- Exposes it on port `27017` so your backend can connect to it

### Step 4.2 — Verify MongoDB is running

```powershell
docker ps
# You should see vibe-mongo in the list with status "Up"

docker logs vibe-mongo
# You should see: "Waiting for connections" on port 27017
```

> **Note:** You only need to run Step 4.1 once. Every time you restart your computer, run `docker start vibe-mongo` to bring it back up. The data persists inside the container even when stopped.

---

## Phase 5 — Set Up Firebase Auth Emulator

The Auth emulator lets you log in and sign up without a real Firebase project or internet connection.

### Step 5.1 — Create a Firebase Project (in your browser)

1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Click **"Add project"**.
3. Name it anything you like, e.g. `vibe-dev`. Click **Continue**.
4. Google Analytics — click **Continue** (you can disable it if you want, not required).
5. Click **Create project**. Wait 30 seconds.
6. You land on the Firebase project dashboard. Click **Build → Authentication → Get started**.
7. Click the **Sign-in method** tab at the top.
8. Click on **Google**, toggle it to **Enable**, pick any email, and click **Save**.

> **You do not need to set up a real app** — we only need the emulator. The Firebase project config is for the **frontend**, which we will set up in Phase 7.

### Step 5.2 — Get your Firebase Web SDK Config

1. In your Firebase project, click the **gear icon** (⚙️) next to **Project Overview** (top left).
2. Click **Project settings**.
3. Scroll down to **Your apps**. If no app is listed, click **Add app → Web** (</> icon).
4. Give it any nickname, e.g. `ViBe Dev`. Do NOT check Firebase Hosting. Click **Register app**.
5. You will see a `const firebaseConfig = { ... }` object. Copy the values from it — you will need them in Phase 7.

> **Keep this browser tab open** — you will need these values soon.

### Step 5.3 — Start the Firebase Auth Emulator

Back in PowerShell, navigate to the backend folder and start the emulator:

```powershell
cd backend
firebase emulators:start --only auth --project demo-test
```

> **Important:** Use `--project demo-test` exactly as shown. This project name does not need to match your Firebase project in the browser — the emulator is standalone.

You should see output like:

```
▲  Emulator Hub running at http://127.0.0.1:4400
...
✔  Auth emulator started at http://127.0.0.1:9099
```

**Keep this terminal window open.** The emulator will keep running. Do not close it.

---

## Phase 6 — Configure the Backend

### Step 6.1 — Create the `.env` file

The backend needs a configuration file. Create a new file at:

```
ViBe/backend/.env
```

**What to do:**
1. Open a text editor (Notepad, VS Code — anything).
2. Paste the content below exactly as shown.
3. Save the file as `.env` inside the `backend` folder (not inside `ViBe` itself — inside `ViBe/backend/`).

```dotenv
NODE_ENV=development
APP_PORT=3141
APP_URL=http://localhost:3141
APP_ORIGINS=http://localhost:5173
APP_ROUTE_PREFIX=/api
APP_MODULE=all
FRONTEND_URL=http://localhost:5173
ADMIN_PASSWORD=changeme

# Local MongoDB (Docker)
DB_URL=mongodb://localhost:27017
DB_NAME=vibe

# Firebase Auth emulator
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_EMULATOR_HOST=127.0.0.1:4000
GCLOUD_PROJECT=demo-test

# Leave these blank (disable AI features for local dev)
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
# ANTHROPIC_CRED=sk-ant-...
# AI_SERVER_IP=
# AI_SERVER_PORT=

# Disable optional services
SENTRY_DSN=
ENABLE_DB_BACKUP=false
ENABLE_HP_JOB=false
# Spaced Repetition reminder cron: gate at `true` to enable the hourly
# review-reminder job (`Asia/Kolkata`). Default `false` so local dev doesn't
# flood students with test emails.
ENABLE_SPACED_REPETITION_JOB=false
IS_RECAPTCHA_ENABLED=false
RECAPTCHA_SECRET_KEY=

# Email (SMTP) — used for course invites and spaced repetition reminders
# For Gmail: use an App Password (Account → Security → 2-Step → App Passwords)
SMTP_USER=
SMTP_PASS=
```

> **On Windows:** If you save as `.env` and it becomes `.env.txt`, save as `".env"` (with quotes) in Notepad, or use VS Code → File → Save As → set "Save as type" to All Files.

### Step 6.2 — Run the Backend

Still in the `backend` folder, start the development server:

```powershell
cd backend
pnpm dev
```

The first time you run this, it:
1. Compiles all TypeScript to JavaScript (`tsc`)
2. Starts a watch process (`nodemon`) that recompiles as you edit
3. Boots Express and connects to MongoDB
4. Registers all route controllers

**Wait 20–30 seconds.** You should see output that ends with something like:

```
Server listening on http://localhost:3141
```

### Step 6.3 — Verify the Backend is Running

Open a **new PowerShell window** and run:

```powershell
curl http://localhost:3141/health
```

You should see:
```json
{"status":"ok","timestamp":"2026-...","environment":"development"}
```

If you see this, the backend is healthy and running. ✅

**Optional:** Open your browser and go to `http://localhost:3141/reference` to see the API documentation (Scalar UI).

---

## Phase 7 — Set Up the Frontend

### Step 7.1 — Configure Environment Variables

The frontend needs to know where the backend is and how to connect to Firebase.

1. Open the `ViBe/frontend` folder.
2. Find the file named `.env.example`. Copy it and rename the copy to `.env`.

**On Windows (with PowerShell):**
```powershell
cd frontend
copy .env.example .env
```

3. Open `frontend/.env` in a text editor and fill in the values:

```dotenv
# Where the backend is running
VITE_BASE_URL=http://localhost:3141/api

# Firebase config — from Step 5.2 (your browser tab)
# Copy the values from your Firebase project settings:
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

> **Where to find these values:** Go back to your Firebase Console browser tab → ⚙️ Project Settings → Scroll to **Your apps** → Click on your web app. The config values are there.

### Step 7.2 — Start the Frontend Development Server

In PowerShell, from the `ViBe` root folder:

```powershell
cd frontend
pnpm dev
```

The first time, it installs frontend packages. Then you should see:

```
  VITE v6.x.x  ready in 800ms

  ➜  Local:   http://localhost:5173/
```

### Step 7.3 — Verify the Frontend is Running

Open your browser and go to:

```
http://localhost:5173
```

You should see the ViBe login page. ✅

---

## Phase 8 — Create a Test Account

### Step 8.1 — Register a New Account

1. With both the frontend (`http://localhost:5173`) and the Firebase Auth emulator running, click **Sign up** on the login page.
2. Enter any email (e.g. `test@demo.com`) and a password (e.g. `test123456`).
3. Click **Create account**.

> The emulator accepts any email/password combination. It does not send real emails or require verification.

4. You should be redirected to the role selection page. Pick **Student** or **Teacher**.

### Step 8.2 — Verify You Can Log In

1. Log out.
2. Sign back in with the same credentials.
3. You should land on the dashboard without errors.

> If sign-up or login fails, double-check that:
> - `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` is in `backend/.env`
> - The Firebase emulator terminal is still running (Phase 5.3)
> - The backend terminal (`pnpm dev`) is still running (Phase 6.2)

---

## Phase 9 — Run the Tests (Optional but Recommended)

This verifies your entire setup is working correctly:

```powershell
cd backend
pnpm test:ci
```

You should see something like:

```
Test Files  20 passed
Tests       287 passed
```

All tests should pass. ✅ If any fail, the most common cause is that the MongoDB container or Firebase emulator stopped — restart them and try again.

---

## Quick Reference — Starting ViBe After a Restart

Every time you restart your computer or open a new terminal, you need to start the services in this order:

```powershell
# 1. Start Docker (open Docker Desktop app, or run:)
docker start vibe-mongo

# 2. In a new terminal — start the Firebase emulator:
cd ViBe/backend
firebase emulators:start --only auth --project demo-test

# 3. In another new terminal — start the backend:
cd ViBe/backend
pnpm dev

# 4. In another new terminal — start the frontend:
cd ViBe/frontend
pnpm dev
```

Then open `http://localhost:5173` in your browser.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Environment variable DB_URL is not set` | The `backend/.env` file is missing or named wrong. It must be exactly `backend/.env` (no extension). |
| Auth routes give "invalid-credential" errors | Firebase emulator is not running. Restart it: `cd backend; firebase emulators:start --only auth --project demo-test` |
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running. Run: `docker start vibe-mongo` |
| `pnpm: command not found` | Close and reopen your terminal — pnpm needs to be on PATH |
| Frontend shows a blank white page | Check the browser console (F12 → Console). Usually a `.env` value is wrong |
| Sign up says "email already in use" | The emulator has that user from a previous session. Use a different email, or run `firebase emulators:start --only auth --project demo-test --clear` to wipe all emulator data |
| `docker: command not found` | Docker Desktop is not installed or not running. Open Docker Desktop from your Start Menu |
| `firebase: command not found` | Run `npm install -g firebase-tools` again |
| Review emails not sending | Set `SMTP_USER` + `SMTP_PASS` in `backend/.env`. For Gmail: generate an **App Password** (Google Account → Security → 2-Step Verification → App Passwords), not your login password. Restart the backend after updating `.env`. |

---

## What's Running and Where

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | `http://localhost:5173` | The web app UI |
| Backend | `http://localhost:3141` | API server |
| API docs | `http://localhost:3141/reference` | Interactive API docs |
| Firebase emulator | `http://127.0.0.1:9099` | Fake auth (no real accounts needed) |
| MongoDB | `localhost:27017` | Database (running in Docker) |

---

*Following these steps means you have a fully running ViBe stack on your machine. Happy coding!*