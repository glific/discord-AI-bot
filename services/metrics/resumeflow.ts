import axios from "axios";
import { getAuthToken } from "./auth";

export const resumeFlow = async (
  startDate: any,
  endDate: any,
  contact: any,
  flowId: any
) => {
  try {
    if (!startDate || !endDate) {
      console.log({
        error: "Missing required query parameters: startDate and endDate",
      });
      return;
    }
    const token = await getAuthToken();
    const GOOGLE_SCRIPT_BASE_URL = process.env.GOOGLE_SCRIPT_API || "";
    const finalUrl = `${GOOGLE_SCRIPT_BASE_URL}?startDate=${encodeURIComponent(
      startDate
    )}&endDate=${encodeURIComponent(endDate)}`;

    const response = await axios.get(finalUrl, { maxRedirects: 5 });
    console.log(response.data);

    const data = JSON.stringify({
      query: `mutation resumeContactFlow($flowId: ID!, $contactId: ID!, $result: Json!) {
                  resumeContactFlow(flowId: $flowId, contactId: $contactId, result: $result) {
                    success
                    errors {
                        key
                        message
                    }
                  }
                }`,
      variables: {
        flowId: flowId,
        contactId: contact?.id,
        result: JSON.stringify({
          metrics: response?.data,
        }),
      },
    });

    let config = {
      url: process.env.GLIFIC_URL || "",
      headers: {
        authorization: token,
        "Content-Type": "application/json",
      },
    };

    if (token) {
      await axios
        .post(config?.url, data, {
          headers: config?.headers,
        })
        .then((data) => console.log(data.data.data.resumeContactFlow));
    }
  } catch (error: any) {
    console.log({ error: "Failed to fetch data", details: error.message });
  }
};
