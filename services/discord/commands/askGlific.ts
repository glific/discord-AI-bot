import { ChatInputCommandInteraction, Interaction } from "discord.js";
import getAnswerFromOpenAIAssistant from "../../openai";
import { splitMessage } from "../discord";

export const askGlific = async (interaction: ChatInputCommandInteraction) => {
  const question = interaction.options.get("question")?.value?.toString();
  if (question) {
    interaction.reply({
      content: `Your question **${question}** is getting processed...`,
      ephemeral: false,
    });

    const answer = await getAnswerFromOpenAIAssistant(question);
    for (const chunk of splitMessage(answer)) {
      await interaction.followUp(chunk);
    }
  } else {
    interaction.reply("Unable to answer the query");
  }
};
