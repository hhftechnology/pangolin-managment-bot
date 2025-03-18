// utils/errorHandler.js
const branding = require('../backend/pangolinBranding');

/**
 * Handles command errors in a standardized way
 * 
 * @param {Error} error - The error that occurred
 * @param {CommandInteraction} interaction - The Discord interaction object
 * @param {string} commandName - Name of the command for logging purposes
 * @param {string} errorTitle - Title for the error embed (optional)
 */
async function handleCommandError(error, interaction, commandName, errorTitle = 'Error') {
  // Log the error to console with command context
  console.error(`Error executing ${commandName} command:`, error);
  
  // Create consistent error embed with branding
  const errorEmbed = branding.getHeaderEmbed(errorTitle, 'danger');
  errorEmbed.setDescription(
    `${branding.emojis.error} An error occurred while executing this command.\n\n` +
    `\`\`\`${error.message}\`\`\``
  );
  
  // Add troubleshooting info if available
  if (error.code) {
    let troubleshootingTip = '';
    
    // Add specific troubleshooting tips based on error codes
    switch (error.code) {
      case 'ECONNREFUSED':
        troubleshootingTip = 'Unable to connect to Docker. Check if Docker daemon is running.';
        break;
      case 'EACCES':
        troubleshootingTip = 'Permission denied. Make sure the bot has appropriate permissions.';
        break;
      default:
        troubleshootingTip = `Error code: ${error.code}`;
    }
    
    errorEmbed.addFields({ name: 'Troubleshooting', value: troubleshootingTip });
  }
  
  try {
    // Check if interaction has already been replied to
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  } catch (replyError) {
    // If we can't reply through the interaction, log this additional error
    console.error(`Failed to send error message to user:`, replyError);
  }
}

module.exports = { handleCommandError };