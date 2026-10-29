# AI Agent Evaluation & Performance Improvement

## 1. Overview

This report evaluates an agentic e-commerce assistant built with LangGraph. The objective is to measure reliability, identify weaknesses in tool calling and response generation, and validate improvements through repeatable experiments.

- **Evaluation framework:** LangSmith
- **Agent model:** GPT-5.4 Nano
- **Validation dataset:** `val_dataset`
- **Test cases:** 44 scenarios containing 48 conversation turns
- **Experiment date:** October 29, 2026

## 2. Evaluation Methodology

The synthetic dataset was derived from the project's prompts, tool schemas, and sample database. Each example contains user turns, expected tool calls and arguments, and short response criteria. Four examples contain two turns to test conversation context; the other 40 contain one turn.

| Scenario group | Cases |
| --- | ---: |
| Conversation and capabilities | 2 |
| Product searches and filters | 11 |
| Order tracking and missing identifiers | 6 |
| Store policies | 10 |
| Unsupported actions | 4 |
| Multiple requests | 5 |
| Conversation memory | 4 |
| Prompt injection and invented retrieval | 2 |
| **Total** | **44** |

Each scenario runs against the agent and its tools with isolated conversation history. Evaluation covers tool selection, arguments, and final responses.

| Metric | Method | Passing condition |
| --- | --- | --- |
| Response Quality | LLM judge | Every turn meets its response criteria using available evidence. |
| Tool Arguments | Deterministic comparison | Tool calls match the requested arguments. Incorrect tool usage also fails this metric. |
| Tool Usage | Deterministic comparison | Expected tool names and counts match, without failed executions. |

Scores are binary: **1 = pass, 0 = fail**. An average is the fraction of scenarios passing the metric. A multi-turn scenario passes only when all its turns satisfy the check. Overall success requires all three metrics to pass. The metrics are not independent: tool-usage failures also fail tool-argument scoring.

Tool calls are matched without requiring an execution order. Each requested product search must have its own matching call.

## 3. Baseline Evaluation

**Baseline experiment:** `Aisle_evaluation-90ea702a`  
**Dataset:** `val_dataset`

This experiment establishes the baseline for future performance comparisons.

- **Start:** October 29, 2026, 23:36 Europe/Istanbul
- **Completed runs:** 44/44
- **Execution errors:** 0
- **Feedback coverage:** 44 scores for each of the three metrics

| Metric | Passed | Average score |
| --- | ---: | ---: |
| Response Quality | 42/44 | 0.9545 |
| Tool Arguments | 35/44 | 0.7955 |
| Tool Usage | 40/44 | 0.9091 |
| All three checks | 35/44 | 0.7955 |

Nine scenarios failed at least one metric.

## 4. Failure Analysis

The following cases illustrate the main failures in tool calling, argument extraction, and response grading.

### Case 1: Multi-Intent Request

**Input:**

> Find blue jackets under $150 and check my order.

**Observed execution:**

1. `search_products` received category `jackets`, color `blue`, and `max_price: 150`, plus default limit and sorting values.
2. `order_status` received `order_id: null` and returned no order information.
3. The final response listed jackets and asked for the numeric order ID.

| Metric | Baseline score |
| --- | ---: |
| Response Quality | 1 |
| Tool Arguments | 0 |
| Tool Usage | 0 |

**Failure:** the agent attempted an order lookup without an order ID. The expected behavior was to search for jackets and ask for the ID. The extra lookup failed Tool Usage, which also failed Tool Arguments. Response Quality passed because the final answer showed jackets and requested the missing ID.

### Case 2: Brand Omission in a Multi-Tool Request

**Input:**

> Find purple Motion shoes under $0.01, then track order 1.

Both requested tools were called. However, the product call omitted `brand: Motion`. Scores were response quality **1**, tool arguments **0**, and tool usage **1**.

**Failure:** the search did not include the requested brand. The default values `limit: 5` and `sort_by: relevance` were valid. The no-results answer passed Response Quality despite the incomplete search filters.

### Case 3: Brand Extraction Across Turns

**Conversation:**

> Find black shoes under $100.  
> Only Motion, in size 42.5, please.

The second search preserved the other filters but extracted the brand as `Only Motion`, rather than `Motion`. Tool arguments scored **0**, while tool usage and response quality scored **1**.

**Failure:** the agent included the word “Only” in the brand value. The response judge accepted the resulting no-match answer despite the incorrect argument.

### Case 4: Provided Order ID Treated as Missing

For `Track order 1.`, the agent asked for the numeric order ID instead of looking it up. The standalone case failed all metrics. The first turn of `memory-order-correction` showed the same behavior, but its response judge incorrectly accepted it as asking for a missing ID.

**Failure:** the agent did not use an order ID already present in the request. In comparison, `memory-order-id` successfully looked up order 1 when the ID was supplied in a follow-up.

### Case 5: Evaluator Strictness and False Passes

`mixed-unsupported` made an additional read-only order lookup before declining cancellation and answering the return-policy question. Its tool metrics failed because the reference required only `faq_search`; response quality passed. The failure reflects an extra lookup under the tool-count check; the agent did not perform a cancellation.

In `mixed-all-tools`, the judge accepted a response listing other brands despite the explicit request for Motion products. This is a response-quality false pass supported by the returned product brands. The deterministic argument check correctly failed the omitted brand.

### All Scenarios With a Failed Metric

Scores are **Response Quality / Tool Arguments / Tool Usage**.

| Case | Scores | Observed failure |
| --- | --- | --- |
| `product-combined-filters` | 0 / 0 / 1 | Motion brand omitted; another brand recommended. |
| `product-no-matches` | 1 / 0 / 1 | Motion brand omitted from the product call. |
| `order-shipped` | 0 / 0 / 0 | No lookup despite supplied order ID 1. |
| `mixed-all-tools` | 1 / 0 / 1 | All three tools used; Motion brand omitted. |
| `mixed-missing-id` | 1 / 0 / 0 | Extra order lookup with a null ID. |
| `mixed-no-results` | 1 / 0 / 1 | Both tools used; Motion brand omitted. |
| `mixed-unsupported` | 1 / 0 / 0 | Extra read-only order lookup. |
| `memory-product-refinement` | 1 / 0 / 1 | Brand extracted as Only Motion. |
| `memory-order-correction` | 1 / 0 / 0 | No lookup in first turn; corrected ID used in second. |
