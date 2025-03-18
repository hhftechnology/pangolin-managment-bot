// commands/dockerImages.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');
const { handleCommandError } = require('../backend/errorHandler');
const { handleCommandStart, handleCommandSuccess } = require('../backend/responseHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerimages")
    .setDescription("List all Docker images")
    .addStringOption(option => 
      option.setName('filter')
        .setDescription('Filter images by name')
        .setRequired(false)),
  
  async execute(interaction) {
    try {
      // Use standardized command start
      await handleCommandStart(
        interaction, 
        'dockerimages', 
        'Fetching Docker images...'
      );
      
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Get filter option if provided
      const filter = interaction.options.getString('filter');
      
      // Get all images
      const images = await docker.image.list();
      
      // Filter images if filter parameter is provided
      let filteredImages = images;
      if (filter) {
        filteredImages = images.filter(image => {
          // Check if any tag includes the filter string
          if (image.data.RepoTags && Array.isArray(image.data.RepoTags)) {
            return image.data.RepoTags.some(tag => 
              tag.toLowerCase().includes(filter.toLowerCase())
            );
          }
          return false;
        });
      }
      
      // If no images found
      if (filteredImages.length === 0) {
        let description;
        if (filter) {
          description = `${branding.emojis.warning} No images found matching filter: \`${filter}\``;
        } else {
          description = `${branding.emojis.warning} No Docker images found on this host.`;
        }
        
        // Use standardized success handler with warning status
        return await handleCommandSuccess(interaction, {
          title: 'Docker Images',
          description,
          status: 'warning'
        });
      }
      
      // Prepare description based on filter
      let description;
      if (filter) {
        description = `${branding.emojis.healthy} Found ${filteredImages.length} Docker images matching filter: \`${filter}\``;
      } else {
        description = `${branding.emojis.healthy} Found ${filteredImages.length} Docker images`;
      }
      
      // Prepare image information for display
      const imageInfoFields = [];
      
      filteredImages.forEach(image => {
        const tags = image.data.RepoTags || ['<none>:<none>'];
        const tagsList = tags.filter(tag => tag !== '<none>:<none>').join('\n');
        
        // Format creation date
        const createdDate = new Date(image.data.Created * 1000).toLocaleString();
        
        // Format size
        const size = formatBytes(image.data.Size);
        
        // Truncate image ID
        const id = image.data.Id.replace('sha256:', '').substring(0, 12);
        
        imageInfoFields.push({
          name: tagsList || '<untagged>',
          value: `ID: \`${id}\`\nSize: ${size}\nCreated: ${createdDate}`,
          inline: true
        });
      });
      
      // Add fields to embed (Discord has a limit of 25 fields per embed)
      const maxFieldsPerEmbed = 25;
      
      if (imageInfoFields.length <= maxFieldsPerEmbed) {
        // Use standardized success handler
        await handleCommandSuccess(interaction, {
          title: 'Docker Images',
          description,
          fields: imageInfoFields,
          status: 'success'
        });
      } else {
        // Create multiple embeds for large number of images
        const numberOfEmbeds = Math.ceil(imageInfoFields.length / maxFieldsPerEmbed);
        const embeds = [];
        
        for (let i = 0; i < numberOfEmbeds; i++) {
          const startIdx = i * maxFieldsPerEmbed;
          const endIdx = Math.min(startIdx + maxFieldsPerEmbed, imageInfoFields.length);
          
          const newEmbed = branding.getHeaderEmbed(`Docker Images (${i+1}/${numberOfEmbeds})`, 'info');
          
          if (i === 0) {
            // First embed keeps the description
            newEmbed.setDescription(description);
          }
          
          // Add fields to this embed
          imageInfoFields.slice(startIdx, endIdx).forEach(field => newEmbed.addFields(field));
          
          embeds.push(newEmbed);
        }
        
        // Send first embed as edit to the initial reply
        await interaction.editReply({ embeds: [embeds[0]] });
        
        // Send additional embeds as follow-up messages
        for (let i = 1; i < embeds.length; i++) {
          await interaction.followUp({ embeds: [embeds[i]] });
        }
      }
    } catch (error) {
      // Use standardized error handling
      await handleCommandError(error, interaction, 'dockerimages', 'Error Listing Docker Images');
    }
  }
};

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}