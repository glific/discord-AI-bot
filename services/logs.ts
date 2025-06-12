import pino from "pino";
import { createPinoBrowserSend, createWriteStream } from "pino-logflare";

const setLogs = (error: any) => {
  const sourceToken = process.env.LOG_FLARE_SOURCE;
  const apiKey = process.env.LOG_FLARE_API;

  if (sourceToken && apiKey) {
    const stream = createWriteStream({
      apiKey,
      sourceToken,
    });

    const send = createPinoBrowserSend({
      apiKey,
      sourceToken,
    });

    const logger = pino(
      {
        browser: {
          transmit: {
            // @ts-ignore
            send,
          },
        },
      },
      stream
    );

    logger.error(error);
  }
};

export default setLogs;
