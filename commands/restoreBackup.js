// commands/restoreBackup.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const backupManager = require("../backend/backupManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("restorebackup")
    .setDescription("Restore from a backup")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List available backups'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('restore')
        .setDescription('Restore from a specific backup')
        .addStringOption(option =>
          option.setName('backup')
            .setDescription('Backup filename')
            .setRequired(true)
            .setAutocomplete(true))),
  
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const { success, backups } = await backupManager.listBackups();
    
    if (!success) {
      await interaction.respond([]);
      return;
    }
    
    // Filter backups based on the focused valu
    const filtered = backups
      .filter(backup => backup.includes(focusedValue))
      .slice(0, 25);
    
    await interaction.respond(
      filtered.map(backup => ({ name: backup, value: backup }))
    );
  },
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'list') {
      await listBackups(interaction);
    } else if (subcommand === 'restore') {
      await restoreFromBackup(interaction);
    }
  }
};

/**
 * List all available backups
 */
async function listBackups(interaction) {
  await interaction.deferReply();
  
  try {
    // Create embed with branding
    const embed = branding.getHeaderEmbed('Available Backups', 'info');
    
    // Get list of backups
    const result = await backupManager.listBackups();
    
    if (!result.success) {
      throw new Error(`Failed to list backups: ${result.error}`);
    }
    
    if (result.backups.length === 0) {
      embed.setDescription(`${branding.emojis.warning} No backups available. Use \`/backup\` to create a backup.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    // Add backups to the embed
    embed.setDescription(`${branding.emojis.healthy} Found ${result.backups.length} backup(s). Use \`/restorebackup restore\` to restore from a specific backup.`);
    
    // Display the most recent 10 backups
    const recentBackups = result.backups.slice(0, 10);
    
    for (const backup of recentBackups) {
      const backupInfo = await backupManager.getBackupInfo(backup);
      
      if (backupInfo.success) {
        const info = backupInfo.info;
        const date = new Date(info.createdAt).toLocaleString();
        
        embed.addFields({
          name: backup,
          value: `Created: ${date}\nSize: ${info.size}`,
          inline: true
        });
      } else {
        embed.addFields({
          name: backup,
          value: 'Error: Could not get backup information',
          inline: true
        });
      }
    }
    
    if (result.backups.length > 10) {
      embed.addFields({
        name: 'More Backups',
        value: `${result.backups.length - 10} more backup(s) not shown.`,
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error listing backups:', error);
    
    // Create error embed with branding
    const errorEmbed = branding.getHeaderEmbed('Error Listing Backups', 'danger');
    errorEmbed.setDescription(`${branding.emojis.error} An error occurred while listing backups.\n\`\`\`${error.message}\`\`\``);
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Restore from a specific backup
 */
async function restoreFromBackup(interaction) {
  await interaction.deferReply();
  
  try {
    const backupName = interaction.options.getString('backup');
    
    // Check if the backup exists
    const backupInfo = await backupManager.getBackupInfo(backupName);
    
    if (!backupInfo.success) {
      throw new Error(`Backup not found: ${backupName}`);
    }
    
    // Create confirmation embed with branding
    const embed = branding.getHeaderEmbed('Restore Confirmation', 'warning');
    
    embed.setDescription(
      `${branding.emojis.warning} **Warning: This will overwrite your current configuration!**\n\n` +
      `You are about to restore from backup: \`${backupName}\`\n` +
      `Created: ${new Date(backupInfo.info.createdAt).toLocaleString()}\n` +
      `Size: ${backupInfo.info.size}\n\n` +
      `This action will:\n` +
      `1. Create a backup of your current configuration\n` +
      `2. Restore the selected backup\n` +
      `3. You may need to restart containers after restore\n\n` +
      `Are you sure you want to proceed?`
    );
    
    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId('confirm')
      .setLabel('Confirm Restore')
      .setStyle(ButtonStyle.Danger);
    
    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);
    
    const row = new ActionRowBuilder()
      .addComponents(confirmButton, cancelButton);
    
    // Send confirmation message
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
      if (i.customId === 'confirm') {
        // Disable buttons to prevent multiple clicks
        confirmButton.setDisabled(true);
        cancelButton.setDisabled(true);
        
        await i.update({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(confirmButton, cancelButton)]
        });
        
        // Update embed
        const restoreEmbed = branding.getHeaderEmbed('Restoring Backup', 'info');
        restoreEmbed.setDescription(`${branding.emojis.loading} Restoring from backup: \`${backupName}\`...`);
        
        await i.editReply({
          embeds: [restoreEmbed],
          components: []
        });
        
        // Perform the restore
        const result = await backupManager.restoreBackup(backupName);
        
        if (!result.success) {
          throw new Error(`Failed to restore backup: ${result.error}`);
        }
        
        // Update embed with success message
        restoreEmbed.setColor(branding.colors.success);
        restoreEmbed.setDescription(
          `${branding.emojis.healthy} Successfully restored from backup: \`${backupName}\`\n\n` +
          `A backup of your previous configuration was created: \`${result.preRestoreBackup}\`\n\n` +
          `You may need to restart your containers with:\n` +
          `\`\`\`docker compose down && docker compose up -d\`\`\``
        );
        
        await i.editReply({ embeds: [restoreEmbed] });
      } else if (i.customId === 'cancel') {
        // Update embed with cancel message
        const cancelEmbed = branding.getHeaderEmbed('Restore Cancelled', 'info');
        cancelEmbed.setDescription(`${branding.emojis.healthy} Restore operation cancelled.`);
        
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
        const timeoutEmbed = branding.getHeaderEmbed('Restore Cancelled', 'info');
        timeoutEmbed.setDescription(`${branding.emojis.warning} Restore confirmation timed out.`);
        
        await interaction.editReply({
          embeds: [timeoutEmbed],
          components: []
        });
      }
    });
  } catch (error) {
    console.error('Error restoring backup:', error);
    
    // Create error embed with branding
    const errorEmbed = branding.getHeaderEmbed('Error Restoring Backup', 'danger');
    errorEmbed.setDescription(`${branding.emojis.error} An error occurred while restoring the backup.\n\`\`\`${error.message}\`\`\``);
    
    await interaction.editReply({
      embeds: [errorEmbed],
      components: []
    });
  }
}