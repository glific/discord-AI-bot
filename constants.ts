import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ForumChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

export const getForumTags = (client: Client) => {
  const forumChannel = client.channels.cache.get(process.env.CHANNEL_ID || "");

  if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
    return (forumChannel as ForumChannel).availableTags;
  }

  return [];
};

export const getRatingButtons = (threadId: string) => {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...[1, 2, 3, 4, 5].map((rating) =>
      new ButtonBuilder()
        .setCustomId(`rating_${rating}_${threadId}`)
        .setLabel("⭐".repeat(rating))
        .setStyle(ButtonStyle.Secondary)
    )
  );
  return row;
};

export const getFeedbackModal = (
  userId: string,
  threadId: string,
  rating: number
) => {
  return new ModalBuilder()
    .setCustomId(`feedback_modal_${userId}_${threadId}_${rating}`)
    .setTitle("Optional Feedback")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("feedback_input")
          .setLabel("Any comments?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );
};

export function processStringArray(
  arr: Array<{ id: string; timeSpanned: number }>,
  chunkSize = 10,
  separator = "\n"
) {
  const result = [];

  const links = arr.map((ar) => {
    const daysDifference = Math.floor(ar.timeSpanned / (1000 * 60 * 60 * 24));
    const hoursDifference = Math.floor(
      (ar.timeSpanned % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );

    return `https://discord.com/channels/${process.env.CHANNEL_ID}/${ar.id} => Interaction time: ${daysDifference} days and ${hoursDifference} hours`;
  });
  for (let i = 0; i < links.length; i += chunkSize) {
    const chunk = links.slice(i, i + chunkSize);
    const appendedString = chunk.join(separator);
    result.push(appendedString);
  }
  return result;
}
