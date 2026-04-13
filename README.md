# 🐝 Kaptár Dashboard

Méhkaptár mérleg műszerfal PWA (telepíthető webapp telefonra is). A backend **automatikusan** parse-olja a [kaptargsm.hu](https://www.kaptargsm.hu/) oldalán közzétett méréseket, SQLite-ba menti, és szép frontenden keresztül mutatja meg.

## Funkciók

- 📊 **Műszerfal** — aktuális súly, hőmérséklet, akkufeszültség, 24h/7d/30d változás
- 🌼 **Szezonok** — akác / repce / napraforgó / stb., hozamkövetés virágonként
- 📉 **Napi súlyváltozás** oszlopdiagram és táblázat
- ⚠️ **Rajzás-riasztás** — hirtelen súlycsökkenés észlelése
- 🔋 **Akkumulátor-figyelmeztetés** — konfigurálható küszöbbel
- 🔄 **Automatikus háttér-szinkron** — beállítható időközönként (alap: 30 perc)
- 📥 **Export** JSON formátumban
- ⚖️ **Tárázás** — új fiók hozzáadása után egy gombbal korrigálható a súly
- 📱 **PWA** — telefonra telepíthető, offline is működik a gyorsítótárból

## Fejlesztés

### Követelmények

- Node.js ≥ 20
- pnpm (`npm i -g pnpm`)
- Python ≥ 3.10

### Futtatás

```bash
pnpm install

# Backend virtualenv
cd packages/backend
python3 -m venv .venv && .venv/bin/pip install -e .
cd ../..

# Mindkettő egyszerre (frontend :5173, backend :8001)
pnpm dev
```

Nyisd meg: http://localhost:5173

## Deploy — szerverre

Egy parancs Debian/Ubuntu szerverre:

```bash
git clone <repo-url> ~/kaptar-dashboard
cd ~/kaptar-dashboard
./scripts/install-server.sh kaptar.example.com    # HTTPS-el
# vagy
./scripts/install-server.sh                        # csak HTTP :3003
```

A script:
1. telepíti a Node-ot, pnpm-et, Python-t
2. builds-eli a frontendet
3. létrehoz 2 systemd service-t: `kaptar-frontend`, `kaptar-backend`
4. (ha van domain) beállítja a Caddy-t Let's Encrypt HTTPS-el

### DNS nélkül is?

Igen! Két opció:

1. **sslip.io** (ingyenes, azonnal működik):
   ```bash
   ./scripts/install-server.sh kaptar.78-46-230-35.sslip.io
   ```
   Az IP-címet átírva a subdomainben azonnal HTTPS-es PWA-t kapsz.

2. **Saját subdomain** (pl. ha van már valid domaind): mutass egy `A` rekordot a szerverre.

> A PWA telepítéshez **HTTPS szükséges** a legtöbb böngészőnél — innen a Caddy + Let's Encrypt.

## PWA telepítés

1. Nyisd meg az URL-t Chrome / Edge / Safari böngészőben
2. Telepítés gomb a címsorban vagy a böngésző menüjében
3. iOS-en: Megosztás → „Hozzáadás a kezdőképernyőhöz"

## Architektúra

```
kaptar-dashboard/
├── scripts/                  # install-server.sh, update-server.sh
└── packages/
    ├── frontend/             # React 18 + Vite + Tailwind + Recharts (PWA)
    └── backend/              # FastAPI + SQLite + APScheduler
```

- **Backend** (`packages/backend/app/`):
  - `scraper.py` — httpx + BeautifulSoup html parser
  - `scheduler.py` — APScheduler háttér-sync
  - `main.py` — REST API
  - `db.py` — SQLite séma & helpers
- **Frontend** (`packages/frontend/src/`):
  - `App.tsx` — fő shell, tabok, szinkron
  - `pages/` — Dashboard, WeightChange, Seasons, Settings
  - `components/` — StatCard, BatteryGauge, Charts, Modal

### API

| Endpoint | Leírás |
|----------|--------|
| `GET /api/stats?hive_id=J0102466` | Összesített adatok (grafikonokhoz is) |
| `POST /api/sync` | Manuális szinkron |
| `GET /api/measurements` | Nyers mérési adatok |
| `GET /api/hives` · `POST` · `PATCH` · `DELETE` | Kaptár-kezelés |
| `GET /api/flowers` · `POST` · `DELETE` | Virág-kezelés |
| `GET /api/seasons` · `POST /api/seasons/start` · `POST /api/seasons/close` | Szezon-kezelés |
| `GET /api/settings` · `PATCH` | Beállítások (sync-gyakoriság, riasztások) |
| `POST /api/tare?hive_id=…&target_net_kg=…` | Tárázás |

## Karbantartás

```bash
# Frissítés git pull után
./scripts/update-server.sh

# Logok
sudo journalctl -u kaptar-backend -f
sudo journalctl -u kaptar-frontend -f

# Adatbázis elérés
sqlite3 ~/kaptar-dashboard/packages/backend/data.db
```

## Licenc

Saját használatra ❤️
