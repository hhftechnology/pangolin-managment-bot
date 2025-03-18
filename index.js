require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, REST, Routes } = require('discord.js');
const http = require('http');

// Get environment variables
const token = process.env.DISCORD_TOKEN;
const clientID = process.env.DISCORD_CLIENT_ID;
const guildID = process.env.DISCORD_GUILD_ID;

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Function to validate command options
function validateOptions(options, commandName, subcommandName) {
  let hasOptional = false;
  for (const option of options) {
    const isRequired = option.required || false;
    if (!isRequired && hasOptional === false) {
      hasOptional = true;
    } else if (isRequired && hasOptional) {
      console.error(
        `Error in command '${commandName}', subcommand '${subcommandName}': ` +
        `Required option '${option.name}' appears after optional options.`
      );
      return false;
    }
  }
  return true;
}

// Deploy commands function with validation
async function deployCommands() {
  try {
    const commands = [];
    
    // Function to get all command files recursively
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
    console.log(`Found ${commandFiles.length} command files`);
    
    // Load each command and validate
    for (const file of commandFiles) {
      try {
        const command = require(path.resolve(file));
        if ('data' in command && 'execute' in command) {
          const cmdData = command.data.toJSON();
          
          // Validate options for subcommands
          if (cmdData.options) {
            for (const opt of cmdData.options) {
              if (opt.type === 1 || opt.type === 2) { // SUB_COMMAND or SUB_COMMAND_GROUP
                if (opt.options && !validateOptions(opt.options, cmdData.name, opt.name)) {
                  throw new Error(`Invalid option order in '${cmdData.name}'`);
                }
              }
            }
          }
          commands.push(cmdData);
          console.log(`Loaded command: ${cmdData.name}`);
        } else {
          console.warn(`Command at ${file} is missing required properties`);
        }
      } catch (error) {
        console.error(`Error loading command from ${file}:`, error);
      }
    }

    // Log commands being deployed with indices
    console.log('Deploying commands:');
    commands.forEach((cmd, index) => {
      console.log(`Command ${index}: ${cmd.name}`);
    });

    // Create REST instance to interact with Discord API
    const rest = new REST({ version: '10' }).setToken(token);

    console.log('Started refreshing application (/) commands.');
    console.log(`Attempting to deploy ${commands.length} commands`);

    // Register commands
    const data = guildID
      ? await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: commands })
      : await rest.put(Routes.applicationCommands(clientID), { body: commands });

    console.log(`Successfully registered ${data.length} commands.`);
    return data.length;
  } catch (error) {
    console.error('ERROR DEPLOYING COMMANDS:');
    console.error(error.message);
    console.error(error.stack);
    return 0;
  }
}

// Create a new collection for commands
client.commands = new Collection();

// Load command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // Set a new item in the Collection
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`Loaded command for execution: ${command.data.name}`);
    } else {
      console.warn(`Command at ${file} is missing required properties`);
    }
  } catch (error) {
    console.error(`Error loading command ${file}:`, error);
  }
}

// Generate invite link
const inviteLink = `https://discord.com/oauth2/authorize?client_id=${clientID}&permissions=2147534912&scope=bot%20applications.commands`;
console.log(`Invite link: ${inviteLink}`);

// Create a simple health check server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3000, () => {
  console.log('Health check server running on port 3000');
});

// Execute commands when received
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        console.log(`Executing command: ${interaction.commandName}`);
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        
        // Check if interaction has already been replied to
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ 
            content: 'There was an error executing this command. Please try again later.'
          }).catch(console.error);
        } else {
          await interaction.reply({ 
            content: 'There was an error executing this command. Please try again later.',
            ephemeral: true 
          }).catch(console.error);
        }
      }
    } else if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);

      if (!command || !command.autocomplete) {
        console.error(`No matching command or autocomplete for ${interaction.commandName}`);
        return;
      }

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`Error in autocomplete for ${interaction.commandName}:`, error);
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
  }
});

// When the client is ready, run this code
client.once(Events.ClientReady, async c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
  
  // Deploy commands after login
  const commandCount = await deployCommands();
  console.log(`Deployed ${commandCount} commands to Discord`);
});

// Login to Discord with your client's token
client.login(token).catch(error => {
  console.error('Failed to login to Discord:', error);
});