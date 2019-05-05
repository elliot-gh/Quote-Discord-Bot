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
  const CON_ERR_DB_ENV = 'One or more .env MongoDB settings are not set!';
  const CON_ERR_DB_CONNECT = 'Error connecting to MongoDB: ';
  const CON_ERR_DB = 'MongoDB connection not ready.';

  const CMD_FORMAT_TITLE = 'Invalid command format.';
  const CMD_FORMAT_DESC = 'The correct command format is %s';
  const CMD_ERR_UNKNOWN = 'An unknown error occurred: %s';
  const QUOTE_NOT_FOUND_DESC = 'Quote with name `%s` was not found.';
  const CMD_ERROR_TITLE = 'Error';
  const CMD_DB_NOT_READY = 'The MongoDB connection is not yet ready. Please wait a few more seconds.';

  const CMD_HELP = '!help';
  const HELP_TITLE = 'Help';

  const CMD_QUOTE = '!quote ';
  const QUOTE_GET_TITLE = '%s';
  const QUOTE_GET_ERROR = 'Quote could not be found.';
  const QUOTE_GET_HELP = '`!quote [name]`';
  const QUOTE_NAME_MAX_CHARS = 100;
  const QUOTE_NAME_MAX_CHARS_DESC = 'Please keep quote names under %d characters.';

  const CMD_QUOTE_LIST = '!quotelist';
  const QUOTE_LIST_ERR = 'Quote list could not be retrieved.';
  const QUOTE_LIST_NONE = 'There are no quotes for this server.';
  const QUOTE_LIST_HEADER = 'Page %d of %d';
  const QUOTE_LIST_ENTRY = '• `%s`\n';
  const QUOTE_LIST_MAX_ENTRIES = 10;
  const QUOTE_LIST_HELP = '`!quotelist`';
  const LEFT_EMOJI = '⬅';
  const RIGHT_EMOJI = '➡';

  const CMD_QUOTE_ADD = '!quoteadd ';
  const QUOTE_ADD_QUOTE_MAX_CHARS = 1500;
  const QUOTE_ADD_QUOTE_MAX_CHARS_DESC = 'Please keep quotes under %d characters.';
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
  let quoteListTimeout = 30000;
  let noPrefixQuote;
  let caseSens = false;

  /**
   * Gets a quote, and optionally sends it to a channel as well.
   *
   * @param {Discord.TextChannel} channel - A discord.js text channel this command came from.
   *                                        Pass in null to skip sending the message and just return.
   * @param {Discord.Guild} guild - A discord.js guild that the quote belongs to.
   * @param {string} name - Name of the quote.
   *
   * @returns {string} The quote. null if the quote doesn't exist.
   */
  const quoteGet = async function(channel, guild, name) {
    // make sure MongoDB connection is ready
    if (mongoDb === undefined) {
      console.error(CON_ERR_DB);
      if (channel !== null) {
        channel.send('', {
          embed: {
            title: CMD_ERROR_TITLE,
            description: CMD_DB_NOT_READY,
            color: COLOR_ERR
          }
        });
      }
      return null;
    }

    if (name.length > QUOTE_NAME_MAX_CHARS) {
      console.error(util.format(QUOTE_NAME_MAX_CHARS_DESC, QUOTE_NAME_MAX_CHARS));
      if (channel !== null) {
        channel.send('', {
          embed: {
            title: CMD_ERROR_TITLE,
            description: util.format(QUOTE_NAME_MAX_CHARS_DESC, QUOTE_NAME_MAX_CHARS),
            color: COLOR_ERR
          }
        });
      }
      return null;
    }

    // attempt to find and send quote
    let queryObj;
    if (caseSens) {
      queryObj = {
        'name': name
      };
    } else {
      queryObj = {
        'name': {
          '$regex': `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          '$options': 'i'
        }
      };
    }

    let guildId = guild.id;
    try {
      let collection = mongoDb.collection(guildId);
      let result = await collection.findOne(queryObj);

      // no results returns null
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
          // }); // TODO: embeds with previews
          channel.send(util.format('```%s```\n%s', util.format(QUOTE_GET_TITLE, name), quote));
        }
      }
      return quote;
    } catch (findError) {
      console.error(findError);
      if (channel !== null) {
        channel.send('', {
          embed: {
            title: QUOTE_GET_ERROR,
            description: util.format(CMD_ERR_UNKNOWN, findError.message),
            color: COLOR_ERR
          }
        });
      }
      return null;
    }
  };

  /**
   * Used to get a quote when no prefix is enabled.
   *
   * @param {Discord.TextChannel} channel - A discord.js text channel this command came from.
   *                                        Pass in null to skip sending the message and just return.
   * @param {Discord.Guild} guild - A discord.js guild that the quote belongs to.
   * @param {string} name - Name of the quote.
   *
   * @returns {string} The quote. null if the quote doesn't exist.
   */
  const quoteGetNoPrefix = async function(channel, guild, name) {
    let quote = await quoteGet(null, guild, name);
    if (quote !== null) {
      // channel.send('', {
      //   embed: {
      //     title: util.format(QUOTE_GET_TITLE, name),
      //     description: quote,
      //     color: COLOR_CMD
      //   }
      // }); // TODO: embeds with previews
      channel.send(util.format('```%s```\n%s', util.format(QUOTE_GET_TITLE, name), quote));
    }
  };

  /**
   * Lists all the quotes of the server.
   *
   * @param {Discord.TextChannel} channel - A discord.js text Channel this command came from.
   *
   * @returns {number} Number of quotes in this server.
   */
  const quoteList = async function(channel) {
    // make sure MongoDB connection is ready
    if (mongoDb === undefined) {
      console.error(CON_ERR_DB);
      channel.send('', {
        embed: {
          title: CMD_ERROR_TITLE,
          description: CMD_DB_NOT_READY,
          color: COLOR_ERR
        }
      });
      return 0;
    }

    // try and get all quotes
    let guildId = channel.guild.id;
    try {
      let collection = mongoDb.collection(guildId);
      let cursor = await collection.find({});
      let quotes = await cursor.sort('name', 1).toArray(); // sort by name
      cursor.close();

      // no quotes on this server
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
        // calculate pages needed and iterate through all quotes, filling up pages
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

        // start at first page, send, and let the interaction function deal with it
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
    } catch (error) {
      channel.send('', {
        embed: {
          title: QUOTE_LIST_ERR,
          description: util.format(CMD_ERR_UNKNOWN, error.message),
          color: COLOR_ERR
        }
      });
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

    try {
      // create filter and reactions based on page position (first, regular, last)
      if (currentIndex === 0) {
        // first page, but only create reactions if there's more than one page
        if (maxIndex > 0) {
          message.react(RIGHT_EMOJI);
          filter = (reaction, user) => {
            return reaction.emoji.name === RIGHT_EMOJI && user.id !== discordClient.user.id;
          };
        } else {
          filter = (reaction, user) => false;
        }
      } else if (currentIndex === maxIndex) {
        // last page
        message.react(LEFT_EMOJI);
        filter = (reaction, user) => {
          return reaction.emoji.name === LEFT_EMOJI && user.id !== discordClient.user.id;
        };
      } else {
        await message.react(LEFT_EMOJI);
        message.react(RIGHT_EMOJI);
        filter = (reaction, user) => {
          return (reaction.emoji.name === LEFT_EMOJI || reaction.emoji.name === RIGHT_EMOJI) && user.id !== discordClient.user.id;
        };
      }
    } catch (error) {
      console.error(error);
      return;
    }

    // discord.js reaction collector for this message
    let collector = message.createReactionCollector(filter, {
      max: 1 // only collect 1 reaction - don't want to handle potential user spam
    });

    // node timer for listener timeout; not using discord.js's reaction collector
    let timeout = setTimeout(() => {
      collector.stop();
      message.clearReactions();
    }, quoteListTimeout);

    // collect event emitted with filter, switch pages
    // TODO: when discord.js stable recieves 'remove' events, handle removes and collects
    //       so it's not as choppy to constantly clear repopulate
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
      let editedMessage;
      try {
        editedMessage = await message.edit('', {
          embed: {
            title: newHeader,
            description: newDesc,
            color: COLOR_CMD
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        collector.stop();
        console.error(error);
        return;
      }

      // unlisten since we're refreshing the interaction
      clearTimeout(timeout);
      collector.stop();
      await editedMessage.clearReactions();
      quoteListInteraction(editedMessage, pages, newIndex);
    });
  };

  /**
   * Adds a quote.
   *
   * @param {Discord.TextChannel} channel - A discord.js text Channel this command came from.
   * @param {string} name - Name of the quote.
   * @param {string} content - Content of the quote.
   *
   * @returns {boolean} True if quote was added, false if not.
   */
  const quoteAdd = async function(channel, name, content) {
    // make sure MongoDB connection is ready
    if (mongoDb === undefined) {
      console.error(CON_ERR_DB);
      channel.send('', {
        embed: {
          title: CMD_ERROR_TITLE,
          description: CMD_DB_NOT_READY,
          color: COLOR_ERR
        }
      });
      return false;
    }

    // if one of them are empty, then the command was malformed
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

    // some char limits in place to prevent discord's 2000 char limit causing issues
    if (name.length > QUOTE_NAME_MAX_CHARS) {
      channel.send('', {
        embed: {
          title: QUOTE_ADD_ERR,
          description: util.format(QUOTE_NAME_MAX_CHARS_DESC, QUOTE_NAME_MAX_CHARS),
          color: COLOR_ERR
        }
      });
      return false;
    } else if (content.length > QUOTE_ADD_QUOTE_MAX_CHARS) {
      channel.send('', {
        embed: {
          title: QUOTE_ADD_ERR,
          description: util.format(QUOTE_ADD_QUOTE_MAX_CHARS_DESC, QUOTE_ADD_QUOTE_MAX_CHARS),
          color: COLOR_ERR
        }
      });
      return false;
    }

    // add quote
    let guildId = channel.guild.id;
    try {
      // check for existing quote, no duplicate names
      let existingQuote = await quoteGet(null, channel.guild, name);
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

      let collection = mongoDb.collection(guildId);
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
    } catch (error) {
      console.error(error);
      channel.send('', {
        title: QUOTE_ADD_ERR,
        description: util.format(CMD_ERR_UNKNOWN, error.message),
        color: COLOR_ERR
      });
      return false;
    }
  };

  /**
   * Removes a quote.
   *
   * @param {Discord.TextChannel} channel - A discord.js text Channel this command came from.
   * @param {string} name - Name of the quote to remove.
   *
   * @returns {boolean} True if a quote was removed, false if not.
   */
  const quoteRemove = async function(channel, name) {
    // make sure MongoDB connection is ready
    if (mongoDb === undefined) {
      console.error(CON_ERR_DB);
      channel.send('', {
        embed: {
          title: CMD_ERROR_TITLE,
          description: CMD_DB_NOT_READY,
          color: COLOR_ERR
        }
      });
      return false;
    }

    // delete quote
    let queryObj;
    if (caseSens) {
      queryObj = {
        'name': name
      };
    } else {
      queryObj = {
        'name': {
          '$regex': `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          '$options': 'i'
        }
      };
    }

    let guildId = channel.guild.id;
    try {
      let collection = mongoDb.collection(guildId);
      let result = await collection.deleteOne(queryObj);

      // nothing deleted, quote never existed
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
    } catch (error) {
      console.error(error);
      channel.send('', {
        embed: {
          title: QUOTE_RM_ERR,
          description: util.format(CMD_ERR_UNKNOWN, error.message),
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
    // send all this bot's available commands
    channel.send('', {
      embed: {
        title: HELP_TITLE,
        description: QUOTE_GET_HELP + '\n' +
                     QUOTE_LIST_HELP + '\n' +
                     QUOTE_ADD_HELP + '\n' +
                     QUOTE_RM_HELP,
        color: COLOR_CMD
      }
    });
  };

  discordClient.on('message', async (msg) => {
    let msgContent = msg.content;
    let channel = msg.channel;

    if (msgContent.startsWith(CMD_QUOTE)) {
      let name = msgContent.substring(CMD_QUOTE.length);
      let spaceIndex = name.indexOf(' ');
      if (spaceIndex !== -1) {
        name = name.substring(0, spaceIndex);
      }
      quoteGet(channel, channel.guild, name);

    } else if (msgContent.startsWith(CMD_QUOTE_LIST)) {
      quoteList(channel);

    } else if (msgContent.startsWith(CMD_QUOTE_ADD)) {
      let nameAndContent = msgContent.substring(CMD_QUOTE_ADD.length);
      let contentIndex = nameAndContent.indexOf(NAME_CONTENT_DELIMITER);
      let name = nameAndContent.substring(0, contentIndex);
      let content = nameAndContent.substring(contentIndex + 1);
      quoteAdd(channel, name, content);

    } else if (msgContent.startsWith(CMD_QUOTE_REMOVE)) {
      let name = msgContent.substring(CMD_QUOTE_REMOVE.length);
      quoteRemove(channel, name);

    } else if (msgContent.startsWith(CMD_HELP)) {
      quoteHelp(channel);
    } else if (noPrefixQuote && !msgContent.includes(' ')) {
      quoteGetNoPrefix(channel, channel.guild, msgContent);
    }
  });

  // inits bot and database
  (() => {
    const url = process.env.MONGODB_URL;
    const name = process.env.MONGODB_NAME;
    const user = process.env.MONGODB_USER;
    const password = process.env.MONGODB_PASSWORD;
    const noPrefix = process.env.QUOTE_GET_NO_PREFIX;
    const timeout = process.env.QUOTE_LIST_TIMEOUT;
    const quoteCase = process.env.QUOTE_CASE_SENS;

    if (url === undefined || name === undefined || user === undefined || password === undefined ||
        noPrefix === undefined) {
      throw new Error(CON_ERR_DB_ENV);
    } else {
      noPrefixQuote = JSON.parse(noPrefix.toLowerCase());
      if (typeof noPrefixQuote !== 'boolean') {
        throw new Error(CON_ERR_DB_ENV);
      }
    }

    if (timeout !== undefined) {
      quoteListTimeout = parseInt(timeout);
    }

    if (quoteCase !== undefined) {
      caseSens = JSON.parse(quoteCase.toLowerCase());
    }

    const urlFormat = 'mongodb://%s:%s@' + url;
    const fullUrl = util.format(urlFormat, encodeURIComponent(user), encodeURIComponent(password));

    MongoClient.connect(fullUrl, { useNewUrlParser: true }, (error, client) => {
      if (error !== null) {
        throw new Error(CON_ERR_DB_CONNECT + error.message);
      }

      console.log('Connected to MongoDB: ', url);
      mongoClient = client;
      mongoDb = mongoClient.db(name);
    });
  })();
};
