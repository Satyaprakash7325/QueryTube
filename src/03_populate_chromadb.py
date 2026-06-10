# src/03_populate_chromadb.py

import pandas as pd
from chromadb_utils import get_client
from embed_utils import generate_embeddings
from store_chromadb import store

def populate_database(csv_path="data/Merged_Video_Transcript.csv"):
    # Load dataset
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} videos from CSV.")

    # Fill missing descriptions
    df['description'] = df['description'].fillna("")
  
    # Prepare text for embeddings: title + description
    texts = (df['title'] + " " + df['description']).astype(str).tolist()

    # Generate embeddings
    print("🧠 Generating embeddings...")
    embeddings = generate_embeddings(texts)
    print(f"✅ Generated embeddings for {len(embeddings)} videos.")

    # Initialize Chroma client
    client = get_client()

    # Store videos and embeddings in ChromaDB
    store(client, df.to_dict(orient="records"), embeddings)
    print(f"✅ Database populated successfully with {len(df)} videos.")

if __name__ == "__main__":
    populate_database()
