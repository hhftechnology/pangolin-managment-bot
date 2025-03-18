// commands/dockerupdate.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { exec } = require('child_process');
const util = require('util');
const branding = require('../backend/pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerupdate")
    .setDescription("Update Docker containers with available updates")
    .addStringOption(option => 
      option.setName('containers')
        .setDescription('Specific containers to update (comma-separated)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('auto_prune')
        .setDescription('Auto-prune dangling images after update')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('force_restart_stacks')
        .setDescription('Force restart of entire stacks after update')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('allow_run_updates')
        .setDescription('Allow updating images for docker run (won\'t update the container)')
        .setRequired(false)),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get options from command
      const containers = interaction.options.getString('containers') || '';
      const autoPrune = interaction.options.getBoolean('auto_prune') || false;
      const forceRestartStacks = interaction.options.getBoolean('force_restart_stacks') || false;
      const allowRunUpdates = interaction.options.getBoolean('allow_run_updates') || false;
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Container Update', 'info');
      
      // Check if specific containers were provided or if we need to run a check first
      if (!containers) {
        // First, run dockercheck to find out what containers have updates
        embed.setDescription(`${branding.emojis.loading} Checking for Docker container updates...`);
        await interaction.editReply({ embeds: [embed] });
        
        const { stdout } = await execPromise(`${process.cwd()}/dockcheck.sh -n`);
        
        // Parse the output to extract containers with updates
        const updateRegex = /Containers with updates available:[\r\n]+([\s\S]*?)(?:\n\n|$)/;
        const updateMatch = stdout.match(updateRegex);
        
        if (!updateMatch || !updateMatch[1].trim()) {
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} No container updates available.`);
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        
        // Extract the container names
        const updatableContainers = updateMatch[1].trim().split('\n').filter(c => !c.match(/^\d+\)/));
        
        if (updatableContainers.length === 0) {
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} No container updates available.`);
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        
        // Create a confirmation message with the list of containers
        let containerList = '';
        for (const container of updatableContainers) {
          containerList += `${branding.emojis.warning} ${container}\n`;
        }
        
        embed.setColor(branding.colors.warning);
        embed.setDescription(
          `${branding.emojis.warning} The following containers have updates available:\n\n` +
          `${containerList}\n` +
          `Would you like to update all of them?`
        );
        
        // Create confirm/cancel buttons
        const confirmButton = new ButtonBuilder()
          .setCustomId('confirm_update')
          .setLabel('Update All')
          .setStyle(ButtonStyle.Primary);
          
        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_update')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);
          
        const row = new ActionRowBuilder()
          .addComponents(confirmButton, cancelButton);
        
        const response = await interaction.editReply({
          embeds: [embed],
          components: [row]
        });
        
        // Create a collector for button interactions
        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000 // 1 minute timeout
        });
        
        collector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) {
            await i.reply({ content: 'This button is not for you!', ephemeral: true });
            return;
          }
          
          if (i.customId === 'confirm_update') {
            // Build and execute the update command
            let updateCommand = `${process.cwd()}/dockcheck.sh -y`;
            if (autoPrune) updateCommand += ' -p';
            if (forceRestartStacks) updateCommand += ' -f';
            if (allowRunUpdates) updateCommand += ' -r';
            
            await runUpdateCommand(i, updateCommand, embed, updatableContainers);
          } else if (i.customId === 'cancel_update') {
            embed.setColor(branding.colors.info);
            embed.setDescription(`${branding.emojis.healthy} Update cancelled.`);
            await i.update({ embeds: [embed], components: [] });
          }
          
          collector.stop();
        });
        
        collector.on('end', async collected => {
          if (collected.size === 0) {
            embed.setColor(branding.colors.info);
            embed.setDescription(`${branding.emojis.warning} Update timed out.`);
            await interaction.editReply({ embeds: [embed], components: [] });
          }
        });
      } else {
        // Specific containers were provided, update them directly
        embed.setDescription(`${branding.emojis.loading} Updating specified Docker containers...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Build and execute the update command
        let updateCommand = `${process.cwd()}/dockcheck.sh -y`;
        if (autoPrune) updateCommand += ' -p';
        if (forceRestartStacks) updateCommand += ' -f';
        if (allowRunUpdates) updateCommand += ' -r';
        
        // Add the container filter
        updateCommand += ` "${containers}"`;
        
        const containerList = containers.split(',').map(c => c.trim());
        await runUpdateCommand(interaction, updateCommand, embed, containerList);
      }
    } catch (error) {
      console.error("Error executing dockerupdate:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Updating Docker Containers', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while updating Docker containers.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

async function runUpdateCommand(interaction, command, embed, containerList) {
  try {
    // Execute the update command
    embed.setDescription(`${branding.emojis.loading} Updating containers...\nThis may take some time depending on the number and size of updates.`);
    await interaction.editReply({ embeds: [embed] });
    
    console.log(`Executing command: ${command}`);
    const { stdout, stderr } = await execPromise(command);
    
    // Check if the update was successful
    if (stderr && stderr.includes('Error')) {
      embed.setColor(branding.colors.danger);
      embed.setDescription(`${branding.emojis.error} Error updating containers:\n\`\`\`${stderr}\`\`\``);
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    // Update was successful
    embed.setColor(branding.colors.success);
    embed.setDescription(`${branding.emojis.healthy} Docker containers updated successfully!`);
    
    // Add list of updated containers
    const containerListText = containerList.map(c => `${branding.emojis.healthy} ${c}`).join('\n');
    embed.addFields({ name: 'Updated Containers', value: containerListText });
    
    await interaction.editReply({ embeds: [embed] });
    
    // If the output is very long, also send it as a file
    const output = stdout || stderr;
    if (output.length > 2000) {
      await interaction.followUp({
        content: 'Detailed update output:',
        files: [{
          attachment: Buffer.from(output),
          name: 'dockerupdate-output.txt'
        }]
      });
    }
  } catch (error) {
    console.error("Error in runUpdateCommand:", error);
    
    // Create error embed with branding
    const errorEmbed = branding.getHeaderEmbed('Error Updating Docker Containers', 'danger');
    errorEmbed.setDescription(
      `${branding.emojis.error} An error occurred while updating Docker containers.\n\n` +
      `\`\`\`${error.message}\`\`\``
    );
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}