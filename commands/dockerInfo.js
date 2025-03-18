// commands/dockerInfo.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const { exec } = require('child_process');
const util = require('util');
const branding = require('../backend/pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerinfo")
    .setDescription("Show information about the Docker host"),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Host Information', 'info');
      embed.setDescription(`${branding.emojis.loading} Fetching Docker host information...`);
      
      // Send initial response
      await interaction.editReply({ embeds: [embed] });
      
      // Get Docker version
      const version = await docker.version();
      
      // Get Docker system info
      const info = await docker.info();
      
      // Get container and image counts
      const containers = await docker.container.list({ all: true });
      const images = await docker.image.list();
      
      // Get disk usage info if available
      let diskUsageInfo = { containers: '0B', images: '0B', volumes: '0B' };
      
      try {
        const containers = await docker.container.list({ all: true });
        const images = await docker.image.list();
        
        let totalImageSize = 0;
        images.forEach(image => {
          if (image.data.Size) {
            totalImageSize += image.data.Size;
          }
        });
        
        diskUsageInfo.images = formatBytes(totalImageSize);
        diskUsageInfo.containers = `${containers.length} container(s)`;
      } catch (error) {
        console.error('Error getting disk usage info:', error);
      }
      
      // Update embed with Docker information
      embed.setDescription(`${branding.emojis.healthy} Docker host information`);
      
      // Version information
      embed.addFields(
        { 
          name: '🐳 Docker Version', 
          value: `Version: ${version.Version}\nAPI: ${version.ApiVersion}\nGo: ${version.GoVersion}`,
          inline: false
        }
      );
      
      // System information
      embed.addFields(
        { 
          name: '💻 System Information', 
          value: [
            `Operating System: ${info.OperatingSystem}`,
            `Architecture: ${info.Architecture}`,
            `Kernel Version: ${info.KernelVersion}`,
            `CPUs: ${info.NCPU}`,
            `Memory: ${formatBytes(info.MemTotal)}`
          ].join('\n'),
          inline: false
        }
      );
      
      // Resources information
      embed.addFields(
        { 
          name: '📊 Resources', 
          value: [
            `Total Containers: ${containers.length} (${containers.filter(c => c.data.State === 'running').length} running)`,
            `Total Images: ${images.length}`,
            `Storage Driver: ${info.Driver}`,
            `Logging Driver: ${info.LoggingDriver}`
          ].join('\n'),
          inline: false
        }
      );
      
      // Disk usage information
      if (diskUsageInfo) {
        embed.addFields(
          { 
            name: '💾 Disk Usage', 
            value: [
              `Images: ${diskUsageInfo.images}`,
              `Containers: ${diskUsageInfo.containers}`,
              `Volumes: ${diskUsageInfo.volumes}`
            ].join('\n'),
            inline: false
          }
        );
      }
      
      // Security information
      const securityOptions = info.SecurityOptions || [];
      embed.addFields(
        { 
          name: '🔒 Security', 
          value: securityOptions.length > 0 
            ? securityOptions.join('\n')
            : 'No security options found',
          inline: false
        }
      );
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error fetching Docker info:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Fetching Docker Info', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while fetching Docker host information.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}