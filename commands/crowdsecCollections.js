// commands/crowdsecCollections.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdseccollections")
    .setDescription("Manage CrowdSec collections")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List installed collections')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Collection name to filter')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Show all collections')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('inspect')
        .setDescription('Inspect a specific collection')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Collection name to inspect')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('install')
        .setDescription('Install collections')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Collection name(s) to install (comma-separated)')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force install: overwrite tainted and outdated files')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('download_only')
            .setDescription('Only download packages, do not enable')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove collections')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Collection name(s) to remove (comma-separated)')
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('purge')
            .setDescription('Delete source file too')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force remove: remove tainted and outdated files')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Remove all collections')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('upgrade')
        .setDescription('Upgrade collections')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Collection name(s) to upgrade (comma-separated)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('all')
            .setDescription('Upgrade all collections')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force upgrade: overwrite tainted and outdated files')
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
        const embed = branding.getHeaderEmbed('CrowdSec Collections', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);
        
        // List subcommands in a format similar to Discord's native options display
        const subcommands = [
          { name: 'list', description: 'List installed collections' },
          { name: 'inspect', description: 'View details of a specific collection' },
          { name: 'install', description: 'Install new collections' },
          { name: 'remove', description: 'Remove installed collections' },
          { name: 'upgrade', description: 'Upgrade existing collections' }
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
      const embed = branding.getHeaderEmbed(`CrowdSec Collections - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec collections command...`);
      await interaction.editReply({ embeds: [embed] });
      
      // Handle subcommands
      if (subcommand === 'list') {
        // Build command arguments
        const cmd = ['cscli', 'collections', 'list'];
        
        // Add names if provided
        const name = interaction.options.getString('name');
        const all = interaction.options.getBoolean('all');
        
        if (name) {
          // Split comma-separated names
          const names = name.split(',').map(n => n.trim());
          cmd.push(...names);
        } else if (all) {
          cmd.push('-a');
        }
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to list collections: ${result.error || "Unknown error"}`);
        }
        
        // Create summary embed
        const summaryEmbed = branding.getHeaderEmbed('CrowdSec Collections', 'crowdsec');
        summaryEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Collections`);
        
        // Add explanation of what collections are
        summaryEmbed.addFields({
          name: 'What Are Collections?',
          value: 'Collections are bundles that include parsers, scenarios, postoverflows, and other resources. They provide a way to install a complete set of rules for a specific service or use case.'
        });
        
        // Get the output content
        const collectionsContent = result.stdout || 'No collections found.';
        
        // Check if content is empty
        if (collectionsContent.trim() === 'No collections found.') {
          summaryEmbed.addFields({ name: 'Results', value: 'No collections found.' });
          await interaction.editReply({ embeds: [summaryEmbed] });
        } else {
          // Send the collections list as a file attachment
          await interaction.editReply({
            embeds: [summaryEmbed],
            files: [{
              attachment: Buffer.from(collectionsContent),
              name: `crowdsec-collections.txt`
            }]
          });
        }
        
      } else if (subcommand === 'inspect') {
        const name = interaction.options.getString('name');
        
        // Build command
        const cmd = ['cscli', 'collections', 'inspect', name];
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to inspect collection: ${result.error || "Unknown error"}`);
        }
        
        // Create summary embed
        const inspectEmbed = branding.getHeaderEmbed(`CrowdSec Collection Inspection: ${name}`, 'crowdsec');
        inspectEmbed.setDescription(`${branding.emojis.crowdsec} Collection: ${name} inspection results`);
        
        // Get the output content
        const inspectContent = result.stdout || 'No collection details found.';
        
        // Send the inspection results as a file attachment
        await interaction.editReply({
          embeds: [inspectEmbed],
          files: [{
            attachment: Buffer.from(inspectContent),
            name: `crowdsec-collection-${name}.txt`
          }]
        });
        
      } else if (subcommand === 'install') {
        const name = interaction.options.getString('name');
        const force = interaction.options.getBoolean('force');
        const downloadOnly = interaction.options.getBoolean('download_only');
        
        // Split comma-separated names
        const names = name.split(',').map(n => n.trim());
        
        // Build command
        const cmd = ['cscli', 'collections', 'install', ...names];
        
        if (force) cmd.push('--force');
        if (downloadOnly) cmd.push('--download-only');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Installing CrowdSec collection(s): ${name}...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to install collection(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec collection(s) installed successfully.`);
        
        // Get the output content
        const installContent = result.stdout || 'No installation details returned.';
        
        // Send the installation results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(installContent),
            name: `crowdsec-collection-install.txt`
          }]
        });
        
      } else if (subcommand === 'remove') {
        const name = interaction.options.getString('name');
        const purge = interaction.options.getBoolean('purge');
        const force = interaction.options.getBoolean('force');
        const all = interaction.options.getBoolean('all');
        
        // Build command
        const cmd = ['cscli', 'collections', 'remove'];
        
        if (all) {
          cmd.push('--all');
        } else {
          // Split comma-separated names
          const names = name.split(',').map(n => n.trim());
          cmd.push(...names);
        }
        
        if (purge) cmd.push('--purge');
        if (force) cmd.push('--force');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Removing CrowdSec collection(s)...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to remove collection(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec collection(s) removed successfully.`);
        
        // Get the output content
        const removeContent = result.stdout || 'No removal details returned.';
        
        // Send the removal results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(removeContent),
            name: `crowdsec-collection-remove.txt`
          }]
        });
        
      } else if (subcommand === 'upgrade') {
        const name = interaction.options.getString('name');
        const all = interaction.options.getBoolean('all');
        const force = interaction.options.getBoolean('force');
        
        // Build command
        const cmd = ['cscli', 'collections', 'upgrade'];
        
        if (all) {
          cmd.push('--all');
        } else if (name) {
          // Split comma-separated names
          const names = name.split(',').map(n => n.trim());
          cmd.push(...names);
        } else {
          throw new Error('Either collection name or --all option must be provided');
        }
        
        if (force) cmd.push('--force');
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Upgrading CrowdSec collection(s)...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to upgrade collection(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} CrowdSec collection(s) upgraded successfully.`);
        
        // Get the output content
        const upgradeContent = result.stdout || 'No upgrade details returned.';
        
        // Send the upgrade results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(upgradeContent),
            name: `crowdsec-collection-upgrade.txt`
          }]
        });
      }
    } catch (error) {
      console.error('Error executing crowdsecCollections command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Collections', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred:\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};