from pydantic import BaseModel, Field


from database.tables import engine
from sqlalchemy import text

from langchain.tools import tool

class OrdersIdExtractor(BaseModel):
    order_id:int|None = Field(
        default=None,
        description=(
            "The unique order ID explicitly mentioned by the user. "
            "Extract only the numeric identifier that refers to an order. "
            "Do not guess or infer an order ID. "
            "Return None if the user does not provide an order ID."
        )
    )

def order_search(order_id:int|None):
    query = """
    SELECT  status, total_price, created_at, shipped_at, delivered_at, tracking_number, carrier
    FROM orders
    WHERE order_id = :order_id
    LIMIT 1
    """

    if order_id is None :
        return []

    with engine.connect() as conn:
        result = conn.execute(
            text(query),
            {
                "order_id":order_id
            }
        )
        orders_list = result.mappings().all()
    return [dict(order) for  order in orders_list]

@tool(args_schema=OrdersIdExtractor)

def order_status(order_id:int|None = None ):
    """
    Retrieve an order's current status and available tracking details.

    Use when a customer asks to check or track an existing order.
    Request any missing required information before calling this tool.
    Report only the returned details; never invent delivery dates or
    tracking information. This tool does not modify or cancel orders.
    """
    orders = order_search(order_id)
    return orders
