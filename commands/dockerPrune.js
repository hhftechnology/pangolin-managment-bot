const { SlashCommandBuilder } = require("discord.js");
const { exec } = require('child_process');
const util = require('util');
const branding = require('../backend/pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerprune")
    .setDescription("Prune dangling Docker images to free up space")
    .addBooleanOption(option =>
      option.setName('force')
        .setDescription('Skip confirmation and prune immediately')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('all')
        .setDescription('Prune all unused images, not just dangling ones')
        .setRequired(false)),
        
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get options
      const force = interaction.options.getBoolean('force') || false;
      const pruneAll = interaction.options.getBoolean('all') || false;
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Prune', 'warning');
      
      if (!force) {
        // If not forcing, show confirmation message
        if (pruneAll) {
          embed.setDescription(`${branding.emojis.warning} **Warning**: This will remove ALL unused images, including those not used by any containers.\n\nRun with \`force:true\` to confirm.`);
        } else {
          embed.setDescription(`${branding.emojis.warning} This will remove all dangling images (untagged images not referenced by any container).\n\nRun with \`force:true\` to confirm.`);
        }
        
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      
      // Proceed with pruning
      embed.setDescription(`${branding.emojis.loading} Pruning Docker images...`);
      await interaction.editReply({ embeds: [embed] });
      
      // Build prune command
      let pruneCmd = 'docker image prune -f';
      if (pruneAll) {
        pruneCmd = 'docker image prune -a -f';
      }
      
      // Execute the prune command
      const { stdout, stderr } = await execPromise(pruneCmd);
      
      if (stderr) {
        throw new Error(stderr);
      }
      
      // Format the result
      const spaceReclaimed = stdout.match(/Total reclaimed space: (.+)/);
      const imagesRemoved = stdout.match(/Deleted Images:/);
      
      // Update embed with success message
      embed.setColor(branding.colors.success);
      if (spaceReclaimed && imagesRemoved) {
        embed.setDescription(`${branding.emojis.healthy} Successfully pruned Docker images.\n${spaceReclaimed[0]}`);
      } else if (stdout.includes("Total reclaimed space: 0B")) {
        embed.setDescription(`${branding.emojis.healthy} No unused images to prune.`);
      } else {
        embed.setDescription(`${branding.emojis.healthy} Pruning completed.\n\`\`\`${stdout}\`\`\``);
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error pruning Docker images:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Pruning Images', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while pruning Docker images.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};