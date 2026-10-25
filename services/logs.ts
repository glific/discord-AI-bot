import { AsyncLocalStorage } from "async_hooks";

const context = new AsyncLocalStorage<{ threadId?: string }>();

export const withThreadContext =
  <A extends unknown[]>(
    getThreadId: (...args: A) => string | null | undefined,
    handler: (...args: A) => Promise<void>,
  ) =>
  (...args: A) =>
    context.run({ threadId: getThreadId(...args) ?? undefined }, () =>
      handler(...args),
    );

const withContext = (message: string) => {
  const threadId = context.getStore()?.threadId;
  return threadId ? `threadId=${threadId} ${message}` : message;
};

export const logInfo = (message: string) => {
  console.log(withContext(message));
};

export const logError = (message: string, error?: unknown) => {
  if (error === undefined) {
    console.error(withContext(message));
  } else {
    console.error(withContext(message), error);
  }
};
