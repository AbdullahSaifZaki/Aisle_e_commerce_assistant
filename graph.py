from typing import Annotated
from typing_extensions import TypedDict

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain.messages import AnyMessage

from models.agent_model import agent_model
from langchain.agents import create_agent
import time 

from prompts import main_agent_prompt
from langchain_core.messages import trim_messages

from tools.product_search import search_products
from tools.order_status import order_status
from tools.faq_search import faq_search




class AgentState(TypedDict , total = False):
    messages : Annotated[list[AnyMessage], add_messages]
    user_message: str
    response:str

graph = StateGraph(AgentState)

model = agent_model

agent = create_agent(
    model = model,
    tools = [search_products,order_status,faq_search],
    system_prompt = main_agent_prompt ,
)

def agent_response(state:AgentState) -> AgentState:
    start = time.perf_counter()
    trimmed_messages = trim_messages(
    state["messages"],
    max_tokens=4000,
    strategy="last",
    token_counter="approximate",
    start_on="human",
    include_system=True,
    allow_partial=False
    )

    result = agent.invoke(
        {
            "messages":trimmed_messages
        }
    )
    print(
        "classify_intent_llm:",
        round(time.perf_counter() - start, 3),
        "seconds"
    )
    response = result["messages"][-1]
    return {
        "messages":[response],
        "response":response.content
    }

graph.add_node("agent_response", agent_response)

graph.add_edge(START,"agent_response")
graph.add_edge("agent_response",END)


