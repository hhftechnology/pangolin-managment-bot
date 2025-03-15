// commands/autoRestart.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const fs = require('fs').promises;
const path = require('path');

// Path to store configuration
const CONFIG_PATH = path.join(__dirname, '../data/autoRestart.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autorestart")
    .setDescription("Configure automatic container restart settings")
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable automatic restarts for a container')
        .addStringOption(option => 
          option.setName('container')
            .setDescription('The container to enable auto-restart for')
            .setRequired(true)
            .addChoices(
              { name: 'pangolin', value: 'pangolin' },
              { name: 'gerbil', value: 'gerbil' },
              { name: 'traefik', value: 'traefik' },
              { name: 'crowdsec', value: 'crowdsec' }
            ))
        .addIntegerOption(option =>
          option.setName('max_attempts')
            .setDescription('Maximum restart attempts per day (default: 3)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable automatic restarts for a container')
        .addStringOption(option => 
          option.setName('container')
            .setDescription('The container to disable auto-restart for')
            .setRequired(true)
            .addChoices(
              { name: 'pangolin', value: 'pangolin' },
              { name: 'gerbil', value: 'gerbil' },
              { name: 'traefik', value: 'traefik' },
              { name: 'crowdsec', value: 'crowdsec' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show auto-restart configuration status')),
  async execute(interaction) {
    // Ensure config directory exists
    const configDir = path.dirname(CONFIG_PATH);
    await fs.mkdir(configDir, { recursive: true }).catch(() => {});
    
    // Load existing config
    let config = {};
    try {
      const configData = await fs.readFile(CONFIG_PATH, 'utf8');
      config = JSON.parse(configData);
    } catch (error) {
      // Initialize config if it doesn't exist
      config = { containers: {} };
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'enable') {
      const containerName = interaction.options.getString('container');
      const maxAttempts = interaction.options.getInteger('max_attempts') || 3;
      
      // Update config
      config.containers[containerName] = {
        enabled: true,
        maxAttempts,
        attempts: 0,
        lastAttemptDate: null
      };
      
      await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
      
      await interaction.reply(`✅ Auto-restart enabled for ${containerName} with max ${maxAttempts} attempts per day.`);
    }
    else if (subcommand === 'disable') {
      const containerName = interaction.options.getString('container');
      
      if (config.containers[containerName]) {
        config.containers[containerName].enabled = false;
        await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
        await interaction.reply(`❌ Auto-restart disabled for ${containerName}.`);
      } else {
        await interaction.reply(`Auto-restart was not configured for ${containerName}.`);
      }
    }
    else if (subcommand === 'status') {
      const embed = new EmbedBuilder()
        .setTitle('Auto-Restart Configuration')
        .setColor(0x00AE86)
        .setTimestamp();
      
      if (Object.keys(config.containers || {}).length === 0) {
        embed.setDescription('No containers configured for auto-restart.');
      } else {
        for (const [container, settings] of Object.entries(config.containers)) {
          embed.addFields({
            name: container,
            value: `Status: ${settings.enabled ? '✅ Enabled' : '❌ Disabled'}\nMax Attempts: ${settings.maxAttempts}\nCurrent Attempts: ${settings.attempts || 0}${settings.lastAttemptDate ? `\nLast Attempt: ${new Date(settings.lastAttemptDate).toLocaleString()}` : ''}`,
            inline: true
          });
        }
      }
      
      await interaction.reply({ embeds: [embed] });
    }
  }
};