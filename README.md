# Aisle — AI Shopping Assistant

A conversational shopping assistant that helps customers find and compare products, track orders, and understand store policies.

## Aisle UI
![Demo](media/demo.png)

## Demo
View the latest demo video [here](media/video_demo.mp4)

Check the website [AskAisle.site](https://askaisle.site/)

## How it works

1. **Understand the request.** FastAPI passes the message and recent conversation history to GPT-5.4 Nano through LangGraph.
2. **Retrieve the facts.** The agent selects product search, order tracking, or FAQ tools—and can combine them for multiple requests.
3. **Answer with context.** The model uses the retrieved results to reply, and LangGraph saves the updated conversation in PostgreSQL.

### Architecture decisions

<details>
<summary><h3>Agent orchestration: one agent, three retrieval tools</h3></summary>

<br>

LangGraph has one outer agent node. Inside it, LangChain's `create_agent` runs the model–tool loop: select tools, receive results, and generate the final response. This supports combinations of shopping, tracking, and policy requests without a separate intent classifier or a fixed route for every combination.

**Boundaries:** Pydantic schemas constrain categories, price ranges, and sizes; tools execute predefined, parameterized queries. They retrieve information and cannot purchase, pay, or modify orders.

**Trade-off:** Valid arguments can still omit a requested filter. Grounding answers and asking for missing information depend on model behavior, so both tool calls and final replies are evaluated.

</details>

<details>
<summary><h3>Hybrid retrieval: SQL filters first, semantic ranking second</h3></summary>

<br>

Product discovery combines exact constraints with descriptive matching:

1. **Filter in MySQL.** Join products and variants, applying supplied brand, category, color, size, price, and rating constraints.
2. **Rank by meaning.** Embed the latest user message and compare it with candidate descriptions using NumPy dot products.
3. **Return the strongest matches.** Select five results by default for the agent to use in its answer.

This keeps a preference such as “comfortable for long walks” useful without allowing similarity to override an applied size or price filter. A filter omitted by the model, however, never reaches SQL.

**Embedding strategy:** OpenAI's `text-embedding-3-small` embeds product names, descriptions, brands, and categories at startup. Vectors are cached in memory by variant ID, avoiding a separate vector database. The cost is worker memory, startup API calls, and rebuilding the lookup when the catalog changes.

**Retrieval limits:** SQL returns at most 20 candidates before semantic ranking. Relevant products outside that set cannot be recovered. Price sorting happens before the cap; semantic ranking can change the final price order.

**FAQ and orders:** FAQ search ranks embedded question–answer pairs and fetches the top five records from MySQL. There is no similarity cutoff, so the model must judge relevance. Order tracking uses an exact order-ID lookup rather than semantic matching.

</details>

<details>
<summary><h3>Conversation memory: persistent history, bounded model context</h3></summary>

<br>

PostgreSQL checkpoints retain conversation state under a key derived from both user and conversation IDs, keeping users' histories separate. Before an agent invocation, recent dialogue is trimmed to approximately 4,000 tokens to bound the history sent to the model.

**Trade-off:** The outer graph retains user messages and final replies, while intermediate tool messages stay inside the current invocation. Later turns can lose older details and cannot reread the original tool evidence from dialogue history. There is no summarization, and trimming does not bound checkpoint storage or subsequent tool-result tokens.

</details>

<details>
<summary><h3>Authentication and storage: shared limits, separate responsibilities</h3></summary>

<br>

**Access and usage:** FastAPI validates Auth0 RS256 tokens, including issuer, audience, expiry, and identity. An atomic Redis Lua script enforces shared per-user limits of 10 requests per 60 seconds and 100 per 24 hours before model execution. If Redis fails, chat returns a service-unavailable response.

**Commerce and memory:** MySQL separates product records from variants so sizes, colors, and prices can vary without duplicating the core product. SQLAlchemy provides parameterized queries. PostgreSQL stores conversation checkpoints separately, at the cost of operating two database services.

</details>

### Evaluation

LangSmith runs **44 synthetic scenarios across 48 turns**, covering product filters, tracking, policies, multiple requests, memory, unsupported actions, and prompt injection. Each scenario has isolated history; callbacks capture intermediate tool calls alongside final replies.

- **Tool checks:** Deterministic evaluators compare names, counts, and requested arguments, independently of execution order. The current matcher normalizes omitted defaults.
- **Response checks:** A structured LLM judge compares answers with reference criteria and retrieved evidence, allowing equivalent wording.

The documented baseline, `Aisle_evaluation-90ea702a`, completed all 44 scenarios:

| Check | Passed | Pass rate |
| --- | ---: | ---: |
| Response quality | 42/44 | 95.45% |
| Tool arguments | 35/44 | 79.55% |
| Tool usage | 40/44 | 90.91% |
| **All three checks** | **35/44** | **79.55%** |

Failures exposed omitted brands, incorrect follow-up filters, and lookups without an order ID. Tool-usage failures also fail argument scoring. The judge accepted some incorrect answers, so its score is not a verified accuracy rate. These baseline scores precede later default-handling changes; no improvement has been measured.

**[Explore evaluation/](evaluation/)** for the full methodology, experiments, results, and failure analysis. The folder contains the runner, dataset, and detailed report behind this overview.

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



