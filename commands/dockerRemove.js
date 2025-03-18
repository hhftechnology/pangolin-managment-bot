// commands/dockerRemove.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerremove")
    .setDescription("Remove a Docker container")
    .addStringOption(option => 
      option.setName('container')
        .setDescription('The container to remove')
        .setRequired(true)
        .setAutocomplete(true))
    .addBooleanOption(option =>
      option.setName('force')
        .setDescription('Force remove the container (even if running)')
        .setRequired(false)),
        
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
      
      // Get container name and force option
      const containerName = interaction.options.getString('container');
      const force = interaction.options.getBoolean('force') || false;
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed(`Remove Container: ${containerName}`, 'warning');
      embed.setDescription(`${branding.emojis.loading} Attempting to remove container \`${containerName}\`...`);
      
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
      
      // Check if container is running and force flag is not set
      if (container.data.State === 'running' && !force) {
        embed.setColor(branding.colors.warning);
        embed.setDescription(
          `${branding.emojis.warning} Container \`${containerName}\` is currently running.\n\n` +
          `Use \`/dockerremove ${containerName} force:true\` to force remove it, or stop it first with \`/stopcontainer ${containerName}\`.`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      
      // Remove the container
      await container.delete({ force });
      
      // Update embed with success message
      embed.setColor(branding.colors.success);
      embed.setDescription(`${branding.emojis.healthy} Container \`${containerName}\` has been successfully removed.`);
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error removing container:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Removing Container', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while removing the container.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};