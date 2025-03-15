// commands/pangolinLogs.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const { exec } = require('child_process');
const util = require('util');

// Promisify exec
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pangolinlogs")
    .setDescription("Fetches logs from a Pangolin stack container")
    .addStringOption(option => 
      option.setName('container')
        .setDescription('The container to view logs from')
        .setRequired(true)
        .addChoices(
          { name: 'pangolin', value: 'pangolin' },
          { name: 'gerbil', value: 'gerbil' },
          { name: 'traefik', value: 'traefik' },
          { name: 'crowdsec', value: 'crowdsec' }
        ))
    .addIntegerOption(option =>
      option.setName('lines')
        .setDescription('Number of log lines to show (default: 20)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('filter')
        .setDescription('Filter logs containing this text')
        .setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const containerName = interaction.options.getString('container');
      const lines = interaction.options.getInteger('lines') || 20;
      const filter = interaction.options.getString('filter');
      
      // Fetch logs
      let cmd = `docker logs --tail ${lines} ${containerName}`;
      if (filter) {
        cmd += ` | grep -i "${filter}"`;
      }
      
      const { stdout, stderr } = await execPromise(cmd);
      
      if (!stdout || stdout.trim() === '') {
        await interaction.editReply(`No logs found for container ${containerName}${filter ? ` with filter "${filter}"` : ''}.`);
        return;
      }
      
      // Format logs for Discord
      let logContent = stdout.trim();
      
      // Split logs into chunks if too large
      const maxLength = 1900; // Discord message character limit with some buffer
      
      if (logContent.length <= maxLength) {
        await interaction.editReply({
          content: `**Logs for ${containerName}**${filter ? ` (filtered by "${filter}")` : ''}`,
          files: [{
            attachment: Buffer.from(logContent),
            name: `${containerName}-logs.txt`
          }]
        });
      } else {
        // Log is too large, upload as file
        await interaction.editReply({
          content: `**Logs for ${containerName}**${filter ? ` (filtered by "${filter}")` : ''} (output was too large, providing as a file)`,
          files: [{
            attachment: Buffer.from(logContent),
            name: `${containerName}-logs.txt`
          }]
        });
      }
    } catch (error) {
      console.error(error);
      await interaction.editReply(`Error fetching logs: ${error.message}`);
    }
  }
};