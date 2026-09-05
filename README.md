# Investment Portfolio Analytics

Веб-приложение для управления и анализа личного инвестиционного портфеля на российском рынке.

Проект находится в разработке.

Основная идея — позволить пользователю добавлять уже имеющиеся активы, вести несколько инвестиционных портфелей, учитывать сделки и комиссии, получать текущую структуру портфеля и рассчитывать ключевые показатели доходности и риска.

---

## 🎯 Цели проекта

Приложение должно позволять:

* создавать несколько инвестиционных портфелей;
* добавлять уже имеющиеся ценные бумаги;
* получать информацию о ценных бумагах с Московской биржи;
* учитывать покупки и продажи;
* учитывать брокерские комиссии;
* учитывать дивиденды и купоны;
* рассчитывать текущие позиции;
* рассчитывать стоимость портфеля;
* анализировать структуру портфеля;
* рассчитывать доходность;
* сравнивать несколько портфелей;
* объединять несколько портфелей в общий инвестиционный профиль;
* отображать основные показатели риска;
* визуализировать историческую и ожидаемую динамику портфеля.

В дальнейшем приложение может быть развёрнуто как полноценный веб-сервис с авторизацией пользователей.

---

# 🏗 Архитектура

Проект разделён на frontend и backend.

```text
                    ┌─────────────────────┐
                    │      Browser        │
                    │                     │
                    │  React + TypeScript │
                    └──────────┬──────────┘
                               │
                               │ HTTP
                               ▼
                    ┌─────────────────────┐
                    │       Backend       │
                    │                     │
                    │ Express + TypeScript│
                    └───────┬─────┬───────┘
                            │     │
                 ┌──────────┘     └──────────┐
                 │                           │
                 ▼                           ▼
        ┌─────────────────┐         ┌─────────────────┐
        │   SQLite /      │         │    MOEX ISS     │
        │     Drizzle     │         │      API        │
        └─────────────────┘         └─────────────────┘
```

### Frontend

Frontend отвечает за:

* интерфейс приложения;
* отображение портфелей;
* формы добавления активов;
* таблицы;
* графики;
* пользовательские действия.

Стек:

* React
* TypeScript
* Vite

### Backend

Backend отвечает за:

* API приложения;
* бизнес-логику;
* работу с базой данных;
* получение данных от MOEX;
* нормализацию данных внешних API;
* расчёты портфеля.

Стек:

* Node.js
* Express
* TypeScript

### Database

На текущем этапе используется:

* SQLite
* Drizzle ORM
* Drizzle Kit

SQLite выбран для простого локального старта.

В дальнейшем база данных может быть перенесена на PostgreSQL без изменения основной бизнес-модели приложения.

### External API

Для получения информации о российских ценных бумагах используется:

**MOEX ISS API**

Документация:

https://www.moex.com/iss

---

# 📁 Структура проекта

Текущая структура:

```text
investment/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
│
├── backend/
│   ├── src/
│   │   │
│   │   ├── db/
│   │   │   └── schema.ts
│   │   │
│   │   ├── integrations/
│   │   │   └── moex/
│   │   │       ├── moex.client.ts
│   │   │       ├── moex.types.ts
│   │   │       └── moex.mapper.ts
│   │   │
│   │   ├── instruments/
│   │   │   └── instrument.service.ts
│   │   │
│   │   └── server.ts
│   │
│   ├── data/
│   │   └── portfolio.db
│   │
│   ├── drizzle/
│   ├── drizzle.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── .gitignore
├── README.md
└── .git/
```

> `portfolio.db` является локальной базой данных и не должен попадать в Git.

---

# 🚀 Запуск проекта

## Требования

Перед началом работы необходимо установить:

* Node.js LTS
* npm
* Git

Проверка:

```bash
node --version
npm --version
git --version
```

---

# 🔧 Установка

Клонировать репозиторий:

```bash
git clone git@github.com:Allarepossible/investment.git
```

Перейти в проект:

```bash
cd investment
```

---

# ▶️ Запуск Backend

Перейти в backend:

```bash
cd backend
```

Установить зависимости:

```bash
npm install
```

Запустить development server:

```bash
npm run dev
```

Backend запускается на:

```text
http://localhost:3000
```

---

# ▶️ Запуск Frontend

В отдельном терминале:

```bash
cd investment/frontend
```

Установить зависимости:

```bash
npm install
```

Запустить:

```bash
npm run dev
```

Vite покажет адрес локального frontend, обычно:

```text
http://localhost:5173
```

---

# 🩺 Проверка Backend

После запуска backend можно проверить health endpoint:

```text
GET /api/health
```

В браузере:

```text
http://localhost:3000/api/health
```

Ожидаемый ответ:

```json
{
  "status": "ok"
}
```

---

# 📈 Работа с MOEX

Backend взаимодействует с MOEX ISS API.

На текущем этапе реализовано получение информации о ценной бумаге по тикеру.

Например:

```text
GET /api/instruments/SBER
```

Backend:

1. получает тикер;
2. отправляет запрос в MOEX;
3. получает ответ ISS API;
4. преобразует ответ MOEX во внутренний формат приложения;
5. возвращает нормализованный объект.

Пример результата:

```json
{
  "ticker": "SBER",
  "name": "Сбербанк",
  "type": "common_share",
  "exchange": "MOEX",
  "board": "TQBR",
  "currency": "RUB",
  "lotSize": null,
  "minPriceStep": null
}
```

---

# 🔌 MOEX Integration

Интеграция с MOEX специально отделена от бизнес-логики приложения.

```text
backend/src/integrations/moex/
```

### `moex.client.ts`

Отвечает за HTTP-запросы к MOEX ISS API.

Задача клиента — работать с внешним API и не содержать бизнес-логику приложения.

### `moex.types.ts`

Содержит TypeScript-типы для ответов MOEX.

MOEX ISS возвращает данные в формате блоков:

```json
{
  "description": {
    "columns": [],
    "data": []
  },
  "boards": {
    "columns": [],
    "data": []
  }
}
```

Поэтому внешний формат не используется напрямую внутри приложения.

### `moex.mapper.ts`

Преобразует формат MOEX в собственную модель:

```text
MOEX response
      ↓
MOEX mapper
      ↓
NormalizedInstrument
```

Это позволяет в будущем заменить источник данных без необходимости переписывать всю бизнес-логику.

---

# 💾 Database

Для работы с базой используется Drizzle ORM.

Основная схема находится здесь:

```text
backend/src/db/schema.ts
```

На текущем этапе создана таблица `instruments`.

Она содержит основные данные финансового инструмента:

* ticker;
* name;
* type;
* exchange;
* board;
* currency;
* lot size;
* minimum price step;
* даты создания и обновления.

---

# 🗄 Database Commands

Все команды выполняются из:

```text
backend/
```

Генерация миграций:

```bash
npm run db:generate
```

Применение миграций:

```bash
npm run db:migrate
```

---

# 🧩 Основная модель данных

В дальнейшем приложение будет строиться вокруг нескольких основных сущностей.

## Instrument

Финансовый инструмент:

```text
Instrument
├── ticker
├── name
├── type
├── exchange
├── board
├── currency
├── lotSize
└── minPriceStep
```

Например:

```text
SBER
Сбербанк
Акция
MOEX
TQBR
RUB
```

---

## Portfolio

Инвестиционный портфель пользователя.

Например:

```text
Portfolio
├── ID
├── name
└── createdAt
```

Пользователь сможет иметь несколько портфелей:

```text
Мои инвестиции
│
├── Брокер 1
├── Брокер 2
└── Долгосрочный портфель
```

---

## Transaction

Операция с активом.

В будущем будут поддерживаться:

* BUY
* SELL
* DIVIDEND
* COUPON
* FEE
* DEPOSIT
* WITHDRAWAL
* TAX

Пример:

```text
Transaction
├── portfolio
├── instrument
├── type
├── quantity
├── price
├── commission
├── date
└── currency
```

---

# 🧮 Почему позиции не являются основной сущностью

Текущая позиция должна вычисляться из операций.

Например:

```text
BUY 100 SBER
BUY 50 SBER
SELL 20 SBER
```

Текущая позиция:

```text
100 + 50 - 20 = 130 SBER
```

Поэтому `Position` не должна быть единственным источником истины.

Источником истины являются транзакции:

```text
Transactions
      ↓
Position calculation
      ↓
Portfolio analytics
```

Это позволит корректно восстанавливать историю портфеля и пересчитывать показатели.

---

# 📊 План аналитики

После реализации транзакций приложение должно рассчитывать:

### Portfolio value

Текущая стоимость портфеля:

```text
Σ(quantity × current price)
```

### Allocation

Структура портфеля:

```text
SBER      35%
LKOH      25%
YDEX      15%
Bonds     15%
Cash      10%
```

### Profit / Loss

Прибыль или убыток по позиции и портфелю.

### Return

Доходность портфеля с учётом денежных потоков.

В дальнейшем планируется поддержка:

* Time-Weighted Return (TWR)
* Money-Weighted Return
* XIRR

---

# 💰 Комиссии

Комиссии брокера будут учитываться непосредственно в операциях.

Например:

```text
BUY
Quantity: 100
Price: 300 RUB
Gross: 30 000 RUB
Commission: 60 RUB
```

Итоговая стоимость операции:

```text
30 060 RUB
```

Это позволит учитывать реальные расходы инвестора при расчёте результата.

---

# 📉 Риск-метрики

В дальнейшем планируется добавить:

* volatility;
* maximum drawdown;
* Sharpe ratio;
* Sortino ratio;
* beta;
* correlation;
* Value at Risk;
* концентрацию по активам;
* концентрацию по секторам;
* концентрацию по валютам.

Метрики будут отображаться как в виде таблиц, так и в виде графиков.

---

# 📊 Визуализация

Планируемые графики:

### Структура портфеля

```text
Asset allocation
```

Например:

```text
Stocks      60%
Bonds       25%
Cash        10%
Other        5%
```

### Историческая стоимость

```text
Portfolio value
       │
       │          ╭──────
       │      ╭───╯
       │  ╭───╯
       │──╯
       └──────────────────
              Time
```

### Доходность

График изменения стоимости и доходности портфеля во времени.

### Прогноз

В дальнейшем возможна модель прогнозирования стоимости портфеля на основе:

* ожидаемой доходности;
* волатильности;
* исторических данных;
* пользовательских сценариев.

---

# 🔐 Безопасность

На текущем этапе приложение предназначено для локальной разработки.

В production-версии планируется:

* регистрация пользователей;
* авторизация;
* безопасное хранение сессий;
* разделение данных разных пользователей;
* валидация входных данных;
* защита API;
* rate limiting;
* безопасное хранение секретов;
* HTTPS.

Никогда не следует добавлять в Git:

```text
.env
.env.*
*.db
```

или приватные ключи и токены.

---

# 🌱 Git Workflow

Основная ветка:

```text
main
```

Перед началом работы:

```bash
git pull
```

После завершения логического изменения:

```bash
git status
git add .
git commit -m "Описание изменения"
git push
```

Пример:

```bash
git add .
git commit -m "Add MOEX instrument integration"
git push
```

---

# 🧪 Development Principles

При разработке проекта придерживаемся нескольких принципов.

## 1. Маленькие изменения

Каждый новый функциональный блок реализуется небольшими шагами.

Например:

```text
API
↓
Test
↓
Database
↓
Test
↓
Frontend
↓
Test
```

## 2. Не смешивать внешний API и бизнес-логику

Плохо:

```text
Frontend
   ↓
MOEX
```

Правильно:

```text
Frontend
   ↓
Backend
   ↓
MOEX
```

## 3. Нормализация внешних данных

MOEX может изменить формат ответа или в будущем появится другой источник данных.

Поэтому:

```text
External API
     ↓
Adapter / Mapper
     ↓
Internal model
```

## 4. Database как источник состояния приложения

Данные приложения хранятся в собственной базе.

MOEX используется как источник рыночной информации, а не как база данных нашего приложения.

---

# 🛠 Технологический стек

| Часть                | Технология   |
| -------------------- | ------------ |
| Frontend             | React        |
| Language             | TypeScript   |
| Frontend tooling     | Vite         |
| Backend              | Node.js      |
| API framework        | Express      |
| Database             | SQLite       |
| ORM                  | Drizzle ORM  |
| External market data | MOEX ISS API |
| Version control      | Git          |
| Repository           | GitHub       |

---

# 🗺 Roadmap

## Phase 1 — Foundation

* [x] Создать Git repository
* [x] Создать React frontend
* [x] Создать Node.js backend
* [x] Настроить Express
* [x] Настроить TypeScript
* [x] Настроить SQLite
* [x] Настроить Drizzle
* [x] Подключить MOEX ISS API
* [x] Получать данные по тикеру
* [x] Нормализовать данные MOEX

---

## Phase 2 — Instruments

* [ ] Сохранять инструменты в SQLite
* [ ] Поиск инструментов
* [ ] Добавление инструмента в приложение
* [ ] Получение актуальной цены
* [ ] Получение lot size
* [ ] Получение minimum price step
* [ ] Поддержка акций
* [ ] Поддержка облигаций
* [ ] Поддержка фондов
* [ ] Поддержка других типов инструментов

---

## Phase 3 — Portfolios

* [ ] Создание портфеля
* [ ] Редактирование портфеля
* [ ] Удаление портфеля
* [ ] Несколько портфелей
* [ ] Общий агрегированный портфель

---

## Phase 4 — Transactions

* [ ] Покупка
* [ ] Продажа
* [ ] Дивиденды
* [ ] Купоны
* [ ] Комиссии
* [ ] Пополнение счёта
* [ ] Вывод средств
* [ ] Налоги
* [ ] История операций

---

## Phase 5 — Analytics

* [ ] Расчёт текущих позиций
* [ ] Portfolio value
* [ ] Profit / Loss
* [ ] Allocation
* [ ] Доходность
* [ ] TWR
* [ ] XIRR
* [ ] Historical performance

---

## Phase 6 — Risk

* [ ] Volatility
* [ ] Maximum drawdown
* [ ] Sharpe ratio
* [ ] Sortino ratio
* [ ] Beta
* [ ] Correlation
* [ ] VaR
* [ ] Concentration analysis

---

## Phase 7 — UI

* [ ] Dashboard
* [ ] Portfolio page
* [ ] Instrument page
* [ ] Transaction history
* [ ] Charts
* [ ] Analytics tables
* [ ] Portfolio comparison
* [ ] Responsive layout

---

## Phase 8 — Authentication & Production

* [ ] User registration
* [ ] Login
* [ ] Session management
* [ ] User-specific portfolios
* [ ] API security
* [ ] Production database
* [ ] Deployment
* [ ] Monitoring
* [ ] Error tracking

---

# 📝 Current Status

Проект находится на ранней стадии разработки.

На данный момент полностью настроен базовый development environment:

```text
React
   ↓
Node.js / Express
   ↓
MOEX ISS API
   ↓
SQLite / Drizzle
```

Уже можно:

1. запустить backend;
2. обратиться к API;
3. запросить инструмент по тикеру;
4. получить данные из MOEX;
5. преобразовать их в собственный формат.

Следующая основная задача:

```text
MOEX instrument
       ↓
Save to SQLite
       ↓
Instrument API
       ↓
Frontend
       ↓
Add security to portfolio
```

---

# 📌 Development Notes

Проект разрабатывается итеративно.

Каждый этап должен оставаться рабочим перед переходом к следующему.

При добавлении новой функциональности предпочтительный порядок:

```text
1. Data model
2. Backend service
3. API endpoint
4. Test endpoint
5. Frontend integration
6. UI
7. Analytics
```

Это позволяет постепенно строить приложение, не создавая большую связанную систему, которую сложно отлаживать.

---

# 📄 License

License пока не определена.

Проект находится в разработке.
