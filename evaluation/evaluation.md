# Aisle E-commerce Assistant: Baseline Evaluation

## 1. Executive Summary

This evaluation assesses the assistant's ability to answer customer questions, retrieve products, track orders, explain store policies, and maintain context across conversation turns.

The assistant completed **44 scenarios covering 48 conversation turns**. **36 scenarios (81.82%) passed all three evaluation criteria**, while eight received at least one failing score. Tool Usage achieved the highest pass rate at **95.45%**. The main application issues involved preserving product filters and completing multiple requests within one message.

| Evaluation detail | Value |
| --- | --- |
| Evaluation date | November 5, 2026 (Istanbul, UTC+3) |
| Agent model | GPT-5.4 Nano |
| Evaluation framework | LangSmith |
| Scenarios | 44 |
| Conversation turns | 48 |
| Executions per scenario | 1 |

## 2. Evaluation Methodology

### Scope and Coverage

The synthetic test dataset was constructed from the assistant's supported workflows, tool definitions, and sample database. Each scenario specifies the customer's request, expected tool calls and arguments, and criteria for an acceptable response.

Forty scenarios contain one turn each. Four contain two turns to assess conversation context, including product refinements and order identifiers. Each scenario uses isolated conversation history and executes against the assistant and its tools.

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

### Evaluation Criteria

| Metric | Assessment method | Passing condition |
| --- | --- | --- |
| Response Quality | Automated language-model assessment | Every turn addresses the request and satisfies the response criteria using available evidence. |
| Tool Arguments | Deterministic comparison | Tool calls contain the requested arguments and valid defaults, with no missing, extra, or failed calls. |
| Tool Usage | Deterministic comparison | Tool names and call counts match the expected actions, without failed executions. |

Each metric uses a binary score: **1 = pass; 0 = fail**. A scenario passes a metric only when every turn satisfies that metric. Overall success requires all three metrics to pass.

Tool calls are matched without requiring an execution order. Each requested product search must have its own matching call. Product-search arguments are checked for additional non-null filters that were not requested. Default result limits and sorting values are accepted. Brand and color comparisons ignore capitalization and surrounding whitespace.

The metrics assess related aspects of behavior: a Tool Usage failure also fails Tool Arguments. Response Quality is assessed separately, so a satisfactory final answer can pass even when an unnecessary tool call fails.

## 3. Baseline Results

All 44 scenarios completed and received all three evaluation scores, providing **132 metric assessments**. No scores are missing, and no evaluation errors were reported.

| Metric | Passed | Failed | Pass rate |
| --- | ---: | ---: | ---: |
| Response Quality | 40/44 | 4 | 90.91% |
| Tool Arguments | 37/44 | 7 | 84.09% |
| Tool Usage | 42/44 | 2 | 95.45% |
| **All three criteria** | **36/44** | **8** | **81.82%** |

The results show stronger performance in selecting the required tools than in supplying all requested arguments. Seven of the eight scenarios with a failing score failed Tool Arguments. The remaining scenario involved a response-grading inconsistency, detailed in Section 5.

These figures are the recorded evaluation results. The qualitative findings explain the observed behavior and scoring limitations alongside those results.

## 4. Execution Performance

| Runtime metric | Recorded value |
| --- | ---: |
| Completed scenarios | 44/44 |
| Run-level execution errors | 0 |
| Scenario latency, P50 | 2.39 s |
| Scenario latency, P99 | 9.12 s |
| Input tokens | 482,152 |
| Output tokens | 5,082 |
| Total tokens | 487,234 |
| Reported trace cost | $0.03117 |

Latency is measured per scenario execution; four scenarios include two conversation turns. The percentiles describe this evaluation sample. Token usage and cost are reported trace totals; a separate total for automated grading costs was not established.

No scenario ended with an unhandled execution error. One scenario contained a handled tool-validation error caused by an invalid order identifier, as described below.

## 5. Detailed Findings

### Product Filter Accuracy

**Representative request:**

> Find black Motion shoes in size 42 under $100.

The product search omitted the requested Motion brand and added a minimum-price filter of zero. The final answer recommended Lunar Court Sneakers from Urban Step, which did not satisfy the brand requirement. Response Quality and Tool Arguments failed; Tool Usage passed.

The brand filter was omitted in four scenarios: `product-combined-filters`, `product-no-matches`, `mixed-all-tools`, and `mixed-no-results`. Two produced recommendations from other brands and failed Response Quality. Two returned no products and passed Response Quality despite the incomplete arguments.

**Assessment:** selecting the product-search tool does not ensure that all customer constraints are applied. Brand omission can produce unsuitable recommendations. The additional minimum-price filter in two scenarios also fails the strict argument check because it was absent from the expected arguments.

### Missing Order Identifier

**Request:**

> Find blue jackets under $150 and check my order.

The assistant searched for blue jackets under $150, then called the order-status tool with an invented identifier of zero. The order lookup failed validation because identifiers must be greater than zero. The final response listed jackets and asked the customer for an order ID.

**Assessment:** the final answer met the response criteria, but the unnecessary lookup failed Tool Usage and Tool Arguments. The expected behavior was to complete the product search and request the missing identifier before attempting an order lookup.

By comparison, `order-shipped`, `memory-order-id`, and `memory-order-correction` passed all three criteria. The observed failure concerns an absent identifier rather than an explicitly supplied or corrected one.

### Product Refinement Across Turns

**Conversation:**

> Find black shoes under $100.
>
> Only Motion, in size 42.5, please.

The second search preserved the category, color, and price constraints but interpreted the brand as `Only Motion` rather than `Motion`. Tool Arguments failed; Tool Usage and Response Quality passed.

**Assessment:** the assistant retained conversation context but included an instruction word in the brand value. The resulting no-match answer was accepted by the response assessment, which did not identify this extraction error.

### Multiple Requests With an Unsupported Action

**Request:**

> Cancel order 1, and then tell me your return policy.

The assistant correctly declined cancellation but did not retrieve or answer the return-policy question. It asked for an item type and requested an order ID that was already present. No tools were called, and all three criteria failed.

**Assessment:** the supported policy request remained incomplete alongside the unsupported cancellation request. The expected behavior was to explain the cancellation limitation and retrieve the general return policy.

### Response Assessment and Product Ordering

For `product-expensive-first`, the customer requested four watches ordered from highest to lowest price. The search requested descending-price sorting, but its results arrived in the order **$174.49, $169.99, $158.49, $161.49**. The final answer presented the correct descending order: **$174.49, $169.99, $161.49, $158.49**.

Response Quality nevertheless failed, with a grading comment describing the tool-result order rather than the final-answer order. Both tool metrics passed.

**Assessment:** this scenario contains a response-grading inconsistency and a separate ordering issue in the retrieved results. The final answer satisfies the requested ordering, while the recorded Response Quality score is zero.

In `product-no-matches`, the passing response-assessment comment also stated that the Motion brand filter was applied, although the captured call omitted it. These findings show why response assessment and deterministic argument checks are both necessary when interpreting the results.

### Scenarios With a Failing Score

Scores are listed as **Response Quality / Tool Arguments / Tool Usage**. Case labels identify scenarios within this report.

| Case | Scores | Observed issue |
| --- | --- | --- |
| `product-combined-filters` | 0 / 0 / 1 | Motion brand omitted; additional minimum-price filter; another brand recommended. |
| `product-no-matches` | 1 / 0 / 1 | Motion brand omitted; additional minimum-price filter; response-assessment comment incorrectly stated that the brand was applied. |
| `product-expensive-first` | 0 / 1 / 1 | Final answer correctly sorted; response grading inconsistent with that answer; retrieved results unsorted. |
| `mixed-all-tools` | 0 / 0 / 1 | All requested tools used; Motion brand omitted and other brands presented as matches. |
| `mixed-missing-id` | 1 / 0 / 0 | Invented order identifier of zero caused a handled validation error. |
| `mixed-no-results` | 1 / 0 / 1 | Product and order requests addressed; Motion brand omitted from the product search. |
| `mixed-unsupported` | 0 / 0 / 0 | Cancellation declined; supported return-policy question left unanswered. |
| `memory-product-refinement` | 1 / 0 / 1 | Brand interpreted as Only Motion rather than Motion. |

## 6. Evaluation Scope and Interpretation

The evaluation establishes an observed baseline for the tested workflows: **81.82% overall success**, with **95.45% Tool Usage**, **84.09% Tool Arguments**, and **90.91% Response Quality**. The findings identify product-filter accuracy, missing-identifier handling, and completion of multiple requests as the main application limitations in this sample.

The dataset is synthetic and uses sample data. Each scenario was executed once, so the results do not measure consistency across repeated executions or performance under production traffic. Automated response assessment can also misclassify individual answers, as demonstrated by the ordering scenario. The reported scores should be interpreted together with the detailed findings.
