import chromadb

print("🔍 Checking ChromaDB status...")

# Connect to ChromaDB
client = chromadb.PersistentClient(path="data/chroma_db")


# List all collections
collections = client.list_collections()
print(f"\n📁 Available collections: {[c.name for c in collections]}")

if collections:
    collection = client.get_collection("youtube_videos")
    count = len(collection.get()["ids"])
    print(f"✅ Collection 'youtube_videos' found with {count} embeddings.\n")
else:
    print("⚠️ No collections found in ChromaDB.")
