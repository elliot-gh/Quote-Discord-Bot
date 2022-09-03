import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, Client, ModalSubmitInteraction, Message, ButtonInteraction, MessageComponentInteraction,
    SelectMenuInteraction, WebhookEditMessageOptions, GatewayIntentBits, ChatInputCommandInteraction, EmbedBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, SelectMenuBuilder, SelectMenuOptionBuilder } from "discord.js";
import { BotInterface } from "../../BotInterface";
import { readYamlConfig } from "../../ConfigUtils";
import { QuoteConfig } from "./QuoteConfig";
import { MongoQuote, QuotePage } from "./MongoQuote";

type ListStringObject = {
    currentPage: number,
    maxPages: number
}

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
    private static readonly LIST_PER_PAGE = 10;
    private static readonly LIST_BTN_PREV = "btnPrev";
    private static readonly LIST_BTN_NEXT = "btnNext";
    private static readonly LIST_SLCT_MENU_PAGE = "selectPage";

    private static mongoInit = false;
    private static config: QuoteConfig;

    intents: GatewayIntentBits[];
    commands: [SlashCommandBuilder];

    private slashQuote: SlashCommandBuilder;

    constructor() {
        this.intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
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
        this.commands = [this.slashQuote];
    }

    async processCommand(interaction: CommandInteraction): Promise<void> {
        if (!interaction.isChatInputCommand()) {
            return;
        }

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
                console.log(`[QuoteBot] Got modal submission: ${interaction.customId}`);
                await this.handleCreateModalSubmit(interaction);
            }

            if (interaction.isButton()) {
                console.log(`[QuoteBot] Got button click: ${interaction.customId}`);
                await this.handleButtonClick(interaction);
            }

            if (interaction.isSelectMenu()) {
                console.log(`[QuoteBot] Got select menu interaction: ${interaction.customId}`);
                await this.handleSelectMenu(interaction);
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

    async handleSlashCreate(interaction: ChatInputCommandInteraction): Promise<void> {
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

    async handleSlashGet(interaction: ChatInputCommandInteraction): Promise<void> {
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

    async handleSlashDelete(interaction: ChatInputCommandInteraction): Promise<void> {
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
                new EmbedBuilder()
                    .setTitle("Success")
                    .setDescription(`Deleted quote with name \`${name}\`.`)
                    .setColor(0x00FF00)
            ]});
        } catch (error) {
            console.error(`[QuoteBot] Error while deleting quote with name ${name}: ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    async handleSlashList(interaction: CommandInteraction): Promise<void> {
        console.log("[QuoteBot] Got /quote list command");
        try {
            await interaction.deferReply();
            const replyObj = await QuoteBot.createListReply(interaction.guildId!, 0);

            await interaction.editReply(replyObj);
        } catch (error) {
            console.error(`[QuoteBot] Error handling list command:\n${error}`);
            await this.sendErrorMessage(interaction, error);
        }
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
                new EmbedBuilder()
                    .setTitle("Success")
                    .setDescription(`Created quote with name \`${name}\`.`)
                    .setColor(0x00FF00)
            ]});
        } catch (error) {
            console.error(`[QuoteBot] Error while creating quote with name ${name} and quote ${quote}: ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    async handleButtonClick(interaction: ButtonInteraction): Promise<void> {
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
            console.error(`[QuoteBot] Error in handleButtonClick(): ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    async handleSelectMenu(interaction: SelectMenuInteraction): Promise<void> {
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
            console.error(`[QuoteBot] Error in handleSelectMenu(): ${error}`);
            await this.sendErrorMessage(interaction, error);
        }
    }

    async goToPage(interaction: ButtonInteraction | SelectMenuInteraction, newPage: number): Promise<void> {
        const guildId = interaction.guildId!;
        const maxPages = await MongoQuote.getMaxPages(guildId, QuoteBot.LIST_PER_PAGE);

        if (newPage < 0) {
            console.error(`[QuoteBot] Got newPage ${newPage}, setting to 0.`);
            newPage = 0;
        } else if (newPage >= maxPages) {
            console.error(`[QuoteBot] Got newPage ${newPage} over maxPages ${maxPages}, setting to maxPages.`);
            newPage = maxPages - 1;
        }

        const replyObj = await QuoteBot.createListReply(guildId, newPage);
        await interaction.editReply(replyObj);
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

            console.log(`[QuoteBot] Got one word quote with name ${content}:\n\t${quote}`);
            await message.channel.send(quote);
        } catch (error) {
            console.error(`[QuoteBot] Error in handleGetNoPrefix() with message ${content}:\n${error}`);
        }
    }

    async init(): Promise<string | null> {
        if (QuoteBot.mongoInit) {
            return null;
        }

        try {
            QuoteBot.config = await readYamlConfig<QuoteConfig>(import.meta, "config.yaml");
            await MongoQuote.init(QuoteBot.config);
        } catch (error) {
            const errMsg = `[QuoteBot] Unable to read config: ${error}`;
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

    static serializeListString(obj: ListStringObject): string {
        return `Page ${obj.currentPage + 1} of ${obj.maxPages}`;
    }

    static deserializeListString(str: string): ListStringObject {
        const currentPageStr = str.substring(5, str.indexOf(" of "));
        const maxPageStr = str.substring(str.indexOf("f ") + 2);
        return {
            currentPage: parseInt(currentPageStr) - 1,
            maxPages: parseInt(maxPageStr)
        };
    }

    static createButtonNext(): ButtonBuilder {
        return new ButtonBuilder()
            .setCustomId(QuoteBot.LIST_BTN_NEXT)
            .setLabel("Next Page")
            .setStyle(ButtonStyle.Primary);
    }

    static createButtonBack(): ButtonBuilder {
        return new ButtonBuilder()
            .setCustomId(QuoteBot.LIST_BTN_PREV)
            .setLabel("Previous Page")
            .setStyle(ButtonStyle.Primary);
    }

    static createPageSelect(listObj: ListStringObject): SelectMenuBuilder {
        const options: SelectMenuOptionBuilder[] = [];
        for (let pageNum = 0; pageNum < listObj.maxPages; pageNum++) {
            if (pageNum === listObj.currentPage) {
                continue;
            }

            options.push(
                new SelectMenuOptionBuilder()
                    .setLabel(`Page ${pageNum + 1}`)
                    .setValue(pageNum.toString())
            );
        }

        return new SelectMenuBuilder()
            .setCustomId(QuoteBot.LIST_SLCT_MENU_PAGE)
            .setPlaceholder(`Page ${listObj.currentPage + 1}`)
            .addOptions(options);
    }

    static createListEmbed(page: QuotePage, listObj: ListStringObject): EmbedBuilder {
        let nameList = "";
        page.names.forEach(name => nameList += `• ${name}\n`);

        return new EmbedBuilder()
            .setTitle(QuoteBot.serializeListString(listObj))
            .setColor(0x8C8F91)
            .setDescription(nameList);
    }

    static async createListReply(guildId: string, currentPage: number): Promise<WebhookEditMessageOptions> {
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
        const rowSelect = new ActionRowBuilder().addComponents(pageSelect) as ActionRowBuilder<SelectMenuBuilder>;
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
    async sendErrorMessage(interaction: CommandInteraction | MessageComponentInteraction | ModalSubmitInteraction, error: unknown = null): Promise<void> {
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
}
