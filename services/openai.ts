import setLogs from "./logs";
import axios from "axios";

const getAnswerFromOpenAIAssistant = async (message: string) => {
  try {
    const endpoint = "https://api.openai.com/v1/responses";

    const data = {
      prompt: {
        id: process.env.OPENAI_PROMPT_ID,
      },
      input: [{ role: "user", content: message }],
    };

    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      timeout: 120000,
    };

    const response = await axios.post(endpoint, data, config);
    const answer = await response.data.output.find((item: any) => item.content)
      .content[0].text;

    return (
      answer ||
      "Sorry, I am not able to answer this question. Please try again later."
    );
  } catch (e) {
    setLogs(JSON.stringify(e));
    return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
  }
};

export const summarizeThreadForGithub = async (
  transcript: string,
): Promise<string> => {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You convert Discord support threads into actionable GitHub issues for developers. Produce a concise summary (under 250 words) that includes: a one-line problem statement, what the user expected, what actually happened, any error messages, and reproduction steps if mentioned. Use plain markdown. If something is unclear, say so explicitly rather than guessing.",
          },
          { role: "user", content: transcript },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        timeout: 60000,
      },
    );
    return (
      response.data?.choices?.[0]?.message?.content?.trim() ||
      "_(No summary generated.)_"
    );
  } catch (e) {
    setLogs(JSON.stringify(e));
    return "_(Summary generation failed — please review the thread manually.)_";
  }
};

export default getAnswerFromOpenAIAssistant;
