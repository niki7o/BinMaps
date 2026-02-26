# BinMaps — Стартиране с Docker

## Изисквания
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — единственото нужно нещо

---

## Стартиране (еднократно)

1. Отвори терминал (PowerShell или Command Prompt) в папката на проекта
2. Изпълни:

```
docker compose up --build
```

Първото стартиране ще отнеме **5–10 минути** (изтегля образи, компилира).

---

## Достъп до приложението

| Услуга | Адрес |
|--------|-------|
| **Приложение (Frontend)** | http://localhost |
| **API** | http://localhost/api |
| **AI Сервис** | http://localhost:8000 |

---

## Спиране

```
docker compose down
```

За да изтриеш и базата данни:
```
docker compose down -v
```

---

## При повторно стартиране (без rebuild)

```
docker compose up
```

---

## Структура на проекта

```
BinMaps.API/          — .NET 8 Web API
BinMaps.UI/           — Angular 20 Frontend (nginx)
BinMaps.AI/           — Python FastAPI AI Service
BinMaps.Data/         — Entity Framework Core, Migrations
BinMaps.Infrastructure/ — Services, SignalR
BinMaps.Shared/       — DTOs
BinMaps.Tests/        — Unit Tests (xUnit + Jasmine)
```

---

> Базата данни се създава и мигрира **автоматично** при първото стартиране.
> Тестови данни (контейнери, зони, камиони) се зареждат автоматично от Seeder-а.
