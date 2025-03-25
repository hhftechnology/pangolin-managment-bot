// commands/crowdsecHub.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsechub")
    .setDescription("Manage CrowdSec hub resources")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List available hub items')
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Show all hub items, including disabled ones')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Update hub inventory to get latest versions'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('upgrade')
        .setDescription('Upgrade all hub items to their latest versions')
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force upgrade even for tainted items')
            .setRequired(false))),
            
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Check if a subcommand was provided
      let subcommand;
      try {
        subcommand = interaction.options.getSubcommand();
      } catch (error) {
        // No subcommand specified, show formatted help message
        const embed = branding.getHeaderEmbed('CrowdSec Hub', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);
        
        // List subcommands in a format similar to Discord's native options display
        const subcommands = [
          { name: 'list', description: 'List available hub items' },
          { name: 'update', description: 'Update hub inventory to get latest versions' },
          { name: 'upgrade', description: 'Upgrade all hub items to their latest versions' }
        ];
        
        // Format each subcommand in a way that mimics Discord's native option display
        const formattedSubcommands = subcommands.map(cmd => 
          `**/${interaction.commandName} ${cmd.name}** - ${cmd.description}`
        ).join('\n');
        
        embed.addFields({ name: 'Available Subcommands', value: formattedSubcommands });
        
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      
      // Check if CrowdSec container is running
      const containerStatus = await dockerManager.getContainerDetailedStatus('crowdsec');
      
      if (!containerStatus.success) {
        throw new Error(`Failed to check CrowdSec container: ${containerStatus.error || "Unknown error"}`);
      }
      
      if (!containerStatus.exists) {
        throw new Error('CrowdSec container not found');
      }
      
      if (!containerStatus.running) {
        throw new Error('CrowdSec container is not running');
      }
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed(`CrowdSec Hub - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec hub command...`);
      await interaction.editReply({ embeds: [embed] });
      
      // Handle subcommands
      if (subcommand === 'list') {
        // Build command arguments
        const cmd = ['cscli', 'hub', 'list'];
        
        // Add options if provided
        const all = interaction.options.getBoolean('all');
        if (all) cmd.push('-a');
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to list hub items: ${result.error || "Unknown error"}`);
        }
        
        // Create summary embed
        const summaryEmbed = branding.getHeaderEmbed('CrowdSec Hub Items', 'crowdsec');
        summaryEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Hub Items`);
        
        // Add explanation of what hub is
        summaryEmbed.addFields({
          name: 'What is the CrowdSec Hub?',
          value: 'The CrowdSec Hub is a central repository for security components like collections, parsers, scenarios, and postoverflows that enhance your CrowdSec installation.'
        });
        
        // Get the output content
        const hubContent = result.stdout || 'No hub items found.';
        
        // Check if content is empty
        if (hubContent.trim() === 'No hub items found.') {
          summaryEmbed.addFields({ name: 'Results', value: 'No hub items found.' });
          await interaction.editReply({ embeds: [summaryEmbed] });
        } else {
          // Send the hub list as a file attachment
          await interaction.editReply({
            embeds: [summaryEmbed],
            files: [{
              attachment: Buffer.from(hubContent),
              name: `crowdsec-hub-items.txt`
            }]
          });
        }
        
      } else if (subcommand === 'update') {
        // Build command
        const cmd = ['cscli', 'hub', 'update'];
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to update hub: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec Hub updated successfully.`);
        
        // Get the output content
        const updateContent = result.stdout || 'Hub update completed successfully, no output returned.';
        
        // Send the update results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(updateContent),
            name: `crowdsec-hub-update.txt`
          }]
        });
        
      } else if (subcommand === 'upgrade') {
        const force = interaction.options.getBoolean('force');
        
        // Build command
        const cmd = ['cscli', 'hub', 'upgrade'];
        
        if (force) cmd.push('--force');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Upgrading CrowdSec Hub items...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to upgrade hub items: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec Hub items upgraded successfully.`);
        
        // Get the output content
        const upgradeContent = result.stdout || 'Hub upgrade completed successfully, no output returned.';
        
        // Send the upgrade results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(upgradeContent),
            name: `crowdsec-hub-upgrade.txt`
          }]
        });
      }
    } catch (error) {
      console.error('Error executing crowdsecHub command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Hub', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred:\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};