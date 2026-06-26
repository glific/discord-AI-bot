import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Collection,
  Message,
  ThreadChannel,
} from "discord.js";
import setLogs from "../../logs";
import dayjs from "dayjs";
import { updateSheets } from "../../sheet";
import { getForumTags, getRatingButtons } from "../../../constants";
import { categorizeThread } from "../../openai";

const buildConversationTranscript = (
  messages: Collection<string, Message<boolean>>,
): string =>
  Array.from(messages.values())
    .reverse()
    .filter((m) => m.content?.trim())
    .map(
      (m) =>
        `**${m.author.username}${m.author.bot ? " (bot)" : ""}:** ${m.content}`,
    )
    .join("\n\n");

const detectDevInvolvement = (
  messages: Collection<string, Message<boolean>>,
): "Yes" | "No" => {
  const devUsernames = (process.env.DEV_USERNAMES || "")
    .split(",")
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean);
  if (devUsernames.length === 0) return "No";
  return Array.from(messages.values()).some((m) =>
    devUsernames.includes(m.author.username.toLowerCase()),
  )
    ? "Yes"
    : "No";
};

// Records closure data to the sheet and fires async categorization.
// Does NOT send any Discord messages — callers handle user-facing replies.
export const recordTicketClosure = async (
  thread: ThreadChannel,
  description?: string,
  closedOn?: string,
) => {
  const threadId = thread.id;
  const createdTimestamp = thread.createdTimestamp;
  const firstMessage = await thread.fetchStarterMessage();

  const closureTimeMinutes = dayjs().diff(createdTimestamp, "minute");
  const closedAt = closedOn || dayjs().format("YYYY-MM-DD HH:mm");

  const currentTags = thread.appliedTags;
  const tags = getForumTags(thread.client);
  const resolvedTag = tags.find((tag) => tag.name === "Resolved");
  if (resolvedTag && !currentTags.includes(resolvedTag.id)) {
    if (currentTags.length >= 5) {
      throw new Error(
        "Cannot close ticket: this thread has too many tags applied. Applied tags should not be greater than 4 to allow adding the 'Resolved' tag. Please remove a tag and try again.",
      );
    }
    await thread.setAppliedTags([...currentTags, resolvedTag.id]);
  }

  const messages = await thread.messages.fetch({ limit: 100 });
  const conversation = buildConversationTranscript(messages);
  const devInvolved = detectDevInvolvement(messages);

  await updateSheets(threadId, {
    "Closure Time": closureTimeMinutes.toString(),
    "Closed at": closedAt,
    Description: description || "Closed via AI feedback - Query resolved",
    Conversation: conversation,
    "Dev Involved": devInvolved,
  });

  categorizeThread(conversation)
    .then((category) => {
      if (category) {
        return updateSheets(threadId, { "Issue Category": category });
      }
    })
    .catch((err) => {
      setLogs({ message: "Error categorizing thread", error: err, threadId });
    });
};

export const closeTicket = async (interaction: ChatInputCommandInteraction) => {
  const description = interaction.options.get("description")?.value?.toString();
  const closedOn = interaction.options.get("closed-on")?.value?.toString();
  const thread = interaction.channel as ThreadChannel;

  if (
    !interaction.channel?.isThread() ||
    thread.parentId !== process.env.CHANNEL_ID
  ) {
    await interaction.reply({
      content: "This command can only be used in a support thread!",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "🔒 Closing ticket and updating records...",
    ephemeral: false,
  });

  try {
    await recordTicketClosure(thread, description, closedOn);

    await thread.send({
      content: `**Please leave a quick rating to help us improve:**`,
      components: [getRatingButtons(thread.id)],
    });

    await interaction.editReply({
      content: `✅ Ticket closed successfully!`,
    });
  } catch (error) {
    console.error("Error closing ticket:", error);
    setLogs({
      message: "Error closing ticket",
      error: error,
      threadId: thread.id,
    });

    await interaction.editReply({
      content: `❌ ${
        error instanceof Error
          ? error.message
          : "An error occurred while closing the ticket. Please try again."
      }`,
    });
  }
};

export const getFeedback = async (interaction: ButtonInteraction) => {
  const customId = interaction.customId;
  const [, rating, threadId] = customId.split("_");
  const ratingValue = parseInt(rating);
  const thread = interaction.channel as ThreadChannel;

  try {
    await interaction.reply({
      content: `⭐ Recording your rating...`,
      ephemeral: true,
    });

    await storeFeedback(thread, ratingValue, thread.createdTimestamp);

    await interaction.editReply({
      content: `Thank you for rating our support! You gave us ${ratingValue} star${
        ratingValue > 1 ? "s" : ""
      } 🙏`,
    });

    await interaction.message.edit({
      content: `🔒 This support ticket has been closed.\n\n✅ **Rating received:** ${ratingValue} star${
        ratingValue > 1 ? "s" : ""
      } `,
      components: [],
    });
  } catch (error) {
    console.error("Error handling rating:", error);
    setLogs({
      message: "Error handling rating",
      error: error,
      threadId,
    });
    try {
      await interaction.editReply({
        content:
          "❌ There was an error recording your rating. Please try again.",
      });
    } catch {
      // initial reply may have failed (e.g. expired interaction) — nothing to do
    }
  }
  return;
};

const storeFeedback = async (
  thread: ThreadChannel,
  rating: number,
  _createdTimestamp: number | null,
) => {
  await updateSheets(thread.id, { Rating: rating.toString() });
};
