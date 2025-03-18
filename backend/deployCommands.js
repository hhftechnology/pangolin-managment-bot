require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('path');

const token = process.env.DISCORD_TOKEN;
const clientID = process.env.DISCORD_CLIENT_ID;
const guildID = process.env.DISCORD_GUILD_ID;

const commands = [];

function getAllCommandFiles(dirPath) {
  let files = [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      files = files.concat(getAllCommandFiles(fullPath));
    } else if (item.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const commandFiles = getAllCommandFiles('./commands');
console.log(commandFiles);

for (const file of commandFiles) {
  const command = require(path.resolve(file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    console.log(`Attempting to deploy ${commands.length} commands`);

    const data = guildID
      ? await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: commands })
      : await rest.put(Routes.applicationCommands(clientID), { body: commands });

    console.log('Successfully reloaded ' + data.length + ' commands.');
  } catch (error) {
    console.error('ERROR DEPLOYING COMMANDS:');
    console.error(error.message);
    console.error(error.stack);
  }
})();