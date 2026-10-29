from sentence_transformers import SentenceTransformer
from langchain_openai import OpenAIEmbeddings
from dotenv import load_dotenv

load_dotenv()

embedding_model = OpenAIEmbeddings(
    model="text-embedding-3-small",
)

# embedding_model = SentenceTransformer("all-MiniLM-L6-v2")