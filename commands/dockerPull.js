// commands/dockerPull.js - Modified to use Docker API instead of CLI
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerpull")
    .setDescription("Pull a Docker image")
    .addStringOption(option => 
      option.setName('image')
        .setDescription('The image to pull (e.g., nginx:latest)')
        .setRequired(true)),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get image name
      const imageName = interaction.options.getString('image');
      
      // Validate image name (basic validation)
      if (!imageName || imageName.trim() === '') {
        throw new Error('Invalid image name provided');
      }
      
      // Sanitize input to prevent command injection
      // Only allow alphanumeric characters, dots, dashes, underscores, colons, and slashes
      const sanitizedImageName = imageName.replace(/[^a-zA-Z0-9-_.:/]/g, '');
      
      if (sanitizedImageName !== imageName) {
        throw new Error('Image name contains invalid characters');
      }
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed(`Pulling Docker Image: ${sanitizedImageName}`, 'info');
      embed.setDescription(`${branding.emojis.loading} Starting to pull image \`${sanitizedImageName}\`...\n\nThis operation may take some time depending on the image size and your internet connection.`);
      
      // Send initial response
      await interaction.editReply({ embeds: [embed] });
      
      // Create Docker API client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Use Docker API to pull the image
      const stream = await docker.image.create({}, { fromImage: sanitizedImageName });
      
      // Process the stream to track progress
      let pullOutput = '';
      let lastUpdate = Date.now();
      const UPDATE_INTERVAL = 3000; // Update message every 3 seconds
      
      await new Promise((resolve, reject) => {
        stream.on('data', (data) => {
          try {
            // Parse the JSON data
            const chunk = JSON.parse(data.toString());
            
            if (chunk.status) {
              // Add status update to output with newline
              if (chunk.progress) {
                pullOutput = `${chunk.status}: ${chunk.progress}\n${pullOutput}`;
              } else {
                pullOutput = `${chunk.status}\n${pullOutput}`;
              }
              
              // Limit output length to avoid huge messages
              if (pullOutput.length > 1500) {
                pullOutput = pullOutput.substring(0, 1500) + '...\n(Output truncated)';
              }
              
              // Update the message periodically to avoid rate limiting
              const now = Date.now();
              if (now - lastUpdate > UPDATE_INTERVAL) {
                const updatedEmbed = branding.getHeaderEmbed(`Pulling Docker Image: ${sanitizedImageName}`, 'info');
                updatedEmbed.setDescription(
                  `${branding.emojis.loading} Pulling image \`${sanitizedImageName}\`...\n\n` +
                  `Progress:\n\`\`\`${pullOutput}\`\`\``
                );
                
                interaction.editReply({ embeds: [updatedEmbed] }).catch(error => {
                  console.error('Error updating embed:', error);
                });
                
                lastUpdate = now;
              }
            }
            
            if (chunk.error) {
              reject(new Error(chunk.error));
            }
          } catch (error) {
            // If we can't parse the JSON, just log the error and continue
            console.error('Error parsing pull stream data:', error);
          }
        });
        
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      
      // Get image details after pulling
      let imageDetails = {};
      try {
        const images = await docker.image.list({
          filters: { reference: [sanitizedImageName] }
        });
        
        if (images && images.length > 0) {
          imageDetails = {
            id: images[0].data.Id.substring(0, 12),
            size: formatBytes(images[0].data.Size),
            created: new Date(images[0].data.Created * 1000).toLocaleString()
          };
        }
      } catch (error) {
        console.error('Error getting image details:', error);
        // Continue even if we can't get details
      }
      
      // Update with success message
      const successEmbed = branding.getHeaderEmbed(`Docker Image Pulled: ${sanitizedImageName}`, 'success');
      successEmbed.setDescription(
        `${branding.emojis.healthy} Successfully pulled image \`${sanitizedImageName}\`.\n\n` +
        `You can use this image to create a container with:\n` +
        `\`/dockercreate image:${sanitizedImageName} name:mycontainer\``
      );
      
      // Add image details if available
      if (imageDetails.id) {
        successEmbed.addFields(
          { name: 'Image ID', value: imageDetails.id, inline: true },
          { name: 'Image Size', value: imageDetails.size, inline: true },
          { name: 'Created', value: imageDetails.created, inline: true }
        );
      }
      
      await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      console.error("Error pulling Docker image:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Pulling Docker Image', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while pulling the Docker image.\n\n` +
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