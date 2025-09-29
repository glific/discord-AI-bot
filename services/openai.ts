import setLogs from "./logs";
import axios from "axios";

const getAnswerFromOpenAIAssistant = async (message: string) => {
  try {
    const endpoint = "https://api.openai.com/v1/responses";

    const data = {
      prompt: {
        id: "pmpt_68da98832540819484bcf068281fe4dc0a07d71c30dcbfd5",
      },
      input: [{ role: "user", content: message }],
    };

    const config = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    };

    const answer = await axios
      .post(endpoint, data, config)
      .then((response) => {
        const answer = response.data.output.find((item: any) => item.content);
        return answer.content[0].text;
      })
      .catch((error) => {
        setLogs(JSON.stringify(error));
        return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
      });
    return answer;
  } catch (e) {
    setLogs(JSON.stringify(e));
    return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
  }
};

export default getAnswerFromOpenAIAssistant;
