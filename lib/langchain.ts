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

async function fetchMessagesFromDB(docId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not Found!");
  }

  console.log("-- Fetching chat history from the firestore database --");
  // const LIMIT = 6;
  // Get the last 6 messages from the chat history
  const chats = await adminDb
    .collection("users")
    .doc(userId)
    .collection("files")
    .doc(docId)
    .collection("chat")
    .orderBy("createdAt", "desc")
    // .limit(LIMIT)
    .get();

  const chatHistory = chats.docs.map((doc) =>
    doc.data().role === "human"
      ? new HumanMessage(doc.data().message)
      : new AIMessage(doc.data().message)
  );

  console.log(`-- Chat History fetched Successfully: ${chatHistory} --`);
  console.log(chatHistory.map((msg) => msg.content.toString()));

  return chatHistory;
}

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

const generateLangchainCompletion = async (docId: string, question: string) => {
  let pineconeVectorStore;

  pineconeVectorStore = await generateEmbeddingsInPineconeVectorStore(docId);

  if (!pineconeVectorStore) {
    throw new Error("Pinecone Vector Store not found");
  }

  // Create a retriever to search through the Pinecone vector store
  console.log("-- Creating a Retriever --");
  const retriever = pineconeVectorStore.asRetriever();

  // Fetch the chat history from the database Firestore
  const chatHistory = await fetchMessagesFromDB(docId);

  // Define a prompt template for generating search queries based on conversation history
  console.log("-- Defining Prompt Template --");
  const historyAwarePrompt = ChatPromptTemplate.fromMessages([
    ...chatHistory, // The Actual Chat History
    ["user", "{input}"],
    [
      "user",
      "Given the above conversion, generate a search query to look up in order to get information relevant to the conversation",
    ],
  ]);

  // Create a history-aware retriever chain that users the model, retriever, and prompt
  console.log("-- Creating a History-Aware Retriever Chain --");
  const historyAwareRetrieverChain = await createHistoryAwareRetriever({
    llm: model,
    retriever,
    rephrasePrompt: historyAwarePrompt,
  });

  // Define a prompt template for answering questions based on retriever context
  console.log("-- Defining Answer Template --");
  const historyAwareRetrievalPrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "Answer that user's questions based on the below context:\n\n{context}",
    ],

    ...chatHistory, // The Actual Chat History
    ["user", "{input}"],
  ]);

  // Create a chain to combine the retrieved documents into a coherent response
  console.log("-- Creating a document combining chain --");
  const historyAwareCombineDocsChain = await createStuffDocumentsChain({
    llm: model,
    prompt: historyAwareRetrievalPrompt,
  });

  // Create the main retrieval chain that combines the history-aware retriever and document combining chains
  console.log("-- Creating the main retrieval chain --");
  const conversationRetrievalChain = await createRetrievalChain({
    retriever: historyAwareRetrieverChain,
    combineDocsChain: historyAwareCombineDocsChain,
  });

  console.log("-- Running the chain with a simple conversation --");
  const reply = await conversationRetrievalChain.invoke({
    chat_history: chatHistory,
    input: question,
  });

  // Print the result to the console
  console.log(reply.answer);
  return reply.answer;
};

export { model, generateLangchainCompletion };
