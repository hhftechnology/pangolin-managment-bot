// commands/dockercheck.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { exec } = require('child_process');
const util = require('util');
const branding = require('../backend/pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockercheck")
    .setDescription("Check Docker containers for available updates")
    .addStringOption(option => 
      option.setName('filter')
        .setDescription('Filter containers by name')
        .setRequired(false))
    .addStringOption(option => 
      option.setName('exclude')
        .setDescription('Exclude containers (comma-separated names)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('include_stopped')
        .setDescription('Include stopped containers in the check')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('days_old')
        .setDescription('Only show updates that are N+ days old')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('timeout')
        .setDescription('Set timeout (in seconds) per container for registry checks')
        .setRequired(false)),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get options from command
      const filter = interaction.options.getString('filter') || '';
      const exclude = interaction.options.getString('exclude') || '';
      const includeStopped = interaction.options.getBoolean('include_stopped') || false;
      const daysOld = interaction.options.getInteger('days_old');
      const timeout = interaction.options.getInteger('timeout');
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Update Check', 'info');
      embed.setDescription(`${branding.emojis.loading} Checking for Docker container updates...`);
      
      // Send initial response
      await interaction.editReply({ embeds: [embed] });
      
      // Build dockcheck command
      let command = `${process.cwd()}/dockcheck.sh -n`;
      
      if (includeStopped) command += ' -s';
      if (exclude) command += ` -e ${exclude}`;
      if (daysOld) command += ` -d ${daysOld}`;
      if (timeout) command += ` -t ${timeout}`;
      if (filter) command += ` "${filter}"`;
      
      console.log(`Executing command: ${command}`);
      
      // Execute the command
      const { stdout, stderr } = await execPromise(command);
      
      // Process the output
      const output = stdout || stderr;
      
      // Parse the output to extract containers with updates
      const updateRegex = /Containers with updates available:[\r\n]+([\s\S]*?)(?:\n\n|$)/;
      const updateMatch = output.match(updateRegex);
      
      const noUpdateRegex = /Containers on latest version:[\r\n]+([\s\S]*?)(?:\n\n|$)/;
      const noUpdateMatch = output.match(noUpdateRegex);
      
      const errorRegex = /Containers with errors, won't get updated:[\r\n]+([\s\S]*?)(?:\n\n|$)/;
      const errorMatch = output.match(errorRegex);
      
      // Update the embed
      embed.setDescription(`${branding.emojis.healthy} Docker container update check completed!`);
      
      // Add up-to-date containers
      if (noUpdateMatch && noUpdateMatch[1].trim()) {
        const upToDateContainers = noUpdateMatch[1].trim().split('\n');
        let upToDateField = '';
        for (const container of upToDateContainers) {
          upToDateField += `${branding.emojis.healthy} ${container}\n`;
          if (upToDateField.length > 900) {
            upToDateField += `... and ${upToDateContainers.length - upToDateContainers.indexOf(container)} more`;
            break;
          }
        }
        embed.addFields({ name: '✅ Up-to-date Containers', value: upToDateField || 'None found' });
      }
      
      // Add containers with updates
      if (updateMatch && updateMatch[1].trim()) {
        const updatableContainers = updateMatch[1].trim().split('\n').filter(c => !c.match(/^\d+\)/));
        let updatableField = '';
        for (const container of updatableContainers) {
          updatableField += `${branding.emojis.warning} ${container}\n`;
          if (updatableField.length > 900) {
            updatableField += `... and ${updatableContainers.length - updatableContainers.indexOf(container)} more`;
            break;
          }
        }
        embed.setColor(branding.colors.warning);
        embed.addFields({ name: '🔄 Updates Available', value: updatableField || 'None found' });
      } else {
        embed.setColor(branding.colors.success);
      }
      
      // Add error containers
      if (errorMatch && errorMatch[1].trim()) {
        const errorContainers = errorMatch[1].trim().split('\n');
        let errorField = '';
        for (const container of errorContainers) {
          errorField += `${branding.emojis.error} ${container}\n`;
          if (errorField.length > 900) {
            errorField += `... and ${errorContainers.length - errorContainers.indexOf(container)} more`;
            break;
          }
        }
        embed.addFields({ name: '❌ Containers with Errors', value: errorField || 'None found' });
        embed.setColor(branding.colors.danger);
      }
      
      // Add instructions for updating
      if (updateMatch && updateMatch[1].trim()) {
        embed.addFields({ 
          name: 'How to Update', 
          value: 'Use `/dockerupdate` to update specific containers with available updates.' 
        });
      }
      
      // Send the results
      await interaction.editReply({ embeds: [embed] });
      
      // If the output is very long, also send it as a file
      if (output.length > 2000) {
        await interaction.followUp({
          content: 'Detailed output:',
          files: [{
            attachment: Buffer.from(output),
            name: 'dockercheck-output.txt'
          }]
        });
      }
    } catch (error) {
      console.error("Error executing dockercheck:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Checking Docker Updates', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while checking for Docker container updates.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};