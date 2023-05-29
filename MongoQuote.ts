import { format } from "node:util";
import mongoose, { Connection, FilterQuery } from "mongoose";
const { Schema } = mongoose;
import { QuoteConfig } from "./QuoteConfig";
import { createLogger } from "../../utils/Logger";

interface IQuote {
    name: string,
    quote: string
}

export type QuotePage = {
    currentPage: number,
    maxPages: number,
    names: string[]
}

/**
 * Singleton responsible for working with MongoDB and quotes.
 */
export class MongoQuote {
    private static readonly logger = createLogger("MongoQuote");
    private static connection: Connection;
    private static ready = false;
    private static readonly schema = new Schema({
        name: { type: String, required: true, unique: true },
        quote: { type: String, required: true }
    });

    /**
     * Gets a quote with name from guild.
     * @param guildId The Discord guild ID.
     * @param name The name of the quote to get.
     * @param caseSens Whether case sensitivity is enabled.
     * @returns Quote string if quote found, null if not.
     */
    static async getQuote(guildId: string, name: string, caseSens: boolean): Promise<string | null> {
        if (!this.ready) {
            throw new Error("MongoDB connection not ready.");
        }

        const guildQuotes = this.connection.model<IQuote>(guildId, MongoQuote.schema);
        const queryObj: FilterQuery<IQuote> = {
            name: name
        };
        if (!caseSens) {
            queryObj.name = {
                "$regex": this.sanitizeRegex(name),
                "$options": "i"
            };
        }

        const quote = await guildQuotes.findOne<IQuote>(queryObj);
        return quote?.quote ?? null;
    }

    /**
     * Creates a quote with name in a guild.
     * @param guildId The Discord guild ID.
     * @param name The name of the quote to create.
     * @param quote The content of the quote.
     * @param caseSens Whether case sensitivity is enabled.
     * @returns True if deleted, false if not.
     */
    static async createQuote(guildId: string, name: string, quote: string, caseSens: boolean): Promise<void> {
        if (!this.ready) {
            throw new Error("MongoDB connection not ready.");
        }

        const existingQuote = await this.getQuote(guildId, name, caseSens);
        if (existingQuote !== null) {
            throw new Error(`Quote with name ${name} already exists.`);
        }

        const guildQuotes = this.connection.model<IQuote>(guildId, MongoQuote.schema);
        const newQuote: IQuote = {
            name: name,
            quote: quote
        };

        await guildQuotes.create<IQuote>(newQuote);
    }

    /**
     * Deletes a quote with name from guild.
     * @param guildId The Discord guild ID.
     * @param name The name of the quote to delete.
     * @param caseSens Whether case sensitivity is enabled.
     * @returns True if deleted, false if not.
     */
    static async deleteQuote(guildId: string, name: string, caseSens: boolean): Promise<boolean> {
        if (!this.ready) {
            throw new Error("MongoDB connection not ready.");
        }

        const guildQuotes = this.connection.model<IQuote>(guildId, MongoQuote.schema);
        const queryObj: FilterQuery<IQuote> = {
            name: name
        };
        if (!caseSens) {
            queryObj.name = {
                "$regex": this.sanitizeRegex(name),
                "$options": "i"
            };
        }

        const result = await guildQuotes.deleteOne(queryObj);
        return result.deletedCount > 0;
    }

    /**
     * Gets a sorted list of quote names at the specified page number.
     * @param guildId The Discord guild ID
     * @param page The current page to get names of
     * @param perPage Amount of names per page
     * @returns The current page
     */
    static async getQuotePage(guildId: string, page: number, perPage: number): Promise<QuotePage> {
        if (!this.ready) {
            throw new Error("MongoDB connection not ready.");
        }

        const guildQuotes = this.connection.model<IQuote>(guildId, MongoQuote.schema);
        const skip = perPage * page;

        const maxPages = await this.getMaxPages(guildId, perPage);
        const quotes = await guildQuotes.find<IQuote>({})
            .select({ name: 1 })
            .sort({ name: "ascending" })
            .skip(skip)
            .limit(perPage);
        const names = quotes.map(quote => quote.name);

        return {
            currentPage: page,
            maxPages: maxPages,
            names: names
        };
    }

    /**
     * Gets the max pages.
     * @param guildId The Discord guild ID
     * @param perPage Amount of names per page
     * @returns The number of pages
     */
    static async getMaxPages(guildId: string, perPage: number): Promise<number> {
        if (!this.ready) {
            throw new Error("MongoDB connection not ready.");
        }

        const guildQuotes = this.connection.model<IQuote>(guildId, MongoQuote.schema);
        const count = await guildQuotes.count();
        const maxPages = Math.ceil(count / perPage);

        return maxPages;
    }

    /**
     * Gets the amount of quotes in a guild.
     * @param guildId discord.js guild id
     * @returns number of quotes
     */
    static async getQuoteCount(guildId: string): Promise<number> {
        if (!this.ready) {
            throw new Error("MongoDB connection not ready.");
        }

        const guildQuotes = this.connection.model<IQuote>(guildId, MongoQuote.schema);
        const count = await guildQuotes.count();

        return count;
    }

    /**
     * Init this class.
     * @param config The QuoteConfig object containing mongodb connection details.
     */
    static async init(config: QuoteConfig): Promise<void> {
        try {
            if (this.ready) {
                return;
            }

            this.logger.info(`Trying to connect to MongoDB URL ${config.mongoDb.url}...`);
            const fullUrl = format(config.mongoDb.url,
                encodeURIComponent(config.mongoDb.user),
                encodeURIComponent(config.mongoDb.password));
            this.connection = await mongoose.createConnection(fullUrl, {
                dbName: config.mongoDb.name
            }).asPromise();

            await this.connection.db.admin().ping();
            this.logger.info(`Connected to MongoDB URL ${config.mongoDb.url}.`);
            this.ready = true;
        } catch (error) {
            this.logger.error(`Ran into error in getInstance(): ${error}`);
            if (this.connection !== undefined) {
                await this.connection.close();
            }
            throw error;
        }
    }

    /**
     * Sanitizes regex from a string
     * @param message The string to sanitize
     * @returns The sanitized string
     */
    static sanitizeRegex(message: string): string {
        return `^${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
    }
}
