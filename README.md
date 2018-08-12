# Quote-Discord-Bot

A Discord bot built on [discord.js](https://discord.js.org/) that adds custom quotes stored on MongoDB.

## Planned Features

* Require a certain role/permission in the server to use certain commands.
* Maybe optionally remove the `!quote` requirement so that the bot responds to single word messages with matching names.

## Setup

1. Create a MongoDB database. I use [mLab](https://mlab.com/).
2. Install [Node.js](https://nodejs.org/). This has been developed and tested on v9.7.1 and v10.8.0 on Windows and Ubuntu, but should work on any platform that Node.js runs on.
3. Pull or download this repository.
4. Create environment variables or fill in the .env file with your information. Check the [.env Configuration](#env-configuration) section for more details.
5. In a terminal in the directory of the extracted folder, simply start the bot with `npm start`.
6. To stop the bot at any time, press `Ctrl+C` in the terminal window.

## .env Configuration

This bot supports either system environment variables or using the `.env` file.
System environment variables will be used over the `.env` file.

To use the `.env` file, simply type the value indicated after the equals sign in the `.env` file.
Comments starting with the pound sign `#` are ignored.

* `DISCORD_TOKEN`: A Discord bot token used by your bot to login. Get one from [here](https://discordapp.com/developers/applications/).
* `MONGODB_URL`: Your MongoDB URL. Please enter this without the `mongodb://` and your username/password.
* `MONGODB_NAME`: Your MongoDB database name.
* `MONGODB_USER`: Your MongoDB username.
* `MONGODB_PASSWORD`: Your MongoDB password.

## Known Bugs

* The `!quote` command doesn't display its message as the same embed style as every other message is sent as.
* The `!quotelist` command can feel a bit slow/choppy as it refreshes the reactions.
* When using the command `!quotelist` and quickly pressing the reactions, occasionally the two arrows will show up in the wrong order. Pressing them is still fine.
* A user trying to add quotes with nonstandard characters (backslashes, quotes, etc.) may create quotes that aren't later retrievable. While these will sit in the database and may require you to manually remove them if you don't want them to take up space, they should not break the bot itself.

## Credits

This repository is licensed under the GNU GPL v3.0.

npm Packages:

* [discord.js (Apache License 2.0)](https://discord.js.org/)
* [dotenv (BSD 2-clause License)](https://github.com/motdotla/dotenv)
* [eslint (MIT License)](https://www.npmjs.com/package/eslint)
* [mongodb (Apache License 2.0)](https://www.npmjs.com/package/mongodb)