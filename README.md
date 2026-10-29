# Aisle — AI Shopping Assistant

A conversational shopping assistant that helps customers find and compare products, track orders, and understand store policies.

## Aisle UI
![Demo](media/demo.png)

## Demo
View the latest demo video [here](media/video_demo.mp4)

Check the website [AskAisle.site](https://askaisle.site/)

## How it works

### Agent orchestration and tool calling

FastAPI passes authenticated messages into a LangGraph workflow with one outer agent node. Inside it, LangChain's `create_agent` runs GPT-5.4 Nano in a model–tool loop using `search_products`, `order_status`, and `faq_search`. The model can combine these tools within one request, avoiding a separate intent classifier or fixed route for every task combination.

Pydantic schemas constrain arguments such as price ranges, categories, and decimal shoe sizes; tools execute predefined, parameterized queries. These boundaries constrain database access but cannot ensure the model preserves every requested filter. The prompt directs it to ground answers in results and ask for missing information. The tools retrieve information and cannot place orders, process payments, or modify orders.

### Hybrid retrieval and semantic ranking

Product search separates exact constraints from descriptive relevance. SQL joins products with variants and applies supplied category, brand, color, size, price, and rating filters. Semantic ranking then distinguishes descriptive matches, such as shoes for long walks, within that candidate set. Similarity cannot override a supplied filter, but a filter omitted by the model never reaches SQL.

At startup, product names, descriptions, brands, and categories are embedded with OpenAI's `text-embedding-3-small` and cached by variant ID. NumPy ranks candidates by dot-product similarity to the latest user message, returning five matches by default. In-memory vectors avoid a separate vector database, but consume worker memory, add startup API calls, and require rebuilding when the catalog changes.

The SQL stage returns at most 20 candidates, so semantic ranking cannot recover a relevant product outside that subset. Price sorting is applied before this cap, then semantic ranking determines the returned order; the tool therefore does not guarantee final price order.

FAQ retrieval ranks embedded question–answer pairs and fetches the top five records from MySQL, supporting paraphrased policy questions. Without a similarity cutoff, unrelated FAQs can still reach the model, which must judge relevance. Order tracking uses an exact order-ID lookup because a specific order should not be selected by semantic similarity.

### Memory and context management

LangGraph checkpoints conversation state in PostgreSQL, using a key derived from both user and conversation IDs to separate histories. Before each invocation, recent dialogue is trimmed to approximately 4,000 tokens, bounding model history without limiting checkpoint storage or subsequent tool-result tokens.

The outer graph retains user messages and final replies; intermediate tool messages stay inside the current invocation. This reduces subsequent context, but older details can fall outside the window and original tool evidence is unavailable in later dialogue. There is no conversation summarization.

### Authentication and rate limiting

FastAPI validates Auth0 RS256 tokens, including issuer, audience, expiry, and user identity. An atomic Redis Lua script enforces shared per-user limits of 10 requests per 60 seconds and 100 per 24 hours before model execution. Chat returns a service-unavailable response if Redis fails.

### Database implementation

MySQL stores products separately from variants, allowing sizes, colors, and prices to vary without duplicating the core product record. SQLAlchemy executes parameterized queries for catalog, FAQ, and order retrieval. PostgreSQL stores LangGraph checkpoints separately from commerce data, at the cost of operating two database services.

### Evaluation methodology and results

LangSmith evaluates 44 synthetic scenarios containing 48 turns, covering product filters, tracking, policies, multiple requests, memory, unsupported actions, and prompt injection. Scenarios run against the agent and tools with isolated histories. Callbacks capture intermediate tool executions for scoring alongside final replies.

Deterministic evaluators check tool names, counts, and requested arguments independently of execution order; the current matcher normalizes omitted defaults. A structured LLM judge assesses replies against reference criteria and retrieved evidence, combining precise tool checks with flexible grading of natural language.

The documented baseline, `Aisle_evaluation-90ea702a`, completed all 44 scenarios:

| Check | Passed | Pass rate |
| --- | ---: | ---: |
| Response quality | 42/44 | 95.45% |
| Tool arguments | 35/44 | 79.55% |
| Tool usage | 40/44 | 90.91% |
| All three checks | 35/44 | 79.55% |

Failures included omitted brands, incorrect follow-up filters, and order lookups without an ID. Tool-usage failures also fail argument scoring, so those metrics are coupled. The response judge accepted some incorrect answers; its score is not a verified accuracy rate. Results describe the recorded synthetic baseline, before later default-handling changes; no improvement has been measured.

**For the full methodology, experiments, results, and failure analysis, see [evaluation/](evaluation/).** It contains the runner, dataset, and detailed report supporting this overview.

## Run locally

### 1. Get the project

Install **Git**, **Python 3.11**, **Node.js 22.12+**, and **MySQL**, then run:

```bash
git clone https://github.com/abdullahsaifomairi/e_commerce_assistant.git
cd e_commerce_assistant
```

You also need an **OpenAI API key**, an **Auth0 account**, a **PostgreSQL database**, and **Redis with TLS**.

### 2. Set up MySQL

Start MySQL, then create a database and import the tables and sample data:

```bash
mysql -u root -p -e "CREATE DATABASE aisle;"
mysql -u root -p aisle < database/setup.sql
```

Enter your MySQL password when prompted. Replace `root` if you use a different MySQL username.

> These commands require `database/setup.sql` to be included in the repository. Import into a new database because the file may replace existing tables.

### 3. Configure the backend

Copy the environment template:

```bash
cp .env.example .env
```

Fill in `.env` with your credentials:

```dotenv
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
ECOMMERCE_DATABASE_URL=mysql+pymysql://USER:PASSWORD@localhost:3306/aisle
MEMORY_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
REDIS_URL=rediss://default:PASSWORD@HOST:PORT
AUTH0_DOMAIN=YOUR_TENANT.auth0.com
AUTH0_AUDIENCE=https://api.aisle.app
```

`USER` and `PASSWORD` are your database credentials. `HOST` is the database server address; use `localhost` when it runs on your computer. PostgreSQL checkpoint tables are created automatically.

### 4. Configure login

In Auth0, create a **Single Page Application** and an **API** with identifier `https://api.aisle.app` and signing algorithm **RS256**. Allow the application to access that API.

Set the application URLs:

| Setting | Value |
|---|---|
| Allowed Callback URLs | `http://127.0.0.1:8770/` |
| Allowed Logout URLs | `http://127.0.0.1:8770/` |
| Allowed Web Origins | `http://127.0.0.1:8770` |

Create `frontend/.env.local`:

```dotenv
VITE_AUTH0_DOMAIN=YOUR_TENANT.auth0.com
VITE_AUTH0_CLIENT_ID=YOUR_APPLICATION_CLIENT_ID
VITE_AUTH0_AUDIENCE=https://api.aisle.app
VITE_API_URL=/api/chat
```

Use the same Auth0 domain and audience in both environment files.

### 5. Start the backend

From the project’s main folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

On Windows, use `python` instead of `python3` and activate with `.venv\Scripts\Activate.ps1`.

Backend startup reads the catalog and FAQs and generates embeddings through OpenAI, so it requires database and API access and may take longer.

### 6. Start the frontend

Open a second terminal in the project’s main folder:

```bash
cd frontend
npm ci
npm run dev
```



Keep both terminals open while using the app. Press **Ctrl+C** in each to stop it.



