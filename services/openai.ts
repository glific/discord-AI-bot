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

export default getAnswerFromOpenAIAssistant;
