/*
 * File name: quote_bot.js
 * Description: Responsible for quote mechanics.
 */

const Discord = require('discord.js');
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const util = require('util');

// require() this and pass in the discord.js logged in client
module.exports = function(discordClient) {
  const CONSOLE_ERR_MONGODB_ENV = 'One or more .env MongoDB settings are not set!';
  const CONSOLE_ERR_MONGODB_CONNECT = 'Error connecting to MongoDB: ';
  const CONSOLE_ERR_DB = 'MongoDB connection not ready.';

  const CMD_FORMAT_TITLE = 'Invalid command format.';
  const CMD_FORMAT_DESC = 'The correct command format is %s';
  const QUOTE_ERR_UNKNOWN = 'An unknown error occurred: %s';
  const QUOTE_NOT_FOUND_DESC = 'Quote with name `%s` was not found.';

  const CMD_HELP = '!help';
  const HELP_TITLE = 'Help';

  const CMD_QUOTE = '!quote ';
  const QUOTE_GET_TITLE = '%s';
  const QUOTE_GET_ERROR = 'Quote could not be found.';
  const QUOTE_GET_HELP = '`!quote [name]`';

  const CMD_QUOTE_LIST = '!quotelist';
  const QUOTE_LIST_ERR = 'Quote list could not be retrieved.';
  const QUOTE_LIST_NONE = 'There are no quotes for this server.';
  const QUOTE_LIST_ENTRY = '• `%s`\n';
  const QUOTE_LIST_HEADER = 'Page %d of %d';
  const QUOTE_LIST_MAX_ENTRIES = 10;
  const QUOTE_LIST_HELP = '`!quotelist [name]`';
  const QUOTE_LIST_TIMEOUT = 20000; // 20 seconds
  const LEFT_EMOJI = '⬅';
  const RIGHT_EMOJI = '➡';

  const CMD_QUOTE_ADD = '!quoteadd ';
  const QUOTE_ADD_NAME_MAX_CHARS = 100;
  const QUOTE_ADD_NAME_MAX_CHARS_DESC = 'Please keep quote names under %d characters.';
  const QUOTE_ADD_TITLE = 'Quote was added.';
  const QUOTE_ADD_DESC = 'Quote with name `%s` was added.';
  const QUOTE_ADD_ERR = 'Quote could not be added.';
  const QUOTE_ADD_EXISTS_DESC = 'Quote with name `%s` already exists.';
  const QUOTE_ADD_HELP = '`!quoteadd [name] [content]`';

  const CMD_QUOTE_REMOVE = '!quoterm ';
  const QUOTE_RM_TITLE = 'Quote was removed.';
  const QUOTE_RM_DESC = 'Quote with name `%s` was removed.';
  const QUOTE_RM_ERR = 'Quote could not be removed.';
  const QUOTE_RM_NONE = 'Quote with name `%s` does not exist.';
  const QUOTE_RM_HELP = '`!quoterm [name]`';

  const NAME_CONTENT_DELIMITER = ' ';
  const COLOR_CMD = 0x8C8F91; // discord message grey
  const COLOR_SUCCESS = 0x00FF00; // green
  const COLOR_ERR = 0xFF0000; // red

  let mongoClient = undefined;
  let mongoDb = undefined;

  /**
   * Gets a quote.
   *
   * @param {Discord.Guild} guild - A discord.js guild/server this command came from.
   * @param {Discord.TextChannel} channel - A discord.js text Channel this command came from.
   *                                        Pass in null to skip sending the message and just return.
   * @param {string} name - Name of the quote.
   *
   * @returns {string} The quote. null if the quote doesn't exist.
   */
  const quoteGet = async function(guild, channel, name) {
    if (mongoDb === undefined) {
      console.error(CONSOLE_ERR_DB);
      return null;
    }

    let guildId = guild.id;
    let collection = mongoDb.collection(guildId);

    try {
      let result = await collection.findOne({
        name: name
      });

      let quote;
      if (result === null) {
        quote = null;
        if (channel !== null) {
          channel.send('', {
            embed: {
              title: QUOTE_GET_ERROR,
              description: util.format(QUOTE_NOT_FOUND_DESC, name),
              color: COLOR_ERR
            }
          });
        }
      } else {
        quote = result.quote;
        if (channel !== null) {
          // channel.send('', {
          //   embed: {
          //     title: util.format(QUOTE_GET_TITLE, name),
          //     description: quote,
          //     color: COLOR_CMD
          //   }
          // }); FIXME: embeds with previews
          channel.send(util.format('`%s`\n%s', util.format(QUOTE_GET_TITLE, name), quote));
        }
      }
      return quote;
    } catch (findError) {
      console.error(findError);
      channel.send('', {
        embed: {
          title: QUOTE_GET_ERROR,
          description: util.format(QUOTE_ERR_UNKNOWN, findError.message),
          color: COLOR_ERR
        }
      });
      return null;
    }
  };

  /**
   * Lists all the quotes of the server.
   *
   * @param {Discord.Guild} guild - A discord.js guild/server this command came from.
   * @param {Discord.TextChannel} channel - A discord.js text Channel this command came from.
   *
   * @returns {number} Number of quotes in this server.
   */
  const quoteList = async function(guild, channel) {
    if (mongoDb === undefined) {
      console.error(CONSOLE_ERR_DB);
      return 0;
    }

    let guildId = guild.id;
    let collection = mongoDb.collection(guildId);
    let quotes = await collection.find({}).toArray();
    if (quotes.length === 0) {
      channel.send('', {
        embed: {
          title: QUOTE_LIST_ERR,
          description: QUOTE_LIST_NONE,
          color: COLOR_ERR
        }
      });
      return 0;
    } else {
      let pages = [];
      let pageCount = Math.ceil(quotes.length / QUOTE_LIST_MAX_ENTRIES);
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        let page = '';

        for (let quoteIndex = pageIndex * QUOTE_LIST_MAX_ENTRIES; quoteIndex < (pageIndex + 1) * QUOTE_LIST_MAX_ENTRIES; quoteIndex++) {
          if (quotes[quoteIndex] === undefined) {
            break;
          }

          page += util.format(QUOTE_LIST_ENTRY, quotes[quoteIndex].name);
        }

        pages[pageIndex] = page;
      }

      let currentIndex = 0;
      let header = util.format(QUOTE_LIST_HEADER, (currentIndex + 1), pageCount);
      let desc = pages[currentIndex];
      let initMessage = await channel.send('', {
        embed: {
          title: header,
          description: desc,
          color: COLOR_CMD
        }
      });
      quoteListInteraction(initMessage, pages, currentIndex);

      return quotes.length;
    }
  };

  /**
   * Handles user interaction with quote lists.
   *
   * @param {Discord.Message} message - The discord.js message that was sent.
   * @param {string} pages - All the avilable quote list pages.
   * @param {number} currentIndex - The current index.
   */
  const quoteListInteraction = async function(message, pages, currentIndex) {
    let maxIndex = pages.length - 1;
    let filter;
    if (currentIndex === 0) {
      if (maxIndex > 0) {
        message.react(RIGHT_EMOJI);
        filter = (reaction, user) => {
          return reaction.emoji.name === RIGHT_EMOJI && user.id !== discordClient.user.id;
        };
      }
    } else if (currentIndex === maxIndex) {
      message.react(LEFT_EMOJI);
      filter = (reaction, user) => {
        return reaction.emoji.name === LEFT_EMOJI && user.id !== discordClient.user.id;
      };
    } else {
      message.react(LEFT_EMOJI)
        .then(() => message.react(RIGHT_EMOJI));
      filter = (reaction, user) => {
        return (reaction.emoji.name === LEFT_EMOJI || reaction.emoji.name === RIGHT_EMOJI) && user.id !== discordClient.user.id;
      };
    }

    let collector = message.createReactionCollector(filter, {
      time: QUOTE_LIST_TIMEOUT,
      max: 1
    });

    let timeout = setTimeout(() => {
      collector.stop();
      message.clearReactions();
    }, QUOTE_LIST_TIMEOUT);


    collector.on('collect', async (reaction) => {
      let newIndex;
      let emoji = reaction.emoji.name;
      if (emoji === LEFT_EMOJI) {
        newIndex = currentIndex - 1;
      } else if (emoji === RIGHT_EMOJI) {
        newIndex = currentIndex + 1;
      }

      let newHeader = util.format(QUOTE_LIST_HEADER, (newIndex + 1), pages.length);
      let newDesc = pages[newIndex];
      let editedMessage = await message.edit('', {
        embed: {
          title: newHeader,
          description: newDesc,
          color: COLOR_CMD
        }
      });

      clearTimeout(timeout);
      collector.stop();
      await editedMessage.clearReactions();
      quoteListInteraction(editedMessage, pages, newIndex);
    });
  };

  /**
   * Adds a quote.
   *
   * @param {Discord.Guild} guild - A discord.js guild/server this command came from.
   * @param {Discord.TextChannel} channel - A discord.js text Channel this command came from.
   * @param {string} name - Name of the quote.
   * @param {string} content - Content of the quote.
   *
   * @returns {boolean} True if quote was added, false if not.
   */
  const quoteAdd = async function(guild, channel, name, content) {
    if (name === '' || content === '') {
      channel.send('', {
        embed: {
          title: CMD_FORMAT_TITLE,
          description: util.format(CMD_FORMAT_DESC, QUOTE_ADD_HELP),
          color: COLOR_ERR
        }
      });
      return false;
    }

    if (name.length > QUOTE_ADD_NAME_MAX_CHARS) {
      channel.send('', {
        embed: {
          title: QUOTE_ADD_ERR,
          description: util.format(QUOTE_ADD_NAME_MAX_CHARS_DESC, QUOTE_ADD_NAME_MAX_CHARS),
          color: COLOR_ERR
        }
      });
      return false;
    }

    if (mongoDb === undefined) {
      console.error(CONSOLE_ERR_DB);
      return false;
    }

    let existingQuote = await quoteGet(guild, null, name);
    if (existingQuote !== null) {
      channel.send('', {
        embed: {
          title: QUOTE_ADD_ERR,
          description: util.format(QUOTE_ADD_EXISTS_DESC, name),
          color: COLOR_ERR
        }
      });
      return false;
    }

    let guildId = guild.id;
    let collection = mongoDb.collection(guildId);
    try {
      let result = await collection.insertOne({
        name: name,
        quote: content
      });
      channel.send('',  {
        embed: {
          title: QUOTE_ADD_TITLE,
          description: util.format(QUOTE_ADD_DESC, name),
          color: COLOR_SUCCESS
        }
      });
      return true;
    } catch (insError) {
      console.error(insError);
      channel.send('', {
        title: QUOTE_ADD_ERR,
        description: util.format(QUOTE_ERR_UNKNOWN, insError.message),
        color: COLOR_ERR
      });
      return false;
    }
  };

  /**
   * Removes a quote.
   *
   * @param {Discord.Guild} guild - A discord.js guild/server this command came from.
   * @param {Discord.TextChannel} channel - A discord.js text Channel this command came from.
   * @param {string} name - Name of the quote to remove.
   *
   * @returns {boolean} True if a quote was removed, false if not.
   */
  const quoteRemove = async function(guild, channel, name) {
    if (mongoDb === undefined) {
      console.error(CONSOLE_ERR_DB);
      return false;
    }

    let guildId = guild.id;
    let collection = mongoDb.collection(guildId);
    try {
      let result = await collection.deleteOne({
        name: name
      });

      if (result.deletedCount === 0) {
        channel.send('', {
          embed: {
            title: QUOTE_RM_ERR,
            description: util.format(QUOTE_RM_NONE, name),
            color: COLOR_ERR
          }
        });
        return false;
      } else {
        channel.send('', {
          embed: {
            title: QUOTE_RM_TITLE,
            description: util.format(QUOTE_RM_DESC, name),
            color: COLOR_SUCCESS
          }
        });
        return true;
      }
    } catch (delError) {
      console.error(delError);
      channel.send('', {
        embed: {
          title: QUOTE_RM_ERR,
          description: util.format(QUOTE_ERR_UNKNOWN, delError.message),
          color: COLOR_ERR
        }
      });
      return false;
    }
  };

  /**
   * Prints a help message.
   *
   * @param {Discord.TextChannel} channel - A discord.js text Channel this command came from.
   */
  const quoteHelp = function(channel) {
    channel.send('', {
      embed: {
        title: HELP_TITLE,
        description: QUOTE_GET_HELP + '\n' + QUOTE_LIST_HELP + '\n' + QUOTE_ADD_HELP + '\n' + QUOTE_RM_HELP,
        color: COLOR_CMD
      }
    });
  };

  discordClient.on('message', async (msg) => {
    let msgContent = msg.content;
    let guild = msg.guild;
    let channel = msg.channel;

    if (msgContent.startsWith(CMD_QUOTE)) {
      let name = msgContent.substring(CMD_QUOTE.length);
      let spaceIndex = name.indexOf(' ');
      if (spaceIndex !== -1) {
        name = name.substring(0, spaceIndex);
      }
      quoteGet(guild, channel, name);
    } else if (msgContent.startsWith(CMD_QUOTE_LIST)) {
      quoteList(guild, channel);
    } else if (msgContent.startsWith(CMD_QUOTE_ADD)) {
      let nameAndContent = msgContent.substring(CMD_QUOTE_ADD.length);
      let contentIndex = nameAndContent.indexOf(NAME_CONTENT_DELIMITER);
      let name = nameAndContent.substring(0, contentIndex);
      let content = nameAndContent.substring(contentIndex + 1);
      quoteAdd(guild, channel, name, content);
    } else if (msgContent.startsWith(CMD_QUOTE_REMOVE)) {
      let name = msgContent.substring(CMD_QUOTE_REMOVE.length);
      quoteRemove(guild, channel, name);
    } else if (msgContent.startsWith(CMD_HELP)) {
      quoteHelp(channel);
    }
  });

  // inits bot and database
  (function init() {
    const url = process.env.MONGODB_URL;
    const name = process.env.MONGODB_NAME;
    const user = process.env.MONGODB_USER;
    const password = process.env.MONGODB_PASSWORD;

    if (url === undefined || name === undefined || user === undefined || password === undefined) {
      throw new Error(CONSOLE_ERR_MONGODB_ENV);
    }

    const urlFormat = 'mongodb://%s:%s@' + url;
    const fullUrl = util.format(urlFormat, user, password);

    MongoClient.connect(fullUrl, { useNewUrlParser: true }, (error, client) => {
      if (error !== null) {
        throw new Error(CONSOLE_ERR_MONGODB_CONNECT + error.message);
      }

      console.log('Connected to MongoDB: ', url);
      mongoClient = client;
      mongoDb = mongoClient.db(name);
    });

    // init
    discordClient.user.setPresence({
      status: 'online',
      afk: false,
      game: {
        name: '!help'
      }
    });
  })();
};
