# BinMaps

Система за мониторинг и управление на контейнери за отпадъци в реално време.

## Технологии

- **Backend** — .NET 8 Web API, ASP.NET Core Identity, SignalR, Entity Framework Core
- **Frontend** — Angular 17, Leaflet, Chart.js
- **AI сервис** — Python FastAPI (анализ на снимки с компютърно зрение)
- **База данни** — MS SQL Server
- **Контейнеризация** — Docker / Docker Compose

---

## Бързо стартиране с Docker

### Изисквания
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 1. Настрой средата

```bash
cp .env.example .env
```

Редактирай `.env` и попълни:

| Променлива | Описание |
|---|---|
| `ConnectionStrings__DefaultConnection` | Connection string към SQL Server |
| `Jwt__Key` | Таен ключ за JWT (мин. 32 символа) |
| `ExternalAPIs__TomTom__ApiKey` | API ключ от [TomTom](https://developer.tomtom.com/) за маршрути |
| `AllowedOrigins` | Разрешени произходи (напр. `http://localhost:4300`) |

> **Бележка:** Температурите се вземат от [Open-Meteo](https://open-meteo.com/) — безплатен API, **без ключ**.

### 2. Стартирай

```bash
docker compose up --build
```

Първото стартиране отнема **5–10 минути** (изтегля образи, компилира).

### 3. Достъп

| Услуга | Адрес |
|---|---|
| Приложение (UI) | http://localhost:4300 |
| API | http://localhost:4300/api |
| AI Сервис (директно) | http://localhost:8000 |

### Спиране

```bash
docker compose down
```

За пълно изчистване (вкл. база данни):
```bash
docker compose down -v
```

### Повторно стартиране без rebuild

```bash
docker compose up
```

---

## Локална разработка (без Docker)

### Изисквания
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Node.js 18+](https://nodejs.org/) и npm
- [SQL Server](https://www.microsoft.com/en-us/sql-server/sql-server-downloads) (Developer Edition или SQL Server Express)
- [Python 3.11+](https://www.python.org/) (за AI сервиса)

### База данни

Редактирай `BinMaps.API/appsettings.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost\\SQLEXPRESS;Database=BinMaps;Trusted_Connection=True;TrustServerCertificate=True"
  }
}
```

Базата се създава и мигрира **автоматично** при стартиране на API-то. Seed данни (зони, контейнери, камиони) се зареждат при първо стартиране.

### Backend (.NET API)

```bash
cd BinMaps.API
dotnet run
```

API ще се стартира на `http://localhost:8080`.

### AI сервис (Python)

```bash
cd BinMaps.AI
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend (Angular)

```bash
cd BinMaps.UI/binmaps-ui
npm install
ng serve --port 4200
```

Frontend ще се стартира на `http://localhost:4200`.

> При локална разработка Angular dev server проксира `/api/` и `/hubs/` директно към `http://localhost:8080`. Провери `proxy.conf.json` ако е необходимо.

---

## Структура на проекта

```
BinMaps.API/            — ASP.NET Core Web API (контролери, SignalR хъб)
BinMaps.UI/             — Angular 17 Frontend + nginx конфигурация
BinMaps.AI/             — Python FastAPI (AI анализ на снимки)
BinMaps.Data/           — Entity Framework Core модели, DbContext, миграции
BinMaps.Infrastructure/ — Услуги, фонови задачи, SignalR, симулатор
BinMaps.Shared/         — DTO-та (споделени между проектите)
BinMaps.Tests/          — xUnit тестове
```

---

## Роли

| Роля | Права |
|---|---|
| **Admin** | Пълен достъп: управление на контейнери, потребители, камиони, доклади |
| **Driver** | Генериране и навигация по маршрути, изпразване на контейнери |
| **User** | Подаване на сигнали, преглед на картата |

---

> Базата данни и seed данните се създават **автоматично** при първо стартиране — не е нужна ръчна конфигурация.

---

## IoT и комуникация на сензорите

BinMaps третира сензорите като абстрактни телеметрични източници — код-базата не зависи от конкретен транспортен протокол.
Модулът `FillageSimulator` емулира периодичен "пулс" от всеки сензор (ниво на запълване, температура, батерия) без да се ангажира с физически слой.

В реална смарт-сити инсталация типовете транспорт биха били:

- **LoRaWAN** — далечен обхват (2–5 km в градска среда), ниска консумация, подходящ за батерии с години автономност; duty-cycle ограничение (обикновено ≤1%) → около 1 pulse на 15–60 минути.
- **NB-IoT** — по-висок throughput, по-добро покритие в сутерени, но по-висок разход на енергия.
- **Wi-Fi mesh** — само за гъсти градски центрове, бърз цикъл, ограничено от захранване.

Seed логиката (`FillageSimulator.CalculateBatteryDrain`) е калибрирана така, че една батерия да изтрае около **година и половина** при 60-секунден цикъл в симулацията — изкуствено ускорение, за да се види ефектът по време на демо. Реален LoRaWAN профил би дал 3–5 години автономност.

Решение за изключване на физическия LoRaWAN/NB-IoT адаптер от кода е съзнателно: всяка реална интеграция би била зависима от конкретен gateway (MQTT от ChirpStack, HTTP от The Things Network и т.н.) и би утежнила проекта без да добави демонстративна стойност.