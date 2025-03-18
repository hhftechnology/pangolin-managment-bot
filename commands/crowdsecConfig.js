// commands/crowdsecConfig.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecconfig")
    .setDescription("Manage CrowdSec configurations and rules")
    .addSubcommandGroup(group =>
      group
        .setName('appsec-configs')
        .setDescription('Manage Application Security configurations')
        .addSubcommand(subcommand =>
          subcommand
            .setName('list')
            .setDescription('List installed AppSec configurations')
            .addBooleanOption(option =>
              option.setName('all')
                .setDescription('Show all configurations')
                .setRequired(false)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('inspect')
            .setDescription('Inspect AppSec configuration')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Name of the configuration to inspect')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('install')
            .setDescription('Install AppSec configuration')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Name of the configuration to install')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('remove')
            .setDescription('Remove AppSec configuration')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Name of the configuration to remove')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('upgrade')
            .setDescription('Upgrade AppSec configuration')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Name of the configuration to upgrade')
                .setRequired(true))))
    .addSubcommandGroup(group =>
      group
        .setName('appsec-rules')
        .setDescription('Manage Application Security rules')
        .addSubcommand(subcommand =>
          subcommand
            .setName('list')
            .setDescription('List installed AppSec rules')
            .addBooleanOption(option =>
              option.setName('all')
                .setDescription('Show all rules')
                .setRequired(false)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('inspect')
            .setDescription('Inspect AppSec rules')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Name of the rules to inspect')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('install')
            .setDescription('Install AppSec rules')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Name of the rules to install')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('remove')
            .setDescription('Remove AppSec rules')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Name of the rules to remove')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('upgrade')
            .setDescription('Upgrade AppSec rules')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Name of the rules to upgrade')
                .setRequired(true)))),
            
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Check if subcommand group and subcommand were provided
      let group, subcommand;
      try {
        group = interaction.options.getSubcommandGroup();
        subcommand = interaction.options.getSubcommand();
      } catch (error) {
        // No subcommand group or subcommand specified, show formatted help message
        const embed = branding.getHeaderEmbed('CrowdSec Configuration', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these command options:`);
        
        // List subcommand groups and their subcommands
        const groups = [
          { 
            name: 'appsec-configs',
            description: 'Application Security Configurations',
            subcommands: [
              { name: 'list', description: 'List all AppSec configurations' },
              { name: 'inspect', description: 'Examine an AppSec configuration' },
              { name: 'install', description: 'Install a new AppSec configuration' },
              { name: 'remove', description: 'Remove an AppSec configuration' },
              { name: 'upgrade', description: 'Upgrade an AppSec configuration' }
            ]
          },
          {
            name: 'appsec-rules',
            description: 'Application Security Rules',
            subcommands: [
              { name: 'list', description: 'List all AppSec rules' },
              { name: 'inspect', description: 'Examine an AppSec rule' },
              { name: 'install', description: 'Install a new AppSec rule' },
              { name: 'remove', description: 'Remove an AppSec rule' },
              { name: 'upgrade', description: 'Upgrade an AppSec rule' }
            ]
          }
        ];
        
        // Format each group and its subcommands
        for (const group of groups) {
          const groupCommands = group.subcommands.map(cmd => 
            `**/${interaction.commandName} ${group.name} ${cmd.name}** - ${cmd.description}`
          ).join('\n');
          
          embed.addFields({ 
            name: group.description, 
            value: groupCommands
          });
        }
        
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
      const embed = branding.getHeaderEmbed(`CrowdSec ${group} - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec ${group} ${subcommand} command...`);
      await interaction.editReply({ embeds: [embed] });
      
      // Handle commands based on group and subcommand
      if (group === 'appsec-configs') {
        // Build the base command
        const baseCmd = ['cscli', 'appsec-configs'];
        
        // Handle specific subcommands
        if (subcommand === 'list') {
          const cmd = [...baseCmd, 'list'];
          const all = interaction.options.getBoolean('all');
          
          if (all) cmd.push('-a');
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to list AppSec configs: ${result.error || "Unknown error"}`);
          }
          
          // Create summary embed
          const summaryEmbed = branding.getHeaderEmbed('CrowdSec AppSec Configurations', 'crowdsec');
          summaryEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Application Security Configurations`);
          
          // Add explanation of what AppSec configs are
          summaryEmbed.addFields({
            name: 'What Are AppSec Configurations?',
            value: 'Application Security configurations define rulesets that protect web applications from common attacks and vulnerabilities, such as SQL injection, XSS, and other OWASP Top 10 threats.'
          });
          
          // Get the output content
          const configsContent = result.stdout || 'No AppSec configurations found.';
          
          // Check if content is empty
          if (configsContent.trim() === 'No AppSec configurations found.') {
            summaryEmbed.addFields({ name: 'Results', value: 'No AppSec configurations found.' });
            await interaction.editReply({ embeds: [summaryEmbed] });
          } else {
            // Send the configs list as a file attachment
            await interaction.editReply({
              embeds: [summaryEmbed],
              files: [{
                attachment: Buffer.from(configsContent),
                name: `crowdsec-appsec-configs.txt`
              }]
            });
          }
          
        } else if (subcommand === 'inspect') {
          const name = interaction.options.getString('name');
          const cmd = [...baseCmd, 'inspect', name];
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to inspect AppSec config: ${result.error || "Unknown error"}`);
          }
          
          // Create summary embed
          const inspectEmbed = branding.getHeaderEmbed(`CrowdSec AppSec Configuration: ${name}`, 'crowdsec');
          inspectEmbed.setDescription(`${branding.emojis.crowdsec} Configuration: ${name} inspection results`);
          
          // Get the output content
          const inspectContent = result.stdout || 'No configuration details found.';
          
          // Send the inspection results as a file attachment
          await interaction.editReply({
            embeds: [inspectEmbed],
            files: [{
              attachment: Buffer.from(inspectContent),
              name: `crowdsec-appsec-config-${name}.txt`
            }]
          });
          
        } else if (subcommand === 'install') {
          const name = interaction.options.getString('name');
          const cmd = [...baseCmd, 'install', name];
          
          // Update embed description
          embed.setDescription(`${branding.emojis.loading} Installing AppSec configuration: ${name}...`);
          await interaction.editReply({ embeds: [embed] });
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to install AppSec config: ${result.error || "Unknown error"}`);
          }
          
          // Update embed
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} Successfully installed AppSec configuration: ${name}`);
          
          // Get the output content
          const installContent = result.stdout || 'No installation details returned.';
          
          // Send the installation results as a file attachment
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(installContent),
              name: `crowdsec-appsec-config-install.txt`
            }]
          });
          
        } else if (subcommand === 'remove') {
          const name = interaction.options.getString('name');
          const cmd = [...baseCmd, 'remove', name];
          
          // Update embed description
          embed.setDescription(`${branding.emojis.loading} Removing AppSec configuration: ${name}...`);
          await interaction.editReply({ embeds: [embed] });
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to remove AppSec config: ${result.error || "Unknown error"}`);
          }
          
          // Update embed
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} Successfully removed AppSec configuration: ${name}`);
          
          // Get the output content
          const removeContent = result.stdout || 'No removal details returned.';
          
          // Send the removal results as a file attachment
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(removeContent),
              name: `crowdsec-appsec-config-remove.txt`
            }]
          });
          
        } else if (subcommand === 'upgrade') {
          const name = interaction.options.getString('name');
          const cmd = [...baseCmd, 'upgrade', name];
          
          // Update embed description
          embed.setDescription(`${branding.emojis.loading} Upgrading AppSec configuration: ${name}...`);
          await interaction.editReply({ embeds: [embed] });
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to upgrade AppSec config: ${result.error || "Unknown error"}`);
          }
          
          // Update embed
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} Successfully upgraded AppSec configuration: ${name}`);
          
          // Get the output content
          const upgradeContent = result.stdout || 'No upgrade details returned.';
          
          // Send the upgrade results as a file attachment
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(upgradeContent),
              name: `crowdsec-appsec-config-upgrade.txt`
            }]
          });
        }
        
      } else if (group === 'appsec-rules') {
        // Build the base command
        const baseCmd = ['cscli', 'appsec-rules'];
        
        // Handle specific subcommands
        if (subcommand === 'list') {
          const cmd = [...baseCmd, 'list'];
          const all = interaction.options.getBoolean('all');
          
          if (all) cmd.push('-a');
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to list AppSec rules: ${result.error || "Unknown error"}`);
          }
          
          // Create summary embed
          const summaryEmbed = branding.getHeaderEmbed('CrowdSec AppSec Rules', 'crowdsec');
          summaryEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Application Security Rules`);
          
          // Add explanation of what AppSec rules are
          summaryEmbed.addFields({
            name: 'What Are AppSec Rules?',
            value: 'Application Security rules are individual security checks that detect and block specific attack patterns against web applications. These rules can be organized into configurations to protect different types of applications.'
          });
          
          // Get the output content
          const rulesContent = result.stdout || 'No AppSec rules found.';
          
          // Check if content is empty
          if (rulesContent.trim() === 'No AppSec rules found.') {
            summaryEmbed.addFields({ name: 'Results', value: 'No AppSec rules found.' });
            await interaction.editReply({ embeds: [summaryEmbed] });
          } else {
            // Send the rules list as a file attachment
            await interaction.editReply({
              embeds: [summaryEmbed],
              files: [{
                attachment: Buffer.from(rulesContent),
                name: `crowdsec-appsec-rules.txt`
              }]
            });
          }
          
        } else if (subcommand === 'inspect') {
          const name = interaction.options.getString('name');
          const cmd = [...baseCmd, 'inspect', name];
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to inspect AppSec rules: ${result.error || "Unknown error"}`);
          }
          
          // Create summary embed
          const inspectEmbed = branding.getHeaderEmbed(`CrowdSec AppSec Rules: ${name}`, 'crowdsec');
          inspectEmbed.setDescription(`${branding.emojis.crowdsec} Rules: ${name} inspection results`);
          
          // Get the output content
          const inspectContent = result.stdout || 'No rules details found.';
          
          // Send the inspection results as a file attachment
          await interaction.editReply({
            embeds: [inspectEmbed],
            files: [{
              attachment: Buffer.from(inspectContent),
              name: `crowdsec-appsec-rules-${name}.txt`
            }]
          });
          
        } else if (subcommand === 'install') {
          const name = interaction.options.getString('name');
          const cmd = [...baseCmd, 'install', name];
          
          // Update embed description
          embed.setDescription(`${branding.emojis.loading} Installing AppSec rules: ${name}...`);
          await interaction.editReply({ embeds: [embed] });
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to install AppSec rules: ${result.error || "Unknown error"}`);
          }
          
          // Update embed
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} Successfully installed AppSec rules: ${name}`);
          
          // Get the output content
          const installContent = result.stdout || 'No installation details returned.';
          
          // Send the installation results as a file attachment
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(installContent),
              name: `crowdsec-appsec-rules-install.txt`
            }]
          });
          
        } else if (subcommand === 'remove') {
          const name = interaction.options.getString('name');
          const cmd = [...baseCmd, 'remove', name];
          
          // Update embed description
          embed.setDescription(`${branding.emojis.loading} Removing AppSec rules: ${name}...`);
          await interaction.editReply({ embeds: [embed] });
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to remove AppSec rules: ${result.error || "Unknown error"}`);
          }
          
          // Update embed
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} Successfully removed AppSec rules: ${name}`);
          
          // Get the output content
          const removeContent = result.stdout || 'No removal details returned.';
          
          // Send the removal results as a file attachment
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(removeContent),
              name: `crowdsec-appsec-rules-remove.txt`
            }]
          });
          
        } else if (subcommand === 'upgrade') {
          const name = interaction.options.getString('name');
          const cmd = [...baseCmd, 'upgrade', name];
          
          // Update embed description
          embed.setDescription(`${branding.emojis.loading} Upgrading AppSec rules: ${name}...`);
          await interaction.editReply({ embeds: [embed] });
          
          // Execute command
          const result = await dockerManager.executeInContainer('crowdsec', cmd);
          
          if (!result.success) {
            throw new Error(`Failed to upgrade AppSec rules: ${result.error || "Unknown error"}`);
          }
          
          // Update embed
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} Successfully upgraded AppSec rules: ${name}`);
          
          // Get the output content
          const upgradeContent = result.stdout || 'No upgrade details returned.';
          
          // Send the upgrade results as a file attachment
          await interaction.editReply({
            embeds: [embed],
            files: [{
              attachment: Buffer.from(upgradeContent),
              name: `crowdsec-appsec-rules-upgrade.txt`
            }]
          });
        }
      }
    } catch (error) {
      console.error('Error executing crowdsecConfig command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Configuration', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred:\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};