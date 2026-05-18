import sys
from pathlib import Path

# Add backend directory to Python path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from rag.setup import setup_vector_store

print("Setting up ChromaDB vector store...")
setup_vector_store()
print("RAG setup complete.")