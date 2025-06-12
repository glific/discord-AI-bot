import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

export const tagIds = [
  { id: "1037985352536830013", name: "Knowledge Gap" },
  { id: "1037985383465627679", name: "Bug" },
  { id: "1037985445172215839", name: "New Feature" },
  { id: "1044545382782349393", name: "Reolved" },
  { id: "1044546639513276416", name: "Documentation update" },
  { id: "1052438915778363422", name: "No Response" },
  { id: "1052458635298619474", name: "Priority 1" },
  { id: "1052798794221240321", name: "Priority 2" },
  { id: "1057180917623435295", name: "Priority 3" },
  { id: "1057181111920369674", name: "Priority 4" },
  { id: "1206900864086974504", name: "In Process" },
  { id: "1207181596482871336", name: "Pending from Org" },
  { id: "1213041779310469180", name: "Bug at Meta's End" },
  { id: "1213042817652232222", name: "Task" },
  { id: "1240173333597917224", name: "Not Replicable" },
  { id: "1269832617830777016", name: "Nov" },
  { id: "1271417466555338847", name: "Resources" },
  { id: "1271417514110357525", name: "Closed" },
  { id: "1280027263685099604", name: "Sept" },
  { id: "1290533381821567030", name: "Oct" },
];

export const resolvedTagId = "1044545382782349393";

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

export const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "";
