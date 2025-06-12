import OpenAI from "openai";
import { sleep } from "openai/core";
import setLogs from "./logs";

const getAnswerFromOpenAIAssistant = async (message: string) => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORGID,
  });

  const assistant = await openai.beta.assistants.retrieve(
    process.env.ASSISTANT_ID || ""
  );

  const thread = await openai.beta.threads.create();

  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: message,
  });

  try {
    let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    });

    while (run.status !== "completed") {
      if (
        [
          "requires_action",
          "cancelling",
          "cancelled",
          "failed",
          "incomplete",
          "expired",
        ].includes(run.status)
      ) {
        setLogs(JSON.stringify(run));
        return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
      }
      await sleep(1000);
    }

    const messages: any = await openai.beta.threads.messages.list(
      run.thread_id
    );
    for (const message of messages.data.reverse()) {
      if (message.role === "assistant") {
        return message.content[0].text.value;
      }
    }

    setLogs(JSON.stringify({ run, message }));
    return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
  } catch (e) {
    setLogs(JSON.stringify(e));
    return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
  }
};

export default getAnswerFromOpenAIAssistant;
