"use server";

import { auth } from "@clerk/nextjs/server";
import { generateLangchainCompletion } from "@/lib/langchain";
import { adminDb } from "@/firebaseAdmin";
import { Message } from "@/components/Chat";

const FREE_LIMIT = 3;
const PRO_LIMIT = 100;

export async function askQuestion(id: string, question: string) {
  auth().protect();

  const { userId } = await auth();

  const chatRef = adminDb
    .collection("users")
    .doc(userId!)
    .collection("files")
    .doc(id)
    .collection("chat");

  //   Check how many user message are in the chat
  const chatSnapShot = await chatRef.get();
  const userMessages = chatSnapShot.docs.filter(
    (doc) => doc.data().role === "human"
  );

  //   Limit Pro/Free users

  const userMessage: Message = {
    role: "human",
    message: question,
    createdAt: new Date(),
  };

  await chatRef.add(userMessage);

  //   Generate AI Response
  const replay = await generateLangchainCompletion(id, question);
  const aiMessage: Message = {
    role: "ai",
    message: replay,
    createdAt: new Date(),
  };

  await chatRef.add(aiMessage);

  return {
    success: true,
    message: null,
  };
}
