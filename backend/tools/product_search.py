from typing import Literal

from pydantic import BaseModel, Field, model_validator

from langchain.messages import   HumanMessage

from database.tables import engine
from sqlalchemy import text
from langchain.tools import tool,ToolRuntime
from models.embedding import embedding_model
import numpy as np


embedding_model = embedding_model

class ProductFilter(BaseModel):

    color: str|None = Field(
        default=None,
        description=(
            "The color of the requested order. "
        ),
    )

    size: Literal["XS","S","M","L","XL"]|int|float|None = Field(
        default=None,
        description=(
            "The requested product size. "
            "Use XS, S, M, L, or XL for clothing sizes. "
            "Preserve numeric sizes exactly: 42 stays 42, "
            "and 42.5 stays 42.5. "
            "Never remove the decimal point or round the size. "
            "Return None when no size is specified."
        ),
    )

    category:Literal['shoes','jackets','t-shirts','jeans','bags','hoodies', 'dresses','watches','accessories']|None = Field(
        default=None,
        description=(
            "Product category, such as shoes or jackets. "
        ),
    )

    brand:str|None = Field(
        default=None,
        description=(
            "The brand of the requested order. "
        ),
    )

    min_price:float|None = Field(
        default=None,
        ge = 0,
        description="Minimun acceptable price. ",
    )

    max_price:float|None = Field(
        default=None,
        ge = 0,
        description="Maximum acceptable price. ",
    )

    sort_by:Literal[
        "relevance",
        "price_high_to_low",
        "price_low_to_high",

    ]=Field(
        default="relevance",
        description=(
            "How product results should be ordered. "
            "Use price_low_to_high for cheapest-first requests, "
            "price_high_to_low for most-expensive-first requests, "
            "and relevance when no explicit sorting preference is given."
        )
    )

    limit:int|None = Field(
        default=5,
        ge=1,
        description="the limit for the number of products that will be selected from the database"
    )

    max_rating:float|None = Field(
        default=None,
        ge = 1.0,
        le= 10.0,
        description="The product's maximum acceptable customer rating on a scale from 1.0 to 10.0, where higher values indicate better overall customer satisfaction. "
    )

    min_rating:float|None = Field(
    default=None,
    ge = 1.0,
    le= 10.0,
    description="The product's minimum acceptable customer rating on a scale from 1.0 to 10.0, where higher values indicate better overall customer satisfaction. "
    )

    # semantic_description : str|None = Field(
    #     description= "Short description for the user's request that includes the requested product's main features to be used for semantic searching."
    # )

    @model_validator(mode="after")
    def validate_prices(self):
        if(
            self.min_price is not None and self.max_price is not None and self.min_price > self.max_price
        ):
            raise ValueError("min_price cannot be greater than the max_price")

        return self

    @model_validator(mode="after")
    def validate_rating(self):
        if(
            self.min_rating is not None and self.max_rating is not None and self.min_rating> self.max_rating
        ):
            raise ValueError("min_rating cannot be greater than the max_rating")

        return self

def normalize_filters(filters):
    if filters["color"]:
        filters["color"] = filters["color"].strip().lower()

    if filters["brand"]:
        filters["brand"] = filters["brand"].strip().capitalize()

    return filters

def product_search(
    category:str|None=None,
    color:str|None=None,
    size:str|None=None,
    brand:str|None=None,
    min_price:float|None=None,
    max_price:float|None=None,
    sort_by:str|None =None,
    max_rating:float|None= None,
    min_rating:float|None= None,
):
    """
    Search products in the database using optional filters such as
    category, color, size, brand, minimum price, and maximum price.
    """
    query = """
        SELECT products.product_id, products_variants.variant_product_id,products.name,products.brand,products.category, products.name,products.description, products_variants.color, products_variants.size, products_variants.price
        FROM products
        JOIN products_variants
        ON products.product_id = products_variants.product_id
        WHERE 1=1
        """
     
    params = {}
    if category is not None:
        if category in ['shoes','jackets','t-shirts','jeans','bags','hoodies', 'dresses','watches','accessories']:
            query += " AND products.category = :category"
            params["category"] = category
        else:
            return ["unsupported category type"]

    if color is not None:
        query += " AND products_variants.color = :color"
        params["color"] = color

    if size is not None:
        query += " AND products_variants.size = :size"
        params["size"] = size

    if brand is not None:
        query += " AND products.brand = :brand"
        params["brand"] = brand

    if min_price is not None:
        query += " AND products_variants.price >= :min_price"
        params["min_price"] = min_price

    if max_price is not None:
        query += " AND products_variants.price <= :max_price"
        params["max_price"] = max_price

    if max_rating is not None:
        query += " AND products.rating <= :max_rating"
        params["max_rating"] = max_rating

    if min_rating is not None:
        query += " AND products.rating >= :min_rating"
        params["min_rating"] = min_rating

    if sort_by is not None:
        if sort_by == "price_high_to_low":
            query += " ORDER BY products_variants.price DESC" 
        elif sort_by == "price_low_to_high":
            query += " ORDER BY products_variants.price"
    
    query += " LIMIT 20"


    with engine.connect() as conn:
        result = conn.execute(
            text(query),
            params
        )

        products_list = result.mappings().all()
    return [dict(product) for  product in products_list]

def call_database():
    with engine.connect() as conn:
        result = conn.execute(
            text(
            """
            SELECT products.product_id , products_variants.variant_product_id , products.name , products.category, products.description , products.brand, products_variants.color 
            FROM products
            JOIN products_variants
            ON products.product_id = products_variants.product_id
            """
        ))
        products_list =  result.mappings().all()
    return [dict(product) for product in products_list]

def create_embedding_text(products):
    embedding_texts = []
    for product in products:
        product_text= f"""
        Name:{product.get("name","")}
        Description:{product.get("description","")}
        Brand:{product.get("brand","")}
        Category:{product.get("category","")} 
        Color:{product.get("Color","")} 
        """.strip()
        embedding_texts.append(product_text)
    return embedding_texts

def text_embedding(products_texts,embedding_model = embedding_model):
    embedded_text = embedding_model.embed_documents(
        products_texts
        )
    return embedded_text

def create_embedding_products(products, embedding_texts):
    embedded_products = []
    for product,embedding_text in zip(products,embedding_texts):
        embedded_products.append({
            "product_id":product.get("product_id"),
            "variant_product_id":product.get("variant_product_id"),
            "embedded_text":embedding_text
        })
    return embedded_products

def build_embedding_lookup(products_database):
    text_for_embedding = create_embedding_text(products_database)
    embedded_text = text_embedding(products_texts=text_for_embedding)
    embedded_products = create_embedding_products(products=products_database , embedding_texts=embedded_text)

    embedding_lookup = {
    product["variant_product_id"] : product["embedded_text"]
    for product in embedded_products
    }

    return embedding_lookup

def semantic_search_filtered(
        query,
        embedding_lookup,
        filtered_products,
        top_k
):
    candidate_products = []
    candidate_embeddings = []
    if not filtered_products:
        return []
    
    for product in filtered_products:
        variant_id = product["variant_product_id"]
        if variant_id in embedding_lookup:
            candidate_products.append(product)
            candidate_embeddings.append(
                embedding_lookup.get(variant_id)
            )

    if not candidate_embeddings:
        return []
    candidate_embeddings = np.array(candidate_embeddings)
    query_embedding = embedding_model.embed_query(
        query
    )

    similarities = candidate_embeddings @ query_embedding

    top_indices = np.argsort(similarities)[::-1][:top_k]

    results = []

    for index in top_indices:
        results.append({
            **candidate_products[index],
            "similarity": float(similarities[index])
        })

    return results


products_database = call_database()
embedding_lookup = build_embedding_lookup(products_database)


@tool(args_schema=ProductFilter)
def search_products(
    category:str|None=None,
    color:str|None=None,
    size:str|None=None,
    brand:str|None=None,
    min_price:float|None=None,
    max_price:float|None=None,
    limit:int|None= None,
    sort_by:str|None =None,
    max_rating:float|None= None,
    min_rating:float|None= None,

    runtime: ToolRuntime = None,
):

    
    """
    Search the product catalog.

    Use this tool whenever the user wants to search, filter,
    browse, or find products.
    """

    message = next(
        msg.content
        for msg in reversed(runtime.state["messages"])
        if isinstance(msg, HumanMessage)
    )

    filters = {
        "category":category,
        "color":color,
        "size":size,
        "brand":brand,
        "min_price":min_price,
        "max_price":max_price,
        "limit":limit,
        "sort_by":sort_by,
        "max_rating":max_rating,
        "min_rating":min_rating,
    }

    normalized_filters = normalize_filters(filters)

    filtered_products = product_search(
    category=normalized_filters["category"],
    color=normalized_filters["color"],
    size=normalized_filters["size"],
    brand=normalized_filters["brand"],
    min_price=normalized_filters["min_price"],
    max_price=normalized_filters["max_price"],
    sort_by=normalized_filters["sort_by"],
    max_rating=normalized_filters["max_rating"],
    min_rating=normalized_filters["min_rating"],
    )

    semantic_searched_products = semantic_search_filtered(
        query = message,
        embedding_lookup = embedding_lookup,
        filtered_products = filtered_products,
        top_k = normalized_filters["limit"] or 5
    )

    return semantic_searched_products