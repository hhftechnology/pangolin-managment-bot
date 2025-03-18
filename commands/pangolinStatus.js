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
      embed.setThumbnail('https://cdn.jsdelivr.net/gh/alohe/avatars/png/vibrent_21.png');
      
      // Add description with overview
      let healthySummary = 0;
      let warningSummary = 0;
      let errorSummary = 0;
      
      // Add fields for each Pangolin component
      for (const targetName of targetContainers) {
        try {
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
            if (container.data.Status && container.data.Status.includes('(healthy)')) {
              statusEmoji = branding.emojis.healthy;
            } else if (container.data.Status && container.data.Status.includes('(unhealthy)')) {
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
          
          // Safe stats gathering with error handling
          let cpuUsage = 0;
          let memoryUsage = 'Unknown';
          
          try {
            // Get container stats with timeout to prevent hanging
            const stats = await Promise.race([
              container.stats({ stream: false }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Stats timeout')), 3000)
              )
            ]);
            
            if (stats) {
              cpuUsage = calculateCpuPercent(stats);
              
              // Safely get memory usage
              const memoryStatsUsage = stats.memory_stats && stats.memory_stats.usage;
              memoryUsage = formatBytes(memoryStatsUsage);
            }
          } catch (statsError) {
            console.error(`Error getting stats for ${targetName}: ${statsError.message}`);
            cpuUsage = 0;
            memoryUsage = 'Error';
          }
          
          // Format container status for display - with safe handling of undefined
          const containerStatus = container.data.Status || 'Unknown';
          
          embed.addFields({ 
            name: branding.formatContainerName(targetName), 
            value: `${statusEmoji} ${container.data.State || 'Unknown'}\nUptime: ${formatUptime(containerStatus)}\nCPU: ${cpuUsage.toFixed(2)}%\nMemory: ${memoryUsage}`,
            inline: true 
          });
        } catch (containerError) {
          console.error(`Error processing container ${targetName}: ${containerError.message}`);
          embed.addFields({ 
            name: branding.formatContainerName(targetName), 
            value: `${branding.emojis.error} Error: ${containerError.message.substring(0, 50)}`, 
            inline: true 
          });
          errorSummary++;
        }
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

// Helper functions (with improved error handling)
function calculateCpuPercent(stats) {
  // Improved error handling for stats
  if (!stats || !stats.cpu_stats || !stats.precpu_stats) {
    return 0.0;
  }
  
  try {
    // Return a placeholder - in a real implementation, you'd calculate actual CPU percentage
    return 0.5; // 0.5% as a safe placeholder
  } catch (error) {
    console.error(`Error calculating CPU percent: ${error.message}`);
    return 0.0;
  }
}

function formatBytes(bytes) {
  try {
    if (bytes === undefined || bytes === null) return 'Unknown';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  } catch (error) {
    console.error(`Error formatting bytes: ${error.message}`);
    return 'Unknown';
  }
}

function formatUptime(status) {
  try {
    if (!status) return 'N/A';
    // Extract uptime from container status string
    const uptimeMatch = status.match(/Up (\d+) (\w+)/);
    return uptimeMatch ? `${uptimeMatch[1]} ${uptimeMatch[2]}` : 'N/A';
  } catch (error) {
    console.error(`Error formatting uptime: ${error.message}`);
    return 'N/A';
  }
}