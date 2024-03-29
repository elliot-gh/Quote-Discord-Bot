/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, Client, ModalSubmitInteraction, Message, ButtonInteraction, MessageComponentInteraction,
    GatewayIntentBits, ChatInputCommandInteraction, EmbedBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
    StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder, MessageEditOptions } from "discord.js";
import { QuoteConfig } from "./QuoteConfig";
import { MongoQuote, QuotePage } from "./MongoQuote";
import { BotWithConfig } from "../../BotWithConfig";
import { BotInterface } from "../../BotInterface";

type ListStringObject = {
    currentPage: number,
    maxPages: number
}

export class QuoteBot extends BotWithConfig implements BotInterface {
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
    private static readonly LIST_PER_PAGE = 10;
    private static readonly LIST_BTN_PREV = "btnPrev";
    private static readonly LIST_BTN_NEXT = "btnNext";
    private static readonly LIST_SLCT_MENU_PAGE = "selectPage";

    private static mongoInit = false;
    private readonly config: QuoteConfig;

    intents: GatewayIntentBits[];
    commands: [SlashCommandBuilder];

    private slashQuote: SlashCommandBuilder;

    constructor() {
        super("QuoteBot", import.meta);
        this.config = this.readYamlConfig<QuoteConfig>("config.yaml");
        this.intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
        this.slashQuote = new SlashCommandBuilder()
            .setName("quote")
            .setDescription("Create, get, or list saved quotes.")
            .setDMPermission(false)
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
        this.commands = [this.slashQuote];
    }

    async processCommand(interaction: CommandInteraction): Promise<void> {
        if (!interaction.isChatInputCommand()) {
            return;
        }

        this.logger.info(`Got interaction: ${interaction}`);
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
            this.logger.error(`Uncaught error in processSlashComand(): ${error}`);
        }
    }

    async useClient(client: Client): Promise<void> {
        client.on("interactionCreate", async (interaction) => {
            if (interaction.user.id === client.user?.id) {
                return;
            }

            if (interaction.isModalSubmit()) {
                this.logger.info(`Got modal submission: ${interaction.customId}`);
                await this.handleCreateModalSubmit(interaction);
            }

            if (interaction.isButton()) {
                this.logger.info(`Got button click: ${interaction.customId}`);
                await this.handleButtonClick(interaction);
            }

            if (interaction.isStringSelectMenu()) {
                this.logger.info(`Got select menu interaction: ${interaction.customId}`);
                await this.handleSelectMenu(interaction);
            }
        });

        if (this.config.getNoPrefix) {
            client.on("messageCreate", async (message) => {
                if (message.author.id === client.user?.id) {
                    return;
                }

                await this.handleGetNoPrefix(message);
            });
        }
    }

    private async handleSlashCreate(interaction: ChatInputCommandInteraction): Promise<void> {
        const modal = new ModalBuilder()
            .setCustomId(QuoteBot.CREATE_MODAL)
            .setTitle("Create a Quote");
        const nameInput = new TextInputBuilder()
            .setCustomId(QuoteBot.CREATE_MODAL_NAME)
            .setLabel("Name of the quote. Cannot contain spaces:")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(QuoteBot.NAME_MAX_CHARS);
        const quoteInput = new TextInputBuilder()
            .setCustomId(QuoteBot.CREATE_MODAL_QUOTE)
            .setLabel("Quote text:")
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(1)
            .setMaxLength(QuoteBot.QUOTE_MAX_CHARS);
        const firstActionRow = new ActionRowBuilder().addComponents(nameInput) as ActionRowBuilder<TextInputBuilder>;
        const secondActionRow = new ActionRowBuilder().addComponents(quoteInput) as ActionRowBuilder<TextInputBuilder>;
        modal.addComponents(firstActionRow, secondActionRow);

        await interaction.showModal(modal);
    }

    private async handleSlashGet(interaction: ChatInputCommandInteraction): Promise<void> {
        const name = interaction.options.getString(QuoteBot.SUBCMD_DEL_OPT, true).trim();
        this.logger.info(`Got get command for name ${name}`);

        const validName = QuoteBot.validateName(name);
        if (validName !== null) {
            await this.sendErrorMessage(interaction, validName);
            return;
        }

        try {
            await interaction.deferReply();
            const quote = await MongoQuote.getQuote(interaction.guildId!, name, this.config.caseSensitive);
            if (quote === null) {
                await this.sendErrorMessage(interaction, `Could not get quote with name \`${name}\`. It does not exist.`);
                return;
            }

            await interaction.editReply(quote);
        } catch (error) {
            this.logger.error(`Error while getting quote with name ${name}: ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    private async handleSlashDelete(interaction: ChatInputCommandInteraction): Promise<void> {
        const name = interaction.options.getString(QuoteBot.SUBCMD_DEL_OPT, true).trim();
        this.logger.info(`Got delete command for name ${name}`);

        const validName = QuoteBot.validateName(name);
        if (validName !== null) {
            await this.sendErrorMessage(interaction, validName);
            return;
        }

        try {
            await interaction.deferReply();
            const deleted = await MongoQuote.deleteQuote(interaction.guildId!, name, this.config.caseSensitive);
            if (!deleted) {
                await this.sendErrorMessage(interaction, `Could not delete quote with name \`${name}\`. It does not exist.`);
                return;
            }

            await interaction.editReply({ embeds: [
                new EmbedBuilder()
                    .setTitle("Success")
                    .setDescription(`Deleted quote with name \`${name}\`.`)
                    .setColor(0x00FF00)
            ]});
        } catch (error) {
            this.logger.error(`Error while deleting quote with name ${name}: ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    private async handleSlashList(interaction: CommandInteraction): Promise<void> {
        this.logger.info("Got /quote list command");
        try {
            await interaction.deferReply();
            const replyObj = await QuoteBot.createListReply(interaction.guildId!, 0);

            await interaction.editReply(replyObj);
        } catch (error) {
            this.logger.error(`Error handling list command:\n${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    private async handleCreateModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
        if (interaction.customId !== QuoteBot.CREATE_MODAL) {
            return;
        }

        const name = interaction.fields.getTextInputValue(QuoteBot.CREATE_MODAL_NAME).trim();
        const quote = interaction.fields.getTextInputValue(QuoteBot.CREATE_MODAL_QUOTE).trimEnd();
        this.logger.info(`Got create modal submission with quote name ${name} and quote ${quote}`);

        try {
            const nameValid = QuoteBot.validateName(name);
            if (nameValid !== null) {
                this.logger.error(`Quote name ${name} failed validation: ${nameValid}`);
                await this.sendErrorMessage(interaction, nameValid);
                return;
            }

            const quoteValid = QuoteBot.validateQuote(quote);
            if (quoteValid !== null) {
                this.logger.error(`Quote ${quote} failed validation: ${quoteValid}`);
                await this.sendErrorMessage(interaction, quoteValid);
                return;
            }

            await interaction.deferReply();
            await MongoQuote.createQuote(interaction.guildId!, name, quote, this.config.caseSensitive);

            await interaction.editReply({ embeds: [
                new EmbedBuilder()
                    .setTitle("Success")
                    .setDescription(`Created quote with name \`${name}\`.`)
                    .setColor(0x00FF00)
            ]});
        } catch (error) {
            this.logger.error(`Error while creating quote with name ${name} and quote ${quote}: ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    private async handleButtonClick(interaction: ButtonInteraction): Promise<void> {
        const id = interaction.customId;
        if (id !== QuoteBot.LIST_BTN_PREV && id !== QuoteBot.LIST_BTN_NEXT) {
            return;
        }

        try {
            await interaction.deferUpdate();

            const title = interaction.message.embeds[0].title;
            const listObj = QuoteBot.deserializeListString(title!);

            let newPage;
            if (id === QuoteBot.LIST_BTN_NEXT) {
                newPage = listObj.currentPage + 1;
            } else {
                newPage = listObj.currentPage - 1;
            }

            await this.goToPage(interaction, newPage);
        } catch (error) {
            this.logger.error(`Error in handleButtonClick(): ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    private async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
        const id = interaction.customId;
        if (id !== QuoteBot.LIST_SLCT_MENU_PAGE) {
            return;
        }

        try {
            await interaction.deferUpdate();

            const value = interaction.values[0];
            const newPage = parseInt(value);

            await this.goToPage(interaction, newPage);
        } catch (error) {
            this.logger.error(`Error in handleSelectMenu(): ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    private async goToPage(interaction: ButtonInteraction | StringSelectMenuInteraction, newPage: number): Promise<void> {
        const guildId = interaction.guildId!;
        const maxPages = await MongoQuote.getMaxPages(guildId, QuoteBot.LIST_PER_PAGE);

        if (newPage < 0) {
            this.logger.error(`Got newPage ${newPage}, setting to 0.`);
            newPage = 0;
        } else if (newPage >= maxPages) {
            this.logger.error(`Got newPage ${newPage} over maxPages ${maxPages}, setting to maxPages.`);
            newPage = maxPages - 1;
        }

        const replyObj = await QuoteBot.createListReply(guildId, newPage);
        await interaction.editReply(replyObj);
    }

    private async handleGetNoPrefix(message: Message): Promise<void> {
        const content = message.content.trim();
        try {
            if (content.includes(" ")) {
                return;
            }

            const quote = await MongoQuote.getQuote(message.guildId!, content, this.config.caseSensitive);
            if (quote === null) {
                return;
            }

            this.logger.info(`Got one word quote with name ${content}:\n\t${quote}`);
            await message.channel.send(quote);
        } catch (error) {
            this.logger.error(`Error in handleGetNoPrefix() with message ${content}:\n${error}`);
        }
    }

    async preInit(): Promise<string | null> {
        if (QuoteBot.mongoInit) {
            return null;
        }

        try {
            await MongoQuote.init(this.config);
        } catch (error) {
            const errMsg = `Unable to read config: ${error}`;
            this.logger.error(errMsg);
            return errMsg;
        }

        return null;
    }

    private static validateName(name: string): string | null {
        if (name.includes(" ")) {
            return "Name has a space in it. Spaces are not allowed in quote names.";
        } else if (name.length < 1 || name.length > QuoteBot.NAME_MAX_CHARS) {
            return `Name is too long. Names must be between 1 and ${QuoteBot.NAME_MAX_CHARS} characters.`;
        }

        return null;
    }

    private static validateQuote(quote: string): string | null {
        if (quote.length < 1 || quote.length > QuoteBot.QUOTE_MAX_CHARS) {
            return `Quote is too long. Quotes msut be between 1 and ${QuoteBot.NAME_MAX_CHARS} characters.`;
        }

        return null;
    }

    private static serializeListString(obj: ListStringObject): string {
        return `Page ${obj.currentPage + 1} of ${obj.maxPages}`;
    }

    private static deserializeListString(str: string): ListStringObject {
        const currentPageStr = str.substring(5, str.indexOf(" of "));
        const maxPageStr = str.substring(str.indexOf("f ") + 2);
        return {
            currentPage: parseInt(currentPageStr) - 1,
            maxPages: parseInt(maxPageStr)
        };
    }

    private static createButtonNext(): ButtonBuilder {
        return new ButtonBuilder()
            .setCustomId(QuoteBot.LIST_BTN_NEXT)
            .setLabel("Next Page")
            .setStyle(ButtonStyle.Primary);
    }

    private static createButtonBack(): ButtonBuilder {
        return new ButtonBuilder()
            .setCustomId(QuoteBot.LIST_BTN_PREV)
            .setLabel("Previous Page")
            .setStyle(ButtonStyle.Primary);
    }

    private static createPageSelect(listObj: ListStringObject): StringSelectMenuBuilder {
        const options: StringSelectMenuOptionBuilder[] = [];
        for (let pageNum = 0; pageNum < listObj.maxPages; pageNum++) {
            options.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`Page ${pageNum + 1}`)
                    .setValue(pageNum.toString())
                    .setDefault(pageNum === listObj.currentPage)
            );
        }

        return new StringSelectMenuBuilder()
            .setCustomId(QuoteBot.LIST_SLCT_MENU_PAGE)
            .setPlaceholder(`Page ${listObj.currentPage + 1}`)
            .addOptions(options);
    }

    private static createListEmbed(page: QuotePage, listObj: ListStringObject): EmbedBuilder {
        let nameList = "";
        page.names.forEach(name => nameList += `• ${name}\n`);

        return new EmbedBuilder()
            .setTitle(QuoteBot.serializeListString(listObj))
            .setColor(0x8C8F91)
            .setDescription(nameList);
    }

    private static async createListReply(guildId: string, currentPage: number): Promise<MessageEditOptions> {
        const quoteCount = await MongoQuote.getQuoteCount(guildId);
        if (quoteCount === 0) {
            return {
                embeds: [new EmbedBuilder()
                    .setTitle("Error")
                    .setDescription("No quotes exist in this server.")
                    .setColor(0xFF0000)]
            };
        }

        const maxPages = await MongoQuote.getMaxPages(guildId, QuoteBot.LIST_PER_PAGE);
        const page = await MongoQuote.getQuotePage(guildId, currentPage, QuoteBot.LIST_PER_PAGE);
        const listObj: ListStringObject = {
            currentPage: currentPage,
            maxPages: maxPages
        };

        const embed = QuoteBot.createListEmbed(page, listObj);
        const btnPrev = QuoteBot.createButtonBack().setDisabled(listObj.currentPage <= 0);
        const btnNext = QuoteBot.createButtonNext().setDisabled(listObj.currentPage + 1 >= maxPages);
        const pageSelect = QuoteBot.createPageSelect(listObj);
        const rowSelect = new ActionRowBuilder().addComponents(pageSelect) as ActionRowBuilder<StringSelectMenuBuilder>;
        const rowBtns = new ActionRowBuilder().addComponents(btnPrev, btnNext) as ActionRowBuilder<ButtonBuilder>;
        return {
            embeds: [embed],
            components: [rowSelect, rowBtns]
        };
    }

    /**
     * Replies to the interaction with an error message. Tries to figure out what to print.
     * @param interaction The discord.js CommandInteraction
     * @param error The error. Could be typeof Error, string, or null.
     */
    private async sendErrorMessage(interaction: CommandInteraction | MessageComponentInteraction | ModalSubmitInteraction, error: unknown = null): Promise<void> {
        let description = "";
        if (error instanceof Error) {
            description = error.message;
        } else if (typeof error === "string") {
            description = error;
        }

        if (interaction.deferred) {
            await interaction.editReply({ embeds: [
                new EmbedBuilder()
                    .setTitle("Error")
                    .setDescription(description)
                    .setColor(0xFF0000)
            ]});
            return;
        }

        await interaction.reply({ embeds: [
            new EmbedBuilder()
                .setTitle("Error")
                .setDescription(description)
                .setColor(0xFF0000)
        ]});
    }

    getIntents(): GatewayIntentBits[] {
        return this.intents;
    }

    getSlashCommands(): (SlashCommandBuilder)[] {
        return this.commands;
    }
}
