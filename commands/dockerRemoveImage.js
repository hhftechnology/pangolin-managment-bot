// commands/dockerRemoveImage.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerremoveimage")
    .setDescription("Remove a Docker image")
    .addStringOption(option => 
      option.setName('image')
        .setDescription('The image to remove')
        .setRequired(true)
        .setAutocomplete(true))
    .addBooleanOption(option =>
      option.setName('force')
        .setDescription('Force remove the image')
        .setRequired(false)),
        
  async autocomplete(interaction) {
    try {
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });

      // Get list of all images
      const images = await docker.image.list();
      
      // Extract all image names and tags
      const imageOptions = [];
      images.forEach(image => {
        if (image.data.RepoTags && Array.isArray(image.data.RepoTags)) {
          image.data.RepoTags.forEach(tag => {
            if (tag !== '<none>:<none>') {
              imageOptions.push(tag);
            }
          });
        }
      });

      // Filter by user input
      const focusedValue = interaction.options.getFocused();
      const filtered = imageOptions.filter(name => 
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
      
      // Get image name and force option
      const imageName = interaction.options.getString('image');
      const force = interaction.options.getBoolean('force') || false;
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed(`Remove Docker Image: ${imageName}`, 'warning');
      
      // Check if the image exists
      let targetImage = null;
      const images = await docker.image.list();
      
      for (const image of images) {
        if (image.data.RepoTags && image.data.RepoTags.includes(imageName)) {
          targetImage = image;
          break;
        }
      }
      
      if (!targetImage) {
        embed.setColor(branding.colors.danger);
        embed.setDescription(`${branding.emojis.error} Image \`${imageName}\` not found.`);
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      
      // Check if any containers are using this image
      const containers = await docker.container.list({ all: true });
      const dependentContainers = containers.filter(container => 
        container.data.ImageID === targetImage.data.Id
      );
      
      if (dependentContainers.length > 0 && !force) {
        const containerNames = dependentContainers.map(c => 
          c.data.Names[0].slice(1)
        ).join(', ');
        
        embed.setDescription(
          `${branding.emojis.warning} **Warning:** This image is being used by ${dependentContainers.length} container(s).\n` +
          `Containers: \`${containerNames}\`\n\n` +
          `You need to remove these containers first, or use the force option to forcibly remove the image.`
        );
        
        // Add action buttons
        const forceButton = new ButtonBuilder()
          .setCustomId('force_remove')
          .setLabel('Force Remove')
          .setStyle(ButtonStyle.Danger);
          
        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);
          
        const row = new ActionRowBuilder()
          .addComponents(forceButton, cancelButton);
          
        const reply = await interaction.editReply({
          embeds: [embed],
          components: [row]
        });
        
        // Create a collector for button interactions
        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000
        });
        
        collector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) {
            await i.reply({ content: 'This button is not for you!', ephemeral: true });
            return;
          }
          
          if (i.customId === 'force_remove') {
            try {
              await targetImage.remove({ force: true });
              
              embed.setColor(branding.colors.success);
              embed.setDescription(`${branding.emojis.healthy} Image \`${imageName}\` has been forcibly removed.`);
              
              await i.update({ embeds: [embed], components: [] });
            } catch (error) {
              console.error("Error removing image:", error);
              
              embed.setColor(branding.colors.danger);
              embed.setDescription(
                `${branding.emojis.error} An error occurred while removing the image.\n\n` +
                `\`\`\`${error.message}\`\`\``
              );
              
              await i.update({ embeds: [embed], components: [] });
            }
          } else if (i.customId === 'cancel') {
            embed.setColor(branding.colors.info);
            embed.setDescription(`${branding.emojis.healthy} Image removal cancelled.`);
            
            await i.update({ embeds: [embed], components: [] });
          }
          
          collector.stop();
        });
        
        collector.on('end', async collected => {
          if (collected.size === 0) {
            embed.setColor(branding.colors.info);
            embed.setDescription(`${branding.emojis.healthy} Image removal cancelled (timed out).`);
            
            await interaction.editReply({ embeds: [embed], components: [] });
          }
        });
        
        return;
      }
      
      // If we're here, either there are no dependent containers or force=true from the command
      embed.setDescription(`${branding.emojis.loading} Removing image \`${imageName}\`...`);
      await interaction.editReply({ embeds: [embed] });
      
      // Remove the image
      await targetImage.remove({ force });
      
      // Update embed with success message
      embed.setColor(branding.colors.success);
      embed.setDescription(`${branding.emojis.healthy} Image \`${imageName}\` has been successfully removed.`);
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error removing Docker image:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Removing Docker Image', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while removing the Docker image.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};