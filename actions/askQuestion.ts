"use server";

import { auth } from "@clerk/nextjs/server";
import { generateLangchainCompletion } from "@/lib/langchain";
import { adminDb } from "@/firebaseAdmin";
import { Message } from "@/components/Chat";

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

  // Check membership limit for messages in a document
  const userRef = await adminDb.collection("users").doc(userId!).get();

  //   Limit Pro/Free users
  const PRO_LIMIT = 10;
  const FREE_LIMIT = 2;

  // Check if users is on Free plan and has asked more than FREE NUMBER quesstions
  if (!userRef.data()?.hasActiveMembership) {
    if (userMessages.length >= FREE_LIMIT) {
      return {
        success: false,
        message: `You'll need to upgrade to PRO to ask more than ${FREE_LIMIT} questions! 😫`,
      };
    }
  }

  // Check if users is on Pro plan and has asked more than PRO NUMBER quesstions
  if (!userRef.data()?.hasActiveMembership) {
    if (userMessages.length >= PRO_LIMIT) {
      return {
        success: false,
        message: `You've reached the PRO limit to ${PRO_LIMIT} questions of document! 😫`,
      };
    }
  }

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
