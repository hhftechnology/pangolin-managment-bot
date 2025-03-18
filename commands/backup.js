// commands/backup.js
const { SlashCommandBuilder } = require("discord.js");
const backupManager = require("../backend/backupManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Create a backup of the Pangolin stack configuration"),
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Create initial embed with branding
      const embed = branding.getHeaderEmbed('Pangolin Backup', 'info');
      embed.setDescription(`${branding.emojis.loading} Creating backup of the Pangolin stack...`);
      
      // Send initial response
      await interaction.editReply({ embeds: [embed] });
      
      // Create the backup
      const result = await backupManager.createBackup();
      
      if (!result.success) {
        throw new Error(`Failed to create backup: ${result.error}`);
      }
      
      // Get info about the created backup
      const backupInfo = await backupManager.getBackupInfo(result.backupName);
      
      // Update the embed with success message
      embed.setColor(branding.colors.success);
      embed.setDescription(`${branding.emojis.healthy} Backup created successfully!`);
      
      // Add backup details
      embed.addFields(
        { name: 'Filename', value: result.backupName, inline: false },
        { name: 'Created', value: new Date(result.timestamp.replace(/-/g, ':')).toLocaleString(), inline: true },
        { name: 'Size', value: backupInfo.success ? backupInfo.info.size : 'Unknown', inline: true }
      );
      
      // Get list of available backups
      const backupsResult = await backupManager.listBackups();
      
      if (backupsResult.success && backupsResult.backups.length > 0) {
        embed.addFields({
          name: 'Available Backups',
          value: `${backupsResult.backups.length} backup(s) available. Use \`/restorebackup\` to view and restore.`,
          inline: false
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error executing backup command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Backup Error', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred while creating the backup.\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};