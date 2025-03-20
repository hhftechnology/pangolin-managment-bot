// commands/dockerPrune.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerprune")
    .setDescription("Prune unused Docker images to free up disk space")
    .addBooleanOption(option =>
      option.setName('all')
        .setDescription('Remove all unused images, not just dangling ones')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('force')
        .setDescription('Skip confirmation prompt')
        .setRequired(false)),
        
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Get options
      const pruneAll = interaction.options.getBoolean('all') || false;
      const force = interaction.options.getBoolean('force') || false;
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Prune Images', 'warning');
      
      // Set description based on options
      if (pruneAll) {
        embed.setDescription(
          `${branding.emojis.warning} **Warning:** You are about to remove ALL unused Docker images.\n\n` +
          `This will remove all images that are not currently used by any containers, ` +
          `including those with tags. This operation cannot be undone and may free up significant disk space.`
        );
      } else {
        embed.setDescription(
          `${branding.emojis.warning} **Warning:** You are about to prune dangling Docker images.\n\n` +
          `This will remove images that have no tags and are not referenced by any containers. ` +
          `This operation cannot be undone and may free up disk space.`
        );
      }
      
      // If force option is not set, show confirmation
      if (!force) {
        // Create confirmation buttons
        const confirmButton = new ButtonBuilder()
          .setCustomId('confirm_prune')
          .setLabel(pruneAll ? 'Remove ALL Unused Images' : 'Remove Dangling Images')
          .setStyle(ButtonStyle.Danger);
          
        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_prune')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);
          
        const row = new ActionRowBuilder()
          .addComponents(confirmButton, cancelButton);
          
        const response = await interaction.editReply({
          embeds: [embed],
          components: [row]
        });
        
        // Create button collector
        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000 // 1 minute timeout
        });
        
        collector.on('collect', async i => {
          // Ensure it's the same user
          if (i.user.id !== interaction.user.id) {
            await i.reply({ content: 'This button is not for you!', ephemeral: true });
            return;
          }
          
          // Handle button interaction
          if (i.customId === 'confirm_prune') {
            // Disable buttons to prevent multiple clicks
            confirmButton.setDisabled(true);
            cancelButton.setDisabled(true);
            
            await i.update({
              embeds: [embed],
              components: [new ActionRowBuilder().addComponents(confirmButton, cancelButton)]
            });
            
            // Execute pruning operation
            await executePrune(docker, i, embed, pruneAll);
          } else if (i.customId === 'cancel_prune') {
            // Cancel operation
            const cancelEmbed = branding.getHeaderEmbed('Prune Cancelled', 'info');
            cancelEmbed.setDescription(`${branding.emojis.healthy} Docker image prune operation cancelled.`);
            
            await i.update({
              embeds: [cancelEmbed],
              components: []
            });
          }
          
          collector.stop();
        });
        
        collector.on('end', async collected => {
          if (collected.size === 0) {
            // Timeout - update message
            const timeoutEmbed = branding.getHeaderEmbed('Prune Cancelled', 'info');
            timeoutEmbed.setDescription(`${branding.emojis.warning} Prune confirmation timed out.`);
            
            await interaction.editReply({
              embeds: [timeoutEmbed],
              components: []
            });
          }
        });
      } else {
        // Execute pruning operation immediately when force option is set
        await executePrune(docker, interaction, embed, pruneAll);
      }
    } catch (error) {
      console.error("Error pruning Docker images:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Pruning Docker Images', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while pruning Docker images.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

/**
 * Execute the pruning operation
 */
async function executePrune(docker, interaction, embed, pruneAll) {
  try {
    // Update embed message
    embed.setDescription(`${branding.emojis.loading} Pruning Docker images... This may take a moment.`);
    await interaction.editReply({ embeds: [embed], components: [] });
    
    // Execute pruning operation through the Docker API
    let result;
    
    if (pruneAll) {
      // Prune all unused images
      result = await docker.image.prune({ filters: { dangling: { "false": true } } });
    } else {
      // Prune only dangling images
      result = await docker.image.prune();
    }
    
    // Get response data
    const pruneResult = result.body;
    
    // Check if any images were removed
    const imagesDeleted = pruneResult.ImagesDeleted || [];
    const spaceReclaimed = pruneResult.SpaceReclaimed || 0;
    
    // Convert bytes to human-readable format
    const formattedSpace = formatBytes(spaceReclaimed);
    
    // Update embed with results
    const successEmbed = branding.getHeaderEmbed('Docker Images Pruned', 'success');
    successEmbed.setDescription(`${branding.emojis.healthy} Successfully pruned Docker images.`);
    
    // Add fields with pruning statistics
    successEmbed.addFields(
      { name: 'Images Removed', value: `${imagesDeleted.length}`, inline: true },
      { name: 'Space Reclaimed', value: formattedSpace, inline: true }
    );
    
    // If images were removed, add details
    if (imagesDeleted.length > 0) {
      // Collect untagged and deleted images
      const untaggedImages = imagesDeleted.filter(img => img.Untagged).map(img => img.Untagged);
      const deletedImages = imagesDeleted.filter(img => img.Deleted).map(img => img.Deleted);
      
      // Format the list of removed images
      let removedDetails = '';
      
      if (untaggedImages.length > 0) {
        const displayImages = untaggedImages.slice(0, 15);
        removedDetails += `**Untagged:** ${displayImages.join(', ')}`;
        
        if (untaggedImages.length > 15) {
          removedDetails += `\n...and ${untaggedImages.length - 15} more`;
        }
      }
      
      if (deletedImages.length > 0) {
        if (removedDetails) removedDetails += '\n\n';
        
        const displayImages = deletedImages.slice(0, 15);
        removedDetails += `**Deleted:** ${displayImages.join(', ')}`;
        
        if (deletedImages.length > 15) {
          removedDetails += `\n...and ${deletedImages.length - 15} more`;
        }
      }
      
      if (removedDetails) {
        successEmbed.addFields({ name: 'Details', value: removedDetails });
      }
    } else {
      successEmbed.addFields({ name: 'Note', value: 'No images were removed. Your system may already be clean.' });
    }
    
    await interaction.editReply({ embeds: [successEmbed] });
  } catch (error) {
    console.error("Error executing prune operation:", error);
    
    // Create error embed with branding
    const errorEmbed = branding.getHeaderEmbed('Error Pruning Docker Images', 'danger');
    errorEmbed.setDescription(
      `${branding.emojis.error} An error occurred while pruning Docker images.\n\n` +
      `\`\`\`${error.message}\`\`\``
    );
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}