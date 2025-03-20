// commands/dockerNotify.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockernotify")
    .setDescription("Enable/disable Docker update notifications")
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable Docker update notifications')
        .addStringOption(option => 
          option.setName('channel')
            .setDescription('Channel to send notifications to')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable Docker update notifications')),
        
  async execute(interaction) {
    // Create embed with Pangolin branding
    const embed = branding.getHeaderEmbed('Docker Update Notifications');
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'enable') {
      const channel = interaction.options.getString('channel');
      
      embed.setColor(branding.colors.success);
      embed.setDescription(
        `${branding.emojis.healthy} Docker update notifications enabled!\n\n` +
        `Notifications will be sent to: ${channel}\n\n` +
        `Note: This is a placeholder implementation. In a full implementation, this would store the channel ID and set up a scheduled job to check for updates.`
      );
      
    } else if (subcommand === 'disable') {
      embed.setColor(branding.colors.warning);
      embed.setDescription(
        `${branding.emojis.warning} Docker update notifications disabled.\n\n` +
        `You'll no longer receive notifications about container updates.\n\n` +
        `Note: This is a placeholder implementation.`
      );
    }
    
    await interaction.reply({ 
      embeds: [embed],
      ephemeral: true
    });
  }
};