from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()
agent_model = ChatOpenAI(
    model = "gpt-5.4-nano",
    temperature = 0,
    reasoning_effort = "none",
        model_kwargs={
        "prompt_cache_key": "ecommerce-assistant-v1"
    }
)