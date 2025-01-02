import "isomorphic-fetch"; // Automatically polyfills fetch
import dotenv from "dotenv";
import DiscordJS, { ActionRowBuilder, ApplicationCommandOptionType, ChannelType, GatewayIntentBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, } from "discord.js";
import express from "express";
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";
import bodyParser from "body-parser";
import OpenAI from "openai";
import { sleep } from "openai/core";
import dayjs from "dayjs";
import pino from "pino";
import { createPinoBrowserSend, createWriteStream } from "pino-logflare";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
const spreadsheetId = process.env.SPREADSHEET_ID || "";
const tagIds = [
    { id: "1037985352536830013", name: "Knowledge Gap" },
    { id: "1037985383465627679", name: "Bug" },
    { id: "1037985445172215839", name: "New Feature" },
    { id: "1044545382782349393", name: "Resolved" },
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
const setLogs = (error) => {
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
        const logger = pino({
            browser: {
                transmit: {
                    // @ts-ignore
                    send,
                },
            },
        }, stream);
        logger.error(error);
    }
};
const writeToSheets = async (values) => {
    const requestBody = {
        values,
    };
    const auth = new GoogleAuth({
        scopes: "https://www.googleapis.com/auth/spreadsheets",
        credentials: {
            client_email: process.env.GCP_CLIENT_EMAIL,
            private_key: process.env.GCP_PRIVATE_KEY?.split("\\n").join("\n"),
        },
    });
    const service = google.sheets({ version: "v4", auth });
    try {
        const result = await service.spreadsheets.values.append({
            spreadsheetId,
            valueInputOption: "RAW",
            requestBody,
            insertDataOption: "INSERT_ROWS",
            range: "A1",
        });
        console.log("%d cells updated.", result.data.updates?.updatedCells);
        return result;
    }
    catch (err) {
        setLogs(err);
        throw err;
    }
};
const updateSheets = async (id, values) => {
    const auth = new GoogleAuth({
        scopes: "https://www.googleapis.com/auth/spreadsheets",
        credentials: {
            client_email: process.env.GCP_CLIENT_EMAIL,
            private_key: process.env.GCP_PRIVATE_KEY?.split("\\n").join("\n"),
        },
    });
    const service = google.sheets({ version: "v4", auth });
    try {
        // Step 1: Get the current sheet data to find the row index for the ID
        const sheetData = await service.spreadsheets.values.get({
            spreadsheetId,
            range: "A1:Z1005",
        });
        const rows = sheetData.data.values || [];
        const header = rows[0];
        const idIndex = header.indexOf("thread_id");
        if (idIndex === -1) {
            setLogs({ message: "thread column not found", threadId: id });
            return;
        }
        // Find the row with the matching ID
        const rowIndex = rows.findIndex((row) => row[idIndex] === id);
        if (rowIndex === -1) {
            setLogs({
                message: "Row with the specified ID not found",
                threadId: id,
            });
        }
        const updatePromises = Object.entries(values).map(async ([column, newValue]) => {
            const columnIndex = header.indexOf(column);
            if (columnIndex === -1) {
                setLogs({
                    message: "Column not found",
                    threadId: id,
                });
                return;
            }
            const cellRange = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
            return service.spreadsheets.values.update({
                spreadsheetId,
                range: cellRange,
                valueInputOption: "RAW",
                requestBody: {
                    values: [[newValue]],
                },
            });
        });
        const results = await Promise.all(updatePromises);
        console.log("%d cells updated.", results.length);
        return results;
    }
    catch (err) {
        setLogs({
            error: err,
            message: "Error updating sheet",
            threadId: id,
        });
        throw err;
    }
};
app.post("/chat", async (req, res) => {
    const user_input = req.body.user_input;
    res(getAnswerFromOpenAIAssistant(user_input, ""));
});
const getAnswerFromOpenAIAssistant = async (message, prompt) => {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        organization: process.env.OPENAI_ORGID,
        // project: process.env.OPENAI_PROJECTID,
    });
    const assistant = await openai.beta.assistants.retrieve(process.env.ASSISTANT_ID || "");
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: message,
    });
    try {
        let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
            assistant_id: assistant.id,
        });
        while (run.status !== "completed") {
            if ([
                "requires_action",
                "cancelling",
                "cancelled",
                "failed",
                "incomplete",
                "expired",
            ].includes(run.status)) {
                setLogs(JSON.stringify(run));
                return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
            }
            await sleep(1000);
        }
        const messages = await openai.beta.threads.messages.list(run.thread_id);
        for (const message of messages.data.reverse()) {
            if (message.role === "assistant") {
                return message.content[0].text.value;
            }
        }
        setLogs(JSON.stringify({ run, message }));
        return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
    }
    catch (e) {
        setLogs(JSON.stringify(e));
        return "Sorry, I am not able to answer this question due to timeout in API. Please try again later.";
    }
};
const client = new DiscordJS.Client({
    intents: ["Guilds", "GuildMessages", GatewayIntentBits.MessageContent],
});
async function registerCommand() {
    try {
        // Fetch the guild (server) where the bot is connected
        const guild = client.guilds.cache.get(process.env.GUILD_ID || "");
        if (guild) {
            // Create the command
            const command = await guild.commands.create({
                name: "askglific",
                description: "Ask a question to GPT model",
                options: [
                    {
                        name: "question",
                        description: "The question you want to ask",
                        type: ApplicationCommandOptionType.String,
                        required: true,
                    },
                ],
            });
            console.log(`Registered command: ${command.name}`);
            const command2 = await guild.commands.create({
                name: "post",
                description: "Share the post link",
                options: [
                    {
                        name: "link",
                        description: "Share the post link",
                        type: ApplicationCommandOptionType.String,
                        required: true,
                    },
                ],
            });
            console.log(`Registered command: ${command.name}`);
        }
    }
    catch (error) {
        console.error("Error registering command:", error);
        setLogs({
            message: "Error registering command",
            error,
        });
    }
}
function processStringArray(arr, chunkSize = 10, separator = "\n") {
    const result = [];
    const links = arr.map((ar) => {
        const daysDifference = Math.floor(ar.timeSpanned / (1000 * 60 * 60 * 24));
        const hoursDifference = Math.floor((ar.timeSpanned % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `https://discord.com/channels/${process.env.CHANNEL_ID}/${ar.id} => Interaction time: ${daysDifference} days and ${hoursDifference} hours`;
    });
    for (let i = 0; i < links.length; i += chunkSize) {
        const chunk = links.slice(i, i + chunkSize);
        const appendedString = chunk.join(separator);
        result.push(appendedString);
    }
    return result;
}
let noOfDays = "0";
// Event that triggers when a user interacts with a registered command
client.on("interactionCreate", async (interaction) => {
    if (interaction.isStringSelectMenu()) {
        let today = new Date();
        // Create a new date object representing 30 days prior
        let xDaysAgo = new Date(today.getTime()); // Copy the current date
        xDaysAgo.setDate(xDaysAgo.getDate() - parseInt(noOfDays));
        const targetTagId = interaction.values[0];
        const ngoSupportForum = (await client.channels.fetch(process.env.CHANNEL_ID || ""));
        console.log(ngoSupportForum);
        const threads = await Promise.all([
            ngoSupportForum.threads.fetchActive(),
            ngoSupportForum.threads.fetchArchived({ fetchAll: true }),
        ]);
        let collections = new Map();
        threads.forEach((thread) => {
            collections = new Map([...collections, ...thread.threads]);
        });
        const allIDs = [];
        if (targetTagId === "None") {
            for (let [key, value] of collections) {
                if (value.createdTimestamp &&
                    value.appliedTags.length === 0 &&
                    value.createdTimestamp > xDaysAgo.getTime()) {
                    allIDs.push({ id: key, timeSpanned: 0 });
                }
            }
            await interaction.reply(`${allIDs.length} threads have not been tagged in ${noOfDays} days`);
        }
        else {
            await interaction.reply(`Searching...`);
            for (let [key, value] of collections) {
                if (value.createdTimestamp &&
                    value.appliedTags.includes(targetTagId) &&
                    value.createdTimestamp > xDaysAgo.getTime()) {
                    const messages = await value.messages.fetch({ limit: 1 });
                    let lastMessage;
                    for (let [id, message] of messages) {
                        lastMessage = message;
                    }
                    const timeSpanned = (lastMessage?.createdTimestamp || 0) - value.createdTimestamp;
                    allIDs.push({ id: key, timeSpanned: timeSpanned });
                }
            }
            await interaction.channel?.send(`You have ${allIDs.length} threads with this tag within ${noOfDays} days`);
        }
        const finalResult = processStringArray(allIDs);
        finalResult.forEach(async (result) => {
            await interaction.channel?.send(result);
        });
    }
    if (!interaction.isCommand())
        return;
    if (interaction.commandName === "support-metrics") {
        // Join the arguments to form the user's question
        noOfDays = interaction.options.get("days")?.value?.toString() || "0";
        const ngoSupportForum = (await client.channels.fetch(process.env.CHANNEL_ID || ""));
        const availableTags = await ngoSupportForum.availableTags;
        const option = [
            new StringSelectMenuOptionBuilder().setLabel("None").setValue("None"),
        ];
        availableTags.forEach((tag) => {
            option.push(new StringSelectMenuOptionBuilder().setLabel(tag.name).setValue(tag.id));
        });
        const select = new StringSelectMenuBuilder()
            .setCustomId("starter")
            .setPlaceholder("Select a tag to look for")
            .addOptions(option);
        const row = new ActionRowBuilder().addComponents(select);
        const reply = await interaction.reply({
            content: "Choose your tag!",
            components: [row],
        });
    }
    // Handle the askGPT command
    if (interaction.commandName === "askglific") {
        // Join the arguments to form the user's question
        const question = interaction.options.get("question")?.value?.toString();
        if (question) {
            interaction.reply({
                content: `Your question **${question}** is getting processed...`,
                ephemeral: false,
            });
            const answer = await getAnswerFromOpenAIAssistant(question, "");
            await interaction.followUp(answer);
        }
        else {
            interaction.reply("Unable to answer the query");
        }
    }
    if (interaction.commandName === "post") {
        // Join the arguments to form the user's question
        const linkOfPost = interaction.options.get("link")?.value?.toString();
        const role = interaction.guild &&
            interaction.guild.roles.cache.find((role) => role.name === "Glific Team");
        const roleName = role ? role.toString() : "team";
        if (linkOfPost) {
            const messagesArray = [
                `${roleName}, just a quick heads up! It would be awesome if you could hop onto LinkedIn and give a like, share, and comment on our latest post. Here's our latest post: ${linkOfPost} It'll help us reach a wider audience. Thanks a bunch! 🚀`,
                `Hey ${roleName}, Show some love on LinkedIn by engaging with our latest post. Every like, share, and comment helps! Here's our latest post: ${linkOfPost}`,
                `Quick favor, ${roleName}! Could you support our LinkedIn efforts by liking, sharing, and commenting on our recent post? Here's our latest post: ${linkOfPost}`,
                `Hi ${roleName}, we could use your help in spreading the word on LinkedIn. Please give our latest post a thumbs up, share, and drop a comment if you can! Here's our latest post: ${linkOfPost}`,
                `${roleName}, let's give our LinkedIn post a little boost! Can you all like, share, and comment to help increase its visibility? Here's our latest post: ${linkOfPost}`,
                `Hey ${roleName}, hoping you can lend a hand in amplifying our LinkedIn presence. Please engage with our recent post by liking, sharing, and commenting! Here's our latest post: ${linkOfPost}`,
                `Quick request, ${roleName}! Could you take a moment to engage with our LinkedIn post? Likes, shares, and comments all appreciated! Here's our latest post: ${linkOfPost}`,
                `Hey there, ${roleName}! Looking to increase our LinkedIn reach. Could you support by liking, sharing, and commenting on our latest post? Here's our latest post: ${linkOfPost}`,
                `${roleName}, let's work together to boost our LinkedIn visibility! Please engage with our recent post by liking, sharing, and commenting. Here's our latest post: ${linkOfPost}`,
                `Hi ${roleName}, aiming to make a bigger impact on LinkedIn. Would you mind giving our recent post some love with likes, shares, and comments? Here's our latest post: ${linkOfPost}`,
            ];
            const random = Math.floor(Math.random() * 11);
            interaction.reply({
                content: messagesArray[random],
                ephemeral: false,
            });
        }
        else {
            interaction.reply("Unable to answer the query");
        }
    }
});
client.on("ready", async () => {
    registerCommand();
    setLogs("Bot is ready");
});
client.login(process.env.BOT_TOKEN);
client.on("threadCreate", async (thread) => {
    if (thread.parent?.type === ChannelType.GuildForum &&
        thread.parentId === process.env.CHANNEL_ID) {
        const firstMessage = await thread.fetchStarterMessage();
        const threadId = thread.id;
        const title = thread.name;
        const message = firstMessage?.content ?? "";
        const author = firstMessage?.author.username ?? "";
        thread.sendTyping();
        const answer = await getAnswerFromOpenAIAssistant(message, "");
        const role = thread.guild.roles.cache.find((role) => role.name === "Glific Support");
        thread.send(answer);
        thread.send(role?.toString() +
            " team please check if this needs any further attention.");
        let values = [
            [
                threadId,
                dayjs().format("YYYY-MM-DD HH:MM"),
                author,
                title,
                message,
                "", //tags
                "", //First Response
                "", //Response time
                "", //Closed at
                "", //Closure Time,
                answer,
            ],
        ];
        await writeToSheets(values);
    }
});
client.on("threadUpdate", async (oldThread, newThread) => {
    if (newThread.parent?.type === ChannelType.GuildForum &&
        newThread.parentId === process.env.CHANNEL_ID) {
        let closureTime = "";
        let closedAt = "";
        const oldTags = oldThread.appliedTags;
        const newTags = newThread.appliedTags;
        const addedTags = newTags.filter((tag) => !oldTags.includes(tag));
        const removedTags = oldTags.filter((tag) => !newTags.includes(tag));
        const createdTimestamp = newThread._createdTimestamp;
        const threadId = newThread.id;
        const appliedTagsIds = newThread.appliedTags;
        const appliedTagsNames = appliedTagsIds
            .map((id) => tagIds.find((tag) => tag.id === id)?.name)
            .filter(Boolean);
        const closed = addedTags.includes("1044545382782349393");
        if (closed) {
            closureTime = dayjs().diff(createdTimestamp, "minute").toString();
            closedAt = dayjs().format("YYYY-MM-DD HH:MM");
        }
        if (removedTags.includes("1044545382782349393")) {
            closureTime = "";
            closedAt = "";
        }
        let values = {
            "Closure Time": closureTime,
            Tags: appliedTagsNames.join(", "),
            "Closed at": closedAt,
        };
        if (oldTags.length === 0 && newTags.length > 0) {
            values = {
                ...values,
                "First Response": dayjs().format("YYYY-MM-DD HH:MM"),
                "Response time": dayjs().diff(createdTimestamp, "minute").toString(),
            };
        }
        await updateSheets(threadId, values);
    }
});
