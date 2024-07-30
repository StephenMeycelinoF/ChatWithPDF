// Langchain Packages
import { ChatOpenAI } from "@langchain/openai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
// Pinecone Pacakages
import { PineconeConflictError } from "@pinecone-database/pinecone/dist/errors";
import { Index, RecordMetadata } from "@pinecone-database/pinecone";
import pineconeClient from "./pinecone";
import { PineconeStore } from "@langchain/pinecone";
// Firebase Packages
import { adminDb } from "../firebaseAdmin";
import { auth } from "@clerk/nextjs/server";

// Initialize the OpenAI with API key and model name
const model = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-3.5-turbo",
});

export const indexName = "steps";

export async function generateDocs(docId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not Found!");
  }

  console.log("-- Fetching the download URL from firebase... --");
  //   Fetching the download URL from firebase based on the docId in Firestore Database
  const firebaseRef = await adminDb
    .collection("users")
    .doc(userId)
    .collection("files")
    .doc(docId)
    .get();

  const downloadUrl = firebaseRef.data()?.downloadUrl;

  if (!downloadUrl) {
    throw new Error("Download URL not Found!");
  }

  console.log(`-- Download URL fetched Successfully: ${downloadUrl} --`);

  //   Fetch the PDF from the specified URL
  const response = await fetch(downloadUrl);

  //   Load the PDF into a PDFDocument object
  //   Blob sendiri adalah tipe data yang digunakan untuk menyimpan data biner seperti gambar, audio, video, atau file lainnya.
  const data = await response.blob();

  //   Load the PDF Document from the specified path
  console.log("-- Loading PDF Document --");
  const loader = new PDFLoader(data);
  const docs = await loader.load();

  //   Split the loaded document into smaller parts for easier processing
  console.log("-- Splitting the document into smaller parts... --");
  const splitter = new RecursiveCharacterTextSplitter();

  const splitDocs = await splitter.splitDocuments(docs);
  console.log(`-- Split into ${splitDocs.length} parts --`);

  return splitDocs;
}

async function namespaceExists(
  index: Index<RecordMetadata>,
  namespace: string
) {
  // Checking namespace in Pinecone already exists already or not
  if (namespace === null) throw new Error("No namespace value provided.");
  //   Returning Array of Namespaces
  const { namespaces } = await index.describeIndexStats();
  //   Checking if namespace value is Undefined or Not
  return namespaces?.[namespace] !== undefined;
}

export async function generateEmbeddingsInPineconeVectorStore(docId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not Found!");
  }

  let pineconeVectorStore;

  //   Generate embaddings (numerical representations) for the slipt documents
  console.log("--Generating Embeddings... --");
  const embeddings = new OpenAIEmbeddings();

  const index = await pineconeClient.index(indexName);
  const namespaceAlreadyExists = await namespaceExists(index, docId);

  if (namespaceAlreadyExists) {
    console.log(
      `--Namespace ${docId} already exists, reusing existing embeddings...--`
    );

    pineconeVectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace: docId,
    });

    return pineconeVectorStore;
  } else {
    // If the namespace does not exists, download the PDF from firestore via the stored Download URL & generate the embeddings and store them in the Pinecone vector store.
    const splitDocs = await generateDocs(docId);

    console.log(
      `-- Storing the embeddings in namespace ${docId} in the ${indexName} Pinecone vector store --`
    );

    pineconeVectorStore = await PineconeStore.fromDocuments(
      splitDocs,
      embeddings, // From OpenAI Embeddings
      {
        pineconeIndex: index, // Expect result is "steps"
        namespace: docId,
      }
    );

    return pineconeVectorStore;
  }
}
