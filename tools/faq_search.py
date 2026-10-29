from dotenv import load_dotenv
from pydantic import BaseModel, Field

from models.agent_model import agent_model
from models.embedding import embedding_model
from database.tables import engine
from sqlalchemy import text,bindparam

import numpy as np
from langchain.tools import tool,ToolRuntime
from langchain.messages import  HumanMessage


model = agent_model
embedding_model = embedding_model

class QuestionsFilter(BaseModel):
    question:str|None = Field(
        default=None,
        description=(
        "The FAQ question from the retrieved knowledge that is most relevant "
        "to the user's request. Return the question only if the retrieved FAQ "
        "contains a clear semantic match to the user's query. Return None if "
        "no sufficiently relevant FAQ question is available."
        ),
    )

def creating_faq_db():
    
    with engine.connect() as conn:
        result = conn.execute(text(
            """
            SELECT * FROM faq;
            """
        ))
        faqs_list = result.mappings().all() 
    return [dict(faq) for  faq in faqs_list]

def create_embedding_text(database):
    embedding_text = []
    for q in database:
        database_text = f"""
        Question:{q["question"]}
        Answer:{q["answer"]}
        """.strip()
        embedding_text.append(database_text)
    return embedding_text


def text_embedding(embedding_text,embedding_model):
    embedded_text = embedding_model.embed_documents(
        embedding_text
        )
    return embedded_text

def create_embedding_faq(faqs, embedded_text):
    embedded_faqs = []
    for faq,embedding_text in zip(faqs,embedded_text):
        embedded_faqs.append({
            "question_id":faq.get("question_id"),
            "embedded_text":embedding_text
        })
    return embedded_faqs

def semantic_search_faq(query, embedded_faqs,embedding_model, top_k=5):
    if not embedded_faqs or top_k <= 0:
        return []

    faqs_embedding = np.array([
        faq["embedded_text"] for faq in embedded_faqs
    ])

    embedded_query = embedding_model.embed_query(
        query
        )

    similarities = faqs_embedding @ embedded_query
    top_indices = np.argsort(similarities)[::-1][:top_k]

    matches = [
        {
            "question_id": embedded_faqs[index]["question_id"],
            "similarity": float(similarities[index]),
        }
        for index in top_indices
    ]

    statement = text("""
        SELECT question_id, question, answer
        FROM faq
        WHERE question_id IN :question_ids
    """).bindparams(bindparam("question_ids", expanding=True))

    with engine.connect() as conn:
        rows = conn.execute(
            statement,
            {"question_ids": [match["question_id"] for match in matches]},
        ).mappings().all()

    rows_by_id = {row["question_id"]: dict(row) for row in rows}


    return [
        {
            **rows_by_id[match["question_id"]],
            "similarity": match["similarity"],
        }
        for match in matches
        if match["question_id"] in rows_by_id
    ]

def semantic_ready_faq(faq,embedding_model):
    embedding_text = create_embedding_text(faq)
    embedded_text = text_embedding(embedding_text,embedding_model)
    embedded_faq = create_embedding_faq(faq, embedded_text)

    return embedded_faq
faq_db = creating_faq_db()
embedded_faq_db = semantic_ready_faq(faq=faq_db,embedding_model=embedding_model)

@tool (args_schema=QuestionsFilter)
def faq_search(question:str|None = None,runtime: ToolRuntime = None,):
    """
    Retrieve the current status and available tracking details of an order.

    Use when the customer asks about an existing order's status,
    shipment, or delivery progress. Ask for any missing required
    order identifiers before calling this tool.

    This tool only retrieves information; it does not modify,
    cancel, or refund orders.
    """

    message = next(
    msg.content
    for msg in reversed(runtime.state["messages"])
    if isinstance(msg, HumanMessage)
    )

    semantic_searched_questions = semantic_search_faq(query=message,embedded_faqs=embedded_faq_db,embedding_model=embedding_model,)

    return semantic_searched_questions

def main():
    # db = creating_faq_db()
    # embedded_faq_db  = semantic_ready_faq(faq = db, embedding_model=embedding_model)
    semantic_searched_questions = semantic_search_faq(query="I want to ask about my missing order",embedded_faqs=embedded_faq_db,embedding_model=embedding_model,)
    print(semantic_searched_questions)

if __name__ =="__main__":
    main()