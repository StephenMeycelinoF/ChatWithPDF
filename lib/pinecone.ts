import { Pinecone } from "@pinecone-database/pinecone";

if (!process.env.PINECONE_API_KEY) {
  throw new Error("PINECONE_API_KEY is not set");
}

const pineconeClient = new Pinecone({
  // @ts-ignore
  apiKey: process.env.PINECONE_API_KEY,
});

export default pineconeClient;
