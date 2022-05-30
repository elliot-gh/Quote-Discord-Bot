import { format } from "node:util";
import mongoose, { Connection, FilterQuery } from "mongoose";
const { Schema } = mongoose;
import { QuoteConfig } from "./QuoteConfig";

interface IQuote {
    name: string,
    quote: string
}

/**
 * Singleton responsible for working with MongoDB and quotes.
 */
export class MongoQuote {
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
        return quote !== null ? quote.quote : null;
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
     * Init this class.
     * @param config The QuoteConfig object containing mongodb connection details.
     */
    static async init(config: QuoteConfig): Promise<void> {
        try {
            if (this.ready) {
                return;
            }

            console.log(`[MongoQuote] Trying to connect to MongoDB URL ${config.mongoDb.url}...`);
            const fullUrl = format(config.mongoDb.url,
                encodeURIComponent(config.mongoDb.user),
                encodeURIComponent(config.mongoDb.password));
            this.connection = await mongoose.createConnection(fullUrl, {
                dbName: config.mongoDb.name
            }).asPromise();

            await this.connection.db.admin().ping();
            console.log(`[MongoQuote] Connected to MongoDB URL ${config.mongoDb.url}.`);
            this.ready = true;
        } catch (error) {
            console.error(`[MongoQuote] Ran into error in getInstance(): ${error}`);
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
