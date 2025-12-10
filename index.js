import dotenv from "dotenv";
import express from "express";
import "isomorphic-fetch"; // Automatically polyfills fetch
import DiscordJS, { GatewayIntentBits } from "discord.js";
import bodyParser from "body-parser";
import cors from "cors";
import { askGlific } from "./services/discord/commands/askGlific";
import { closeTicket, getFeedback } from "./services/discord/commands/close";
import { post } from "./services/discord/commands/post";
import { selectString, supportMetrics, } from "./services/discord/commands/supportMetrics";
import { handleAIFeedback, onThreadCreate, onThreadUpdate, registerCommand, } from "./services/discord/discord";
import setLogs from "./services/logs";
import { resumeFlow } from "./services/metrics/resumeflow";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cors());
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
app.post("/get-metrics", async (req, res) => {
    const { startDate, endDate, contact, flowId } = req.body;
    res.json({
        success: true,
    });
    resumeFlow(startDate, endDate, contact, flowId);
});
const client = new DiscordJS.Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});
client.login(process.env.BOT_TOKEN);
client.on("ready", async () => {
    registerCommand(client);
    setLogs("Bot is ready");
});
client.on("threadCreate", async (thread) => {
    try {
        await onThreadCreate(thread);
    }
    catch (error) {
        console.error("Handler error:", error);
        setLogs(JSON.stringify({ error, handler: "onThreadCreate" }));
    }
});
client.on("threadUpdate", async (oldThread, newThread) => {
    await onThreadUpdate(oldThread, newThread);
});
let noOfDays = "0";
// Event that triggers when a user interacts with a registered command
client.on("interactionCreate", async (interaction) => {
    if (interaction.isStringSelectMenu()) {
        selectString(noOfDays, interaction, client);
    }
    if (interaction.isButton()) {
        const customId = interaction.customId;
        if (customId.startsWith("rating_")) {
            getFeedback(interaction);
        }
        else if (customId.startsWith("query_resolved_") ||
            customId.startsWith("need_support_")) {
            await handleAIFeedback(interaction);
        }
    }
    if (!interaction.isCommand())
        return;
    if (!interaction.isChatInputCommand())
        return;
    switch (interaction.commandName) {
        case "askglific":
            // Join the arguments to form the user's question
            await askGlific(interaction);
            break;
        case "post":
            // Join the arguments to form the user's question
            await post(interaction);
            break;
        case "close-ticket":
            await closeTicket(interaction);
            break;
        case "support-metrics":
            // Join the arguments to form the user's question
            await supportMetrics(noOfDays, interaction, client);
            break;
        default:
            setLogs("Unknown command: " + interaction.commandName);
            break;
    }
});
