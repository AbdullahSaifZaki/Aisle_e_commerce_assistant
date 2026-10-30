import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('OPENAI_API_KEY', 'test-not-a-real-key')
os.environ.setdefault('REDIS_URL', 'rediss://localhost:6379')
import app
from fastapi.testclient import TestClient
from models.embedding import CachedEmbeddings

class Cache:
    def __init__(self): self.values = {}
    def mget(self, keys): return [self.values.get(k) for k in keys]
    def mset(self, values): self.values.update(values)

class DeploymentTests(unittest.TestCase):
    def test_health_and_auth_do_not_need_databases_or_embeddings(self):
        with patch('socket.create_connection', side_effect=AssertionError('Network access during startup')):
            with TestClient(app.app) as client:
                self.assertEqual(client.get('/health').status_code, 200)
                for path in ('/chat', '/api/chat'):
                    self.assertEqual(client.post(path, json={'message':'hello'}).status_code, 401)

    def test_graph_import_does_not_query_or_embed(self):
        import importlib
        with patch('sqlalchemy.engine.Engine.connect', side_effect=AssertionError('Database access during import')), patch('models.embedding.CachedEmbeddings.embed_documents', side_effect=AssertionError('Embedding during import')):
            importlib.import_module('graph')

    def test_document_vectors_survive_new_embedding_instances(self):
        cache = Cache()
        with patch('models.embedding.cache_client', return_value=cache), patch('models.embedding.OpenAIEmbeddings') as factory:
            factory.return_value.embed_documents.side_effect = lambda texts: [[len(text)] for text in texts]
            first = CachedEmbeddings()
            self.assertEqual(first.embed_documents(['shoe', 'shoe']), [[4],[4]])
            factory.return_value.embed_documents.assert_called_once_with(['shoe'])
            second = CachedEmbeddings()
            self.assertEqual(second.embed_documents(['shoe']), [[4]])
            self.assertEqual(factory.return_value.embed_documents.call_count, 1)
            self.assertEqual(second.embed_documents(['new shoe']), [[8]])
            self.assertEqual(factory.return_value.embed_documents.call_count, 2)

    def test_dependency_failure_returns_503(self):
        import main
        main.app.dependency_overrides[main.verify_token] = lambda: {'sub':'test'}
        try:
            with patch('main.enforce_chat_limits'), patch('main.run_agent', side_effect=RuntimeError('offline')):
                with TestClient(app.app) as client:
                    response = client.post('/chat', json={'message':'hello'})
                    self.assertEqual(response.status_code, 503)
                    self.assertNotIn('offline', response.text)
        finally:
            main.app.dependency_overrides.clear()

if __name__ == '__main__': unittest.main()
