// utils/responseHandler.js
const branding = require('../backend/pangolinBranding');

/**
 * Handles the initial response for commands in a standardized way
 * 
 * @param {CommandInteraction} interaction - The Discord interaction object
 * @param {string} commandName - Name of the command for logging purposes
 * @param {string} [loadingText] - Custom loading text (optional)
 * @param {string} [status='info'] - Status color to use ('info', 'success', 'warning', 'danger')
 * @returns {Promise<void>}
 */
async function handleCommandStart(interaction, commandName, loadingText, status = 'info') {
  // Always defer reply to ensure we don't hit Discord's 3-second timeout
  await interaction.deferReply();
  
  // Log command execution
  console.log(`Executing ${commandName} command for user ${interaction.user.tag}`);
  
  // Create loading message if needed
  if (loadingText) {
    const loadingEmbed = branding.getHeaderEmbed(commandName, status);
    loadingEmbed.setDescription(`${branding.emojis.loading} ${loadingText}`);
    
    // Send loading message
    await interaction.editReply({ embeds: [loadingEmbed] });
  }
}

/**
 * Handles the successful response for commands in a standardized way
 * 
 * @param {CommandInteraction} interaction - The Discord interaction object
 * @param {Object} embedOptions - Options for the success embed
 * @param {string} embedOptions.title - Title of the embed
 * @param {string} embedOptions.description - Description for the embed
 * @param {Array} [embedOptions.fields] - Fields to add to the embed
 * @param {string} [embedOptions.status='success'] - Status color ('success', 'info', 'warning')
 * @param {Object} [additionalOptions] - Additional options like components
 * @returns {Promise<Message>} - The sent message
 */
async function handleCommandSuccess(interaction, embedOptions, additionalOptions = {}) {
  const { title, description, fields = [], status = 'success' } = embedOptions;
  
  // Create success embed
  const successEmbed = branding.getHeaderEmbed(title, status);
  successEmbed.setDescription(description);
  
  // Add any fields
  if (fields && fields.length > 0) {
    fields.forEach(field => successEmbed.addFields(field));
  }
  
  // Prepare reply options
  const replyOptions = {
    embeds: [successEmbed],
    ...additionalOptions
  };
  
  // Send the success message
  return await interaction.editReply(replyOptions);
}

module.exports = {
  handleCommandStart,
  handleCommandSuccess
};