// commands/crowdsecMachines.js
const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecmachines")
    .setDescription("Manage CrowdSec machines")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List registered machines'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a new machine')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name for the machine')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('password')
            .setDescription('Password for the machine (leave empty for auto-generated)')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('auto')
            .setDescription('Auto-generate credentials')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a machine')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the machine to delete')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('validate')
        .setDescription('Validate a machine')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the machine to validate')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('prune')
        .setDescription('Prune unused machines')),
            
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Check if a subcommand was provided
      let subcommand;
      try {
        subcommand = interaction.options.getSubcommand();
      } catch (error) {
        // No subcommand specified, show formatted help message
        const embed = branding.getHeaderEmbed('CrowdSec Machines', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);
        
        // List subcommands in a format similar to Discord's native options display
        const subcommands = [
          { name: 'list', description: 'List registered machines' },
          { name: 'add', description: 'Add a new machine' },
          { name: 'delete', description: 'Delete a machine' },
          { name: 'validate', description: 'Validate a machine' },
          { name: 'prune', description: 'Clean up unused machines' }
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
      const embed = branding.getHeaderEmbed(`CrowdSec Machines - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec machines command...`);
      await interaction.editReply({ embeds: [embed] });
      
      // Handle subcommands
      if (subcommand === 'list') {
        // Build command
        const cmd = ['cscli', 'machines', 'list'];
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to list machines: ${result.error || "Unknown error"}`);
        }
        
        // Create summary embed
        const summaryEmbed = branding.getHeaderEmbed('CrowdSec Machines', 'crowdsec');
        summaryEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Machines`);
        
        // Add explanation of what machines are
        summaryEmbed.addFields({
          name: 'What Are Machines?',
          value: 'Machines in CrowdSec represent individual CrowdSec instances that can share security information. They allow setting up distributed detection and coordinated responses to threats across multiple systems.'
        });
        
        // Get the output content
        const machinesContent = result.stdout || 'No machines found.';
        
        // Check if content is empty
        if (machinesContent.trim() === 'No machines found.') {
          summaryEmbed.addFields({ name: 'Results', value: 'No machines found.' });
          await interaction.editReply({ embeds: [summaryEmbed] });
        } else {
          // Send the machines list as a file attachment
          await interaction.editReply({
            embeds: [summaryEmbed],
            files: [{
              attachment: Buffer.from(machinesContent),
              name: `crowdsec-machines.txt`
            }]
          });
        }
        
      } else if (subcommand === 'add') {
        const name = interaction.options.getString('name');
        const password = interaction.options.getString('password');
        const auto = interaction.options.getBoolean('auto');
        
        // Build command
        const cmd = ['cscli', 'machines', 'add', name];
        
        if (auto || !password) {
          cmd.push('--auto');
        } else {
          cmd.push('--password', password);
        }
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Adding CrowdSec machine: ${name}...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to add machine: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully added machine: ${name}`);
        
        // Extract credentials if auto-generated
        let credentials = '';
        if (result.stdout && (result.stdout.includes('password') || result.stdout.includes('API key'))) {
          // Try to extract password and API key
          const passwordMatch = result.stdout.match(/password: ([a-zA-Z0-9]+)/);
          const apiKeyMatch = result.stdout.match(/API key: ([a-zA-Z0-9]+)/);
          
          if (passwordMatch && passwordMatch[1]) {
            credentials += `Password: \`${passwordMatch[1]}\`\n`;
          }
          
          if (apiKeyMatch && apiKeyMatch[1]) {
            credentials += `API Key: \`${apiKeyMatch[1]}\``;
          }
        }
        
        if (credentials) {
          embed.addFields({ 
            name: 'Credentials', 
            value: `${credentials}\n*Save these credentials! They will not be shown again.*`
          });
        }
        
        // Remove sensitive information from output for file attachment
        let sanitizedOutput = result.stdout || 'No output returned.';
        
        // Replace passwords and keys with [REDACTED]
        const passwordRegex = /password: ([a-zA-Z0-9]+)/g;
        const apiKeyRegex = /API key: ([a-zA-Z0-9]+)/g;
        
        sanitizedOutput = sanitizedOutput.replace(passwordRegex, 'password: [REDACTED]');
        sanitizedOutput = sanitizedOutput.replace(apiKeyRegex, 'API key: [REDACTED]');
        
        // Send the sanitized output as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(sanitizedOutput),
            name: `crowdsec-machine-add.txt`
          }]
        });
        
      } else if (subcommand === 'delete') {
        const name = interaction.options.getString('name');
        
        // Build command
        const cmd = ['cscli', 'machines', 'delete', name];
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Deleting CrowdSec machine: ${name}...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to delete machine: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully deleted machine: ${name}`);
        
        // Get the output content
        const deleteContent = result.stdout || 'No deletion details returned.';
        
        // Send the deletion results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(deleteContent),
            name: `crowdsec-machine-delete.txt`
          }]
        });
        
      } else if (subcommand === 'validate') {
        const name = interaction.options.getString('name');
        
        // Build command
        const cmd = ['cscli', 'machines', 'validate'];
        if (name) cmd.push(name);
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Validating CrowdSec machine${name ? ': ' + name : 's'}...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to validate machine(s): ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully validated machine(s).`);
        
        // Get the output content
        const validateContent = result.stdout || 'No validation details returned.';
        
        // Send the validation results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(validateContent),
            name: `crowdsec-machine-validate.txt`
          }]
        });
        
      } else if (subcommand === 'prune') {
        // Build command
        const cmd = ['cscli', 'machines', 'prune'];
        
        // Update embed description
        embed.setDescription(`${branding.emojis.loading} Pruning unused CrowdSec machines...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Execute command
        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        
        if (!result.success) {
          throw new Error(`Failed to prune machines: ${result.error || "Unknown error"}`);
        }
        
        // Update embed
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully pruned unused machines.`);
        
        // Get the output content
        const pruneContent = result.stdout || 'No pruning details returned.';
        
        // Send the pruning results as a file attachment
        await interaction.editReply({
          embeds: [embed],
          files: [{
            attachment: Buffer.from(pruneContent),
            name: `crowdsec-machine-prune.txt`
          }]
        });
      }
    } catch (error) {
      console.error('Error executing crowdsecMachines command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Managing CrowdSec Machines', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred:\n\`\`\`${error.message}\`\`\``);
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};