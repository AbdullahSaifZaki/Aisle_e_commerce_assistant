"""OpenAI embeddings with a shared, content-addressed Redis document cache."""
import hashlib
import json
import os
from functools import lru_cache

import certifi
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from redis import Redis

load_dotenv()
MODEL = "text-embedding-3-small"

@lru_cache(maxsize=1)
def cache_client():
    url = os.environ["REDIS_URL"]
    options = {"ssl_ca_certs": certifi.where()} if url.startswith("rediss://") else {}
    return Redis.from_url(url, socket_connect_timeout=5, socket_timeout=5, **options)

class CachedEmbeddings:
    def __init__(self):
        self.model = OpenAIEmbeddings(model=MODEL, request_timeout=30, max_retries=1)

    def embed_query(self, text):
        return self.model.embed_query(text)

    def embed_documents(self, texts):
        if not texts:
            return []
        keys = ["aisle:embedding:v1:" + hashlib.sha256(
            (MODEL + "\0" + text).encode()).hexdigest() for text in texts]
        cache = cache_client()
        stored = cache.mget(keys)
        vectors = [json.loads(value) if value is not None else None for value in stored]
        missing = list(dict.fromkeys(key for key, value in zip(keys, vectors) if value is None))
        if missing:
            text_by_key = dict(zip(keys, texts))
            fresh = self.model.embed_documents([text_by_key[key] for key in missing])
            by_key = dict(zip(missing, fresh))
            cache.mset({key: json.dumps(vector) for key, vector in by_key.items()})
            vectors = [by_key[key] if vector is None else vector for key, vector in zip(keys, vectors)]
        return vectors

embedding_model = CachedEmbeddings()
