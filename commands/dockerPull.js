// commands/dockerPull.js
const { SlashCommandBuilder } = require("discord.js");
const { exec } = require('child_process');
const util = require('util');
const branding = require('../backend/pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

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
      
      // Execute the docker pull command
      const pullCommand = `docker pull ${sanitizedImageName}`;
      const pullProcess = exec(pullCommand);
      
      // Variable to store pull progress output
      let pullOutput = '';
      
      // Listen for stdout data
      pullProcess.stdout.on('data', (data) => {
        pullOutput += data;
        
        // Update the message with the current progress
        // But not too frequently to avoid API rate limits
        if (pullOutput.length > 0 && pullOutput.length % 100 === 0) {
          const updatedEmbed = branding.getHeaderEmbed(`Pulling Docker Image: ${sanitizedImageName}`, 'info');
          updatedEmbed.setDescription(
            `${branding.emojis.loading} Pulling image \`${sanitizedImageName}\`...\n\n` +
            `Progress:\n\`\`\`${pullOutput.slice(-1500)}\`\`\``
          );
          
          interaction.editReply({ embeds: [updatedEmbed] }).catch(error => {
            console.error('Error updating embed:', error);
          });
        }
      });
      
      // Listen for stderr data
      pullProcess.stderr.on('data', (data) => {
        pullOutput += `ERROR: ${data}`;
      });
      
      // Wait for the pull to complete
      await new Promise((resolve, reject) => {
        pullProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Pull process exited with code ${code}`));
          }
        });
        
        pullProcess.on('error', (error) => {
          reject(error);
        });
      });
      
      // Update with success message
      const successEmbed = branding.getHeaderEmbed(`Docker Image Pulled: ${sanitizedImageName}`, 'success');
      successEmbed.setDescription(
        `${branding.emojis.healthy} Successfully pulled image \`${sanitizedImageName}\`.\n\n` +
        `You can use this image to create a container with:\n` +
        `\`/dockercreate image:${sanitizedImageName} name:mycontainer\``
      );
      
      // Check if we can get image details
      try {
        const { stdout } = await execPromise(`docker image inspect ${sanitizedImageName} --format "{{.Size}},{{.Created}}"`);
        const [size, created] = stdout.trim().split(',');
        
        if (size && created) {
          const sizeInMB = parseInt(size) / (1024 * 1024);
          const createdDate = new Date(created);
          
          successEmbed.addFields(
            { name: 'Image Size', value: `${sizeInMB.toFixed(2)} MB`, inline: true },
            { name: 'Created', value: createdDate.toLocaleString(), inline: true }
          );
        }
      } catch (inspectError) {
        console.error('Error getting image details:', inspectError);
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