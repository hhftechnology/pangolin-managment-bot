// commands/pangolinStatus.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pangolinstatus")
    .setDescription("Checks the health of the Pangolin stack"),
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      const targetContainers = ['pangolin', 'gerbil', 'traefik', 'crowdsec'];
      
      // Get all containers
      const containers = await docker.container.list({ all: true });
      
      // Create embed with Pangolin branding
      const embed = branding.getHeaderEmbed('Pangolin Stack Status');
      
      // Add thumbnail for Pangolin
      embed.setThumbnail('https://avatars.githubusercontent.com/u/90802857?s=200&v=4');
      
      // Add description with overview
      let healthySummary = 0;
      let warningSummary = 0;
      let errorSummary = 0;
      
      // Add fields for each Pangolin component
      for (const targetName of targetContainers) {
        const container = containers.find(c => 
          c.data.Names.some(name => name.slice(1) === targetName)
        );
        
        if (!container) {
          embed.addFields({ 
            name: branding.formatContainerName(targetName), 
            value: `${branding.emojis.error} Not found`, 
            inline: true 
          });
          errorSummary++;
          continue;
        }
        
        // Status indicator emoji and status type for coloring
        let statusEmoji = branding.emojis.unknown;
        let statusType = 'info';
        
        if (container.data.State === 'running') {
          statusEmoji = branding.emojis.healthy;
          statusType = 'success';
          healthySummary++;
          
          // Additional health check for containers with healthcheck
          if (container.data.Status.includes('(healthy)')) {
            statusEmoji = branding.emojis.healthy;
          } else if (container.data.Status.includes('(unhealthy)')) {
            statusEmoji = branding.emojis.error;
            statusType = 'danger';
            errorSummary++;
          }
        } else if (container.data.State === 'exited') {
          statusEmoji = branding.emojis.error;
          statusType = 'danger';
          errorSummary++;
        } else {
          warningSummary++;
        }
        
        // Get container stats
        const stats = await container.stats({ stream: false });
        const cpuUsage = calculateCpuPercent(stats);
        const memoryUsage = formatBytes(stats.memory_stats.usage || 0);
        
        embed.addFields({ 
          name: branding.formatContainerName(targetName), 
          value: `${statusEmoji} ${container.data.State}\nUptime: ${formatUptime(container.data.Status)}\nCPU: ${cpuUsage.toFixed(2)}%\nMemory: ${memoryUsage}`,
          inline: true 
        });
      }
      
      // Set the embed color based on overall status
      if (errorSummary > 0) {
        embed.setColor(branding.colors.danger);
        embed.setDescription(`${branding.emojis.error} **Critical Issues Detected**\n${healthySummary} healthy, ${warningSummary} warnings, ${errorSummary} critical`);
      } else if (warningSummary > 0) {
        embed.setColor(branding.colors.warning);
        embed.setDescription(`${branding.emojis.warning} **Warnings Detected**\n${healthySummary} healthy, ${warningSummary} warnings, ${errorSummary} critical`);
      } else {
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} **All Systems Operational**\n${healthySummary} healthy, ${warningSummary} warnings, ${errorSummary} critical`);
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(`${branding.consoleHeader} Error: ${error.message}`);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Retrieving Status', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred while checking the Pangolin stack.\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

// Helper functions (same as before)
function calculateCpuPercent(stats) {
  // CPU percentage calculation logic here
  return stats.cpu_stats && stats.precpu_stats ? 
    0.0 : 0.0; // Placeholder - implement actual calculation
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(status) {
  // Extract uptime from container status string
  const uptimeMatch = status.match(/Up (\d+) (\w+)/);
  return uptimeMatch ? `${uptimeMatch[1]} ${uptimeMatch[2]}` : 'N/A';
}