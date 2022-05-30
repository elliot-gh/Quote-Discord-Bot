import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, Intents, Client, ModalSubmitInteraction, Modal, TextInputComponent, MessageActionRow, ModalActionRowComponent, MessageEmbed, Message } from "discord.js";
import { BotInterface } from "../../BotInterface";
import { readYamlConfig } from "../../ConfigUtils";
import { QuoteConfig } from "./QuoteConfig";
import { MongoQuote } from "./MongoQuote";

export class QuoteBot implements BotInterface {
    private static readonly SUBCMD_GET = "get";
    private static readonly SUBCMD_GET_OPT = "name";
    private static readonly SUBCMD_CREATE = "create";
    private static readonly CREATE_MODAL = "createModal";
    private static readonly CREATE_MODAL_NAME = "nameInput";
    private static readonly CREATE_MODAL_QUOTE = "quoteInput";
    private static readonly NAME_MAX_CHARS = 100;
    private static readonly QUOTE_MAX_CHARS = 1500;
    private static readonly SUBCMD_DEL = "delete";
    private static readonly SUBCMD_DEL_OPT = "name";
    private static readonly SUBCMD_LIST = "list";

    private static mongoInit = false;
    private static config: QuoteConfig;

    intents: number[];
    slashCommands: [SlashCommandBuilder];

    private slashQuote: SlashCommandBuilder;

    constructor() {
        this.intents = [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES];
        this.slashQuote = new SlashCommandBuilder()
            .setName("quote")
            .setDescription("Create, get, or list saved quotes.")
            .addSubcommand(subcommand =>
                subcommand
                    .setName(QuoteBot.SUBCMD_CREATE)
                    .setDescription("Creates a quote.")
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName(QuoteBot.SUBCMD_GET)
                    .setDescription("Gets a quote.")
                    .addStringOption(option =>
                        option
                            .setName(QuoteBot.SUBCMD_GET_OPT)
                            .setDescription("The name of the quote to get.")
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName(QuoteBot.SUBCMD_DEL)
                    .setDescription("Deletes a quote.")
                    .addStringOption(option =>
                        option
                            .setName(QuoteBot.SUBCMD_DEL_OPT)
                            .setDescription("The name of the quote to delete.")
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName(QuoteBot.SUBCMD_LIST)
                    .setDescription("Lists all quote names.")
            ) as SlashCommandBuilder;
        this.slashCommands = [this.slashQuote];
    }

    async processSlashCommand(interaction: CommandInteraction): Promise<void> {
        console.log(`[QuoteBot]: Got interaction: ${interaction}`);
        try {
            switch(interaction.options.getSubcommand()) {
                case QuoteBot.SUBCMD_CREATE:
                    await this.handleSlashCreate(interaction);
                    break;
                case QuoteBot.SUBCMD_GET:
                    await this.handleSlashGet(interaction);
                    break;
                case QuoteBot.SUBCMD_DEL:
                    await this.handleSlashDelete(interaction);
                    break;
                case QuoteBot.SUBCMD_LIST:
                    await this.handleSlashList(interaction);
                    break;
            }
        } catch (error) {
            console.error(`[QuoteBot] Uncaught error in processSlashComand(): ${error}`);
        }
    }

    async useClient(client: Client): Promise<void> {
        client.on("interactionCreate", async (interaction) => {
            if (interaction.user.id === client.user?.id) {
                return;
            }

            if (interaction.isModalSubmit()) {
                console.log(`[QuoteBot] Got modal submission: ${interaction}`);
                await this.handleCreateModalSubmit(interaction);
            }
        });

        if (QuoteBot.config.getNoPrefix) {
            client.on("messageCreate", async (message) => {
                if (message.author.id === client.user?.id) {
                    return;
                }

                await this.handleGetNoPrefix(message);
            });
        }
    }

    async handleSlashCreate(interaction: CommandInteraction): Promise<void> {
        const modal = new Modal()
            .setCustomId(QuoteBot.CREATE_MODAL)
            .setTitle("Create a Quote");
        const nameInput = new TextInputComponent()
            .setCustomId(QuoteBot.CREATE_MODAL_NAME)
            .setLabel("Name of the quote. Cannot contain spaces:")
            .setStyle("SHORT")
            .setMinLength(1)
            .setMaxLength(QuoteBot.NAME_MAX_CHARS);
        const quoteInput = new TextInputComponent()
            .setCustomId(QuoteBot.CREATE_MODAL_QUOTE)
            .setLabel("Quote text:")
            .setStyle("PARAGRAPH")
            .setMinLength(1)
            .setMaxLength(QuoteBot.QUOTE_MAX_CHARS);
        const firstActionRow = new MessageActionRow<ModalActionRowComponent>().addComponents(nameInput);
        const secondActionRow = new MessageActionRow<ModalActionRowComponent>().addComponents(quoteInput);
        modal.addComponents(firstActionRow, secondActionRow);

        await interaction.showModal(modal);
    }

    async handleSlashGet(interaction: CommandInteraction): Promise<void> {
        const name = interaction.options.getString(QuoteBot.SUBCMD_DEL_OPT, true).trim();
        console.log(`[QuoteBot] Got get command for name ${name}`);

        const validName = QuoteBot.validateName(name);
        if (validName !== null) {
            await this.sendErrorMessage(interaction, validName);
            return;
        }

        try {
            await interaction.deferReply();
            const quote = await MongoQuote.getQuote(interaction.guildId!, name, QuoteBot.config.caseSensitive);
            if (quote === null) {
                await this.sendErrorMessage(interaction, `Could not get quote with name \`${name}\`. It does not exist.`);
                return;
            }

            await interaction.editReply(quote);
        } catch (error) {
            console.error(`[QuoteBot] Error while getting quote with name ${name}: ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    async handleSlashDelete(interaction: CommandInteraction): Promise<void> {
        const name = interaction.options.getString(QuoteBot.SUBCMD_DEL_OPT, true).trim();
        console.log(`[QuoteBot] Got delete command for name ${name}`);

        const validName = QuoteBot.validateName(name);
        if (validName !== null) {
            await this.sendErrorMessage(interaction, validName);
            return;
        }

        try {
            await interaction.deferReply();
            const deleted = await MongoQuote.deleteQuote(interaction.guildId!, name, QuoteBot.config.caseSensitive);
            if (!deleted) {
                await this.sendErrorMessage(interaction, `Could not delete quote with name \`${name}\`. It does not exist.`);
                return;
            }

            await interaction.editReply({ embeds: [
                new MessageEmbed()
                    .setTitle("Success")
                    .setDescription(`Deleted quote with name \`${name}\`.`)
                    .setColor(0x00FF00)
            ]});
        } catch (error) {
            console.error(`[QuoteBot] Error while deleting quote with name ${name}: ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    async handleSlashList(intercation: CommandInteraction): Promise<void> {
        throw new Error("not implemented");
    }

    async handleCreateModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
        if (interaction.customId !== QuoteBot.CREATE_MODAL) {
            return;
        }

        const name = interaction.fields.getTextInputValue(QuoteBot.CREATE_MODAL_NAME).trim();
        const quote = interaction.fields.getTextInputValue(QuoteBot.CREATE_MODAL_QUOTE).trimEnd();
        console.log(`[QuoteBot] Got create modal submission with quote name ${name} and quote ${quote}`);

        try {
            const nameValid = QuoteBot.validateName(name);
            if (nameValid !== null) {
                console.error(`[QuoteBot] Quote name ${name} failed validation: ${nameValid}`);
                await this.sendErrorMessage(interaction, nameValid);
                return;
            }

            const quoteValid = QuoteBot.validateQuote(quote);
            if (quoteValid !== null) {
                console.error(`[QuoteBot] Quote ${quote} failed validation: ${quoteValid}`);
                await this.sendErrorMessage(interaction, quoteValid);
                return;
            }

            await interaction.deferReply();
            await MongoQuote.createQuote(interaction.guildId!, name, quote, QuoteBot.config.caseSensitive);

            await interaction.editReply({ embeds: [
                new MessageEmbed()
                    .setTitle("Success")
                    .setDescription(`Created quote with name \`${name}\`.`)
                    .setColor(0x00FF00)
            ]});
        } catch (error) {
            console.error(`[QuoteBot] Error while creating quote with name ${name} and quote ${quote}: ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    async handleGetNoPrefix(message: Message): Promise<void> {
        const content = message.content.trim();
        try {
            if (content.includes(" ")) {
                return;
            }

            const quote = await MongoQuote.getQuote(message.guildId!, content, QuoteBot.config.caseSensitive);
            if (quote === null) {
                return;
            }

            console.log(`[QuoteBote] Got one word quote with name ${content}:\n\t${quote}`);
            await message.channel.send(quote);
        } catch (error) {
            console.error(`[QuoteBot] Error in handleGetNoPrefix() with message ${content}:\n${error}`);
        }
    }

    async init(): Promise<string | null> {
        if (QuoteBot.mongoInit) {
            return null;
        }

        const configPath = join(dirname(fileURLToPath(import.meta.url)), "config.yaml");
        try {
            QuoteBot.config = await readYamlConfig<QuoteConfig>(configPath);
            await MongoQuote.init(QuoteBot.config);
        } catch (error) {
            const errMsg = `[ColorMeBot] Unable to read config: ${error}`;
            console.error(errMsg);
            return errMsg;
        }

        return null;
    }

    static validateName(name: string): string | null {
        if (name.includes(" ")) {
            return "Name has a space in it. Spaces are not allowed in quote names.";
        } else if (name.length < 1 || name.length > QuoteBot.NAME_MAX_CHARS) {
            return `Name is too long. Names must be between 1 and ${QuoteBot.NAME_MAX_CHARS} characters.`;
        }

        return null;
    }

    static validateQuote(quote: string): string | null {
        if (quote.length < 1 || quote.length > QuoteBot.QUOTE_MAX_CHARS) {
            return `Quote is too long. Quotes msut be between 1 and ${QuoteBot.NAME_MAX_CHARS} characters.`;
        }

        return null;
    }

    /**
     * Replies to the interaction with an error message. Tries to figure out what to print.
     * @param interaction The discord.js CommandInteraction
     * @param error The error. Could be typeof Error, string, or null.
     */
    async sendErrorMessage(interaction: CommandInteraction | ModalSubmitInteraction, error: unknown = null): Promise<void> {
        let description = "";
        if (error instanceof Error) {
            description = error.message;
        } else if (typeof error === "string") {
            description = error;
        }

        if (interaction.deferred) {
            await interaction.editReply({ embeds: [
                new MessageEmbed()
                    .setTitle("Error")
                    .setDescription(description)
                    .setColor(0xFF0000)
            ]});
            return;
        }

        await interaction.reply({ embeds: [
            new MessageEmbed()
                .setTitle("Error")
                .setDescription(description)
                .setColor(0xFF0000)
        ]});
    }
}
