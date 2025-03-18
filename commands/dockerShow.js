// commands/dockerShow.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');
const { handleCommandError } = require('../backend/errorHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockershow")
    .setDescription("Show detailed information about a Docker container")
    .addStringOption(option => 
      option.setName('container')
        .setDescription('The container to inspect')
        .setRequired(true)
        .setAutocomplete(true)),
        
  async autocomplete(interaction) {
    try {
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });

      // Get list of all containers
      const containers = await docker.container.list({ all: true });
      const containersList = containers.map(c => c.data.Names[0].slice(1));

      // Filter by user input
      const focusedValue = interaction.options.getFocused();
      const filtered = containersList.filter(name => 
        name.toLowerCase().includes(focusedValue.toLowerCase())
      );
      
      // Return max 25 results (Discord limit)
      const results = filtered.slice(0, 25).map(name => ({ name, value: name }));
      
      await interaction.respond(results);
    } catch (error) {
      console.error("Error in autocomplete:", error);
      await interaction.respond([]);
    }
  },
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Get container name
      const containerName = interaction.options.getString('container');
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed(`Container Info: ${containerName}`, 'info');
      embed.setDescription(`${branding.emojis.loading} Fetching information for container \`${containerName}\`...`);
      
      // Send initial response
      await interaction.editReply({ embeds: [embed] });
      
      // Find the container
      const containers = await docker.container.list({ 
        all: true, 
        filters: { name: [containerName] } 
      });
      
      if (containers.length === 0) {
        embed.setColor(branding.colors.danger);
        embed.setDescription(`${branding.emojis.error} Container \`${containerName}\` not found.`);
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      
      const container = containers[0];
      
      // Get container detailed information
      const containerDetail = await container.status();
      
      // Format status with emoji
      let statusEmoji;
      if (container.data.State === 'running') {
        statusEmoji = branding.emojis.healthy;
        embed.setColor(branding.colors.success);
      } else if (container.data.State === 'exited') {
        statusEmoji = branding.emojis.error;
        embed.setColor(branding.colors.danger);
      } else {
        statusEmoji = branding.emojis.warning;
        embed.setColor(branding.colors.warning);
      }
      
      // Get container stats if running
      let cpuUsage = 'N/A';
      let memoryUsage = 'N/A';
      
      if (container.data.State === 'running') {
        try {
          const stats = await container.stats({ stream: false });
          
          // Calculate memory usage
          if (stats.memory_stats && stats.memory_stats.usage) {
            const memoryInMB = stats.memory_stats.usage / (1024 * 1024);
            memoryUsage = `${memoryInMB.toFixed(2)} MB`;
          }
          
          // CPU usage (simplified)
          cpuUsage = '< 1%'; // Actual calculation is complex and would require delta sampling
        } catch (statsError) {
          console.error("Error getting stats:", statsError);
        }
      }
      
      // Update embed with container information
      embed.setDescription(`Detailed information for container \`${containerName}\`:`);
      
      // Basic info
      embed.addFields(
        { name: 'Status', value: `${statusEmoji} ${container.data.State || 'Unknown'}`, inline: true },
        { name: 'ID', value: container.data.Id.substring(0, 12), inline: true },
        { name: 'Created', value: new Date(container.data.Created * 1000).toLocaleString(), inline: true }
      );
      
      // Resource usage
      embed.addFields(
        { name: 'CPU Usage', value: cpuUsage, inline: true },
        { name: 'Memory Usage', value: memoryUsage, inline: true },
        { name: 'Image', value: container.data.Image, inline: true }
      );
      
      // Network info
      const networkMode = containerDetail.data.HostConfig.NetworkMode || 'default';
      const networks = containerDetail.data.NetworkSettings.Networks || {};
      const networkInfo = Object.entries(networks).map(([name, config]) => 
        `${name}: ${config.IPAddress}`
      ).join('\n') || 'None';
      
      embed.addFields(
        { name: 'Network Mode', value: networkMode, inline: true },
        { name: 'Networks', value: networkInfo, inline: true }
      );
      
      // Port mappings
      const portMappings = [];
      const ports = containerDetail.data.NetworkSettings.Ports || {};
      
      for (const [containerPort, hostBindings] of Object.entries(ports)) {
        if (hostBindings && hostBindings.length > 0) {
          for (const binding of hostBindings) {
            portMappings.push(`${binding.HostIp}:${binding.HostPort} -> ${containerPort}`);
          }
        } else {
          portMappings.push(`${containerPort} (not published)`);
        }
      }
      
      embed.addFields({
        name: 'Port Mappings',
        value: portMappings.length > 0 ? portMappings.join('\n') : 'None'
      });
      
      // Volumes
      const mounts = containerDetail.data.Mounts || [];
      const volumeInfo = mounts.map(mount => 
        `${mount.Source} -> ${mount.Destination}`
      ).join('\n') || 'None';
      
      embed.addFields({
        name: 'Volumes',
        value: volumeInfo.length > 500 ? volumeInfo.substring(0, 500) + '...' : volumeInfo
      });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      // Use standardized error handling
      await handleCommandError(error, interaction, 'dockershow', 'Container Inspection Error');
    }
  }
};