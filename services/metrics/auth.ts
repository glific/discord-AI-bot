import axios from "axios";

export const getAuthToken = async () => {
  try {
    const glific_backend_url = process.env.GLIFIC_URL || "";
    const response = await axios.post(`${glific_backend_url}/v1/session`, {
      user: {
        phone: process.env.PHONE,
        password: process.env.PASSWORD,
      },
    });
    return response.data.data.access_token;
  } catch (error) {
    console.log("Error in getting token", error);
  }
};
