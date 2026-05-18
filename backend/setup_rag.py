import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from rag.setup import setup_vector_store

print("Setting up ChromaDB vector store...")
setup_vector_store()
print("RAG setup complete.")