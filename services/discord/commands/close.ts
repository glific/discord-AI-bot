import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ThreadChannel,
} from "discord.js";
import setLogs from "../../logs";
import dayjs from "dayjs";
import { updateSheets } from "../../sheet";
import { getRatingButtons, resolvedTagId } from "../../../constants";

// This function is extracted to be reusable across different interaction types:
// - Can be called with ChatInputCommandInteraction and ButtonInteraction
export const closeTicketLogic = async (
  thread: ThreadChannel,
  description?: string,
  closedOn?: string,
  userId?: string
) => {
  const threadId = thread.id;
  const createdTimestamp = thread.createdTimestamp;
  const userMention = userId ? `<@${userId}>` : `<@${thread?.ownerId}>`;

  // Calculate closure time in minutes
  const closureTimeMinutes = dayjs().diff(createdTimestamp, "minute");
  const closedAt = closedOn || dayjs().format("YYYY-MM-DD HH:mm");

  // Add the "Resolved" tag if not already present
  const currentTags = thread.appliedTags;

  if (!currentTags.includes(resolvedTagId)) {
    await thread.setAppliedTags([...currentTags, resolvedTagId]);
  }

  // Prepare values for sheet update
  const values: any = {
    "Closure Time": closureTimeMinutes.toString(),
    "Closed at": closedAt,
    Description: description || "Closed via AI feedback - Query resolved",
  };

  const writeValues = [
    [
      threadId, //thread_id
      new Date(), // Date
      "", // Raised By
      "", // Title
      "", // Tags
      "", // First Response
      "", // Response time
      closedAt, // Closed at
      closureTimeMinutes.toString(), // Closure Time
      description || "Closed via AI feedback - Query resolved", // Description
      "", // Post
      "", // AI response,
    ],
  ];

  // Update the sheet
  await updateSheets(threadId, values, writeValues);

  // Send rating request message
  await thread.send({
    content: `**Please leave a quick rating to help us improve:**`,
    components: [getRatingButtons(threadId)],
  });
};

export const closeTicket = async (interaction: ChatInputCommandInteraction) => {
  const description = interaction.options.get("description")?.value?.toString();
  const closedOn = interaction.options.get("closed-on")?.value?.toString();
  const thread = interaction.channel as ThreadChannel;

  // Check if the command is being used in a thread
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
    await closeTicketLogic(thread, description, closedOn);

    // Send confirmation message
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
      content:
        "❌ An error occurred while closing the ticket. Please try again.",
    });
  }
};

export const getFeedback = async (interaction: ButtonInteraction) => {
  const customId = interaction.customId;
  const [, rating, threadId] = customId.split("_");
  const ratingValue = parseInt(rating);

  // Custom message instead of "Bot is thinking"
  await interaction.reply({
    content: `⭐ Recording your rating...`,
    ephemeral: true,
  });
  try {
    // Store the feedback
    await storeFeedback(threadId, ratingValue);

    // Acknowledge the rating using editReply
    await interaction.editReply({
      content: `Thank you for rating our support! You gave us ${ratingValue} star${
        ratingValue > 1 ? "s" : ""
      } 🙏`,
    });

    // Remove the rating buttons from the original message
    await interaction.message.edit({
      content: `🔒 This support ticket has been closed.\n\n✅ **Rating received:** ${ratingValue} star${
        ratingValue > 1 ? "s" : ""
      } `,
      components: [], // Remove the buttons
    });
  } catch (error) {
    console.error("Error handling rating:", error);
    setLogs({
      message: "Error handling rating",
      error: error,
      threadId,
    });
    await interaction.reply({
      content: "❌ There was an error recording your rating. Please try again.",
      ephemeral: true,
    });
  }
  return;
};

const storeFeedback = async (threadId: string, rating: number) => {
  const writeValues = [
    [
      threadId, //thread_id
      new Date(), // Date
      "", // Raised By
      "", // Title
      "", // Tags
      "", // First Response
      "", // Response time
      "", // Closed at
      "", // Closure Time
      "", // Description
      "", // Post
      "", // AI response,
      "", // AI Feedback,
      rating.toString(),
    ],
  ];
  updateSheets(
    threadId,
    {
      Rating: rating.toString(),
    },
    writeValues
  );
};
