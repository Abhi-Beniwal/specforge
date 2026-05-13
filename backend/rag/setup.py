import chromadb

from pathlib import Path


CHROMA_PATH = "./chroma_db"

COLLECTION_NAME = "specforge_docs"

DOCS_PATH = (
    Path(__file__).resolve().parent.parent / "documents"
)


def setup_vector_store():

    client = chromadb.PersistentClient(
        path=CHROMA_PATH
    )

    collection = client.get_or_create_collection(
        COLLECTION_NAME
    )

    existing_chunks = collection.count()

    if existing_chunks > 0:

        print(
            f"Collection already contains "
            f"{existing_chunks} chunks"
        )

        return collection

    chunk_id = 0

    for txt_file in DOCS_PATH.glob("*.txt"):

        text = txt_file.read_text(
            encoding="utf-8"
        )

        chunks = []

        start = 0

        while start < len(text):

            end = min(start + 500, len(text))

            chunks.append(
                text[start:end]
            )

            start += 450

        for chunk in chunks:

            collection.add(
                documents=[chunk],
                ids=[f"chunk_{chunk_id}"],
                metadatas=[
                    {
                        "source": txt_file.name
                    }
                ]
            )

            chunk_id += 1

    print(
        f"Indexed {chunk_id} chunks "
        f"from {DOCS_PATH}"
    )

    return collection


def get_relevant_context(
    query: str,
    n_results: int = 3
) -> str:

    client = chromadb.PersistentClient(
        path=CHROMA_PATH
    )

    collection = client.get_collection(
        COLLECTION_NAME
    )

    results = collection.query(
        query_texts=[query],
        n_results=n_results
    )

    chunks = results["documents"][0]

    return "\n\n---\n\n".join(chunks)