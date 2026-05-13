// commands/pangolinLogs.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const { exec } = require('child_process');
const util = require('util');


// Promisify exec
const execPromise = util.promisify(exec);

// commands/pangolinLogs.js - replace the exec command with Docker API
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Get logs using the Docker API instead of CLI
async function getContainerLogs(containerName, lines) {
  try {
    // Get container by name
    const containers = await docker.container.list({
      all: true,
      filters: { name: [containerName] }
    });

    if (containers.length === 0) {
      throw new Error(`Container '${containerName}' not found`);
    }

    const container = containers[0];

    // Get container logs with specified options
    const logOpts = {
      stdout: true,
      stderr: true,
      tail: lines,
      timestamps: false
    };

    // Get logs
    const logStream = await container.logs(logOpts);

    // Process the log stream
    return new Promise((resolve, reject) => {
      let logs = '';
      logStream.on('data', chunk => {
        // Remove the first 8 bytes of each chunk (Docker log header)
        const textChunk = chunk.toString('utf8').substring(8);
        logs += textChunk;
      });

      logStream.on('end', () => resolve(logs));
      logStream.on('error', err => reject(err));
    });
  } catch (error) {
    throw error;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerlogs")
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
        .setDescription('Number of log lines to show (default: 10)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('filter')
        .setDescription('Filter logs containing this text')
        .setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply();

    try {
      const containerName = interaction.options.getString('container');
      const lines = interaction.options.getInteger('lines') || 10;
      const filter = interaction.options.getString('filter');

      // Get logs using our new function
      let logContent = await getContainerLogs(containerName, lines);

      // Apply filter if provided
      if (filter && logContent) {
        // Simple client-side filtering
        const filteredLines = logContent.split('\n')
          .filter(line => line.toLowerCase().includes(filter.toLowerCase()));
        logContent = filteredLines.join('\n');
      }

      if (!logContent || logContent.trim() === '') {
        await interaction.editReply(`No logs found for container ${containerName}${filter ? ` with filter "${filter}"` : ''}.`);
        return;
      }

      // Format and send logs
      const maxLength = 1900;
      if (logContent.length <= maxLength) {
        await interaction.editReply({
          content: `**Logs for ${containerName}**${filter ? ` (filtered by "${filter}")` : ''}`,
          files: [{
            attachment: Buffer.from(logContent),
            name: `${containerName}-logs.txt`
          }]
        });
      } else {
        await interaction.editReply({
          content: `**Logs for ${containerName}**${filter ? ` (filtered by "${filter}")` : ''} (output was too large, providing as a file)`,
          files: [{
            attachment: Buffer.from(logContent),
            name: `${containerName}-logs.txt`
          }]
        });
      }
    } catch (error) {
      console.error(`${branding.consoleHeader} Error: ${error.message}`);
      await interaction.editReply(`Error fetching logs: ${error.message}`);
    }
  }
};