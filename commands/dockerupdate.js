// commands/dockerupdate.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { exec } = require('child_process');
const util = require('util');
const Docker = require('node-docker-api').Docker;
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
      
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Container Update', 'info');
      
      // Check if specific containers were provided or if we need to run a check first
      if (!containers) {
        // First, run a check to find out what containers have updates
        embed.setDescription(`${branding.emojis.loading} Checking for Docker container updates...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Get all running containers
        const allContainers = await docker.container.list();
        
        // Check each container for updates
        const containerCheckPromises = allContainers.map(async container => {
          const containerName = container.data.Names[0].slice(1);
          const image = container.data.Image;
          const imageId = container.data.ImageID;
          
          try {
            // Get local image details
            const localImage = await docker.image.get(imageId).status();
            const localDigest = localImage.data.RepoDigests && localImage.data.RepoDigests[0] ? 
                                localImage.data.RepoDigests[0].split('@')[1] : null;
            
            // Use docker CLI to get registry digest (more reliable than API for auth)
            const registryCheck = await execPromise(`docker pull ${image} --quiet`).catch(err => {
              return { stdout: '', stderr: err.message };
            });
            
            if (registryCheck.stderr && registryCheck.stderr.includes('ERROR')) {
              return { name: containerName, status: 'error', error: registryCheck.stderr };
            }
            
            // Get the new image details
            const newImageDetails = await execPromise(`docker inspect ${image}`);
            const newImageInfo = JSON.parse(newImageDetails.stdout)[0];
            const newDigest = newImageInfo.RepoDigests && newImageInfo.RepoDigests[0] ? 
                             newImageInfo.RepoDigests[0].split('@')[1] : null;
            
            // If digests don't match, there's an update
            if (localDigest && newDigest && localDigest !== newDigest) {
              return { name: containerName, status: 'updatable', image };
            }
            
            return { name: containerName, status: 'current' };
          } catch (error) {
            return { name: containerName, status: 'error', error: error.message };
          }
        });
        
        // Wait for all container checks to complete
        const containerStatuses = await Promise.all(containerCheckPromises);
        
        // Filter to only updatable containers
        const updatableContainers = containerStatuses
          .filter(c => c.status === 'updatable')
          .map(c => c.name);
        
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
            await i.update({ embeds: [embed], components: [] });
            await updateContainers(i, updatableContainers, docker, {
              autoPrune,
              forceRestartStacks,
              allowRunUpdates
            });
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
        
        const containerList = containers.split(',').map(c => c.trim());
        await updateContainers(interaction, containerList, docker, {
          autoPrune,
          forceRestartStacks,
          allowRunUpdates
        });
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

async function updateContainers(interaction, containerList, docker, options) {
  const embed = branding.getHeaderEmbed('Docker Container Update', 'info');
  embed.setDescription(`${branding.emojis.loading} Updating containers...\nThis may take some time depending on the number and size of updates.`);
  await interaction.editReply({ embeds: [embed] });
  
  try {
    const updateResults = [];
    
    for (const containerName of containerList) {
      try {
        // Find the container
        const containers = await docker.container.list({
          all: true,
          filters: { name: [containerName] }
        });
        
        if (containers.length === 0) {
          updateResults.push({
            name: containerName,
            success: false,
            error: 'Container not found'
          });
          continue;
        }
        
        const container = containers[0];
        const image = container.data.Image;
        
        // Pull the latest image
        await execPromise(`docker pull ${image}`);
        
        // Get container information to check if it's a docker-compose container
        const containerInfo = await container.status();
        const labels = containerInfo.data.Config.Labels || {};
        
        // Check if container is in a docker-compose setup
        const composePath = labels['com.docker.compose.project.working_dir'];
        const composeFile = labels['com.docker.compose.project.config_files'];
        const serviceName = labels['com.docker.compose.service'];
        
        if (composePath && composeFile && serviceName) {
          // It's a compose container, restart it with docker-compose
          let composeCmd;
          
          // Build docker-compose command based on file path
          if (composeFile.startsWith('/')) {
            composeCmd = `cd ${composePath} && docker-compose -f ${composeFile}`;
          } else {
            composeCmd = `cd ${composePath} && docker-compose -f ${composePath}/${composeFile}`;
          }
          
          if (options.forceRestartStacks) {
            // Restart the entire stack
            await execPromise(`${composeCmd} up -d`);
          } else {
            // Just restart the specific service
            await execPromise(`${composeCmd} up -d ${serviceName}`);
          }
          
          updateResults.push({
            name: containerName,
            success: true, 
            message: options.forceRestartStacks ? 'Entire stack restarted' : 'Service restarted'
          });
        } else {
          // Not in compose, check if we should update non-compose containers
          if (options.allowRunUpdates) {
            // Just update the image, don't restart the container
            updateResults.push({
              name: containerName,
              success: true,
              message: 'Image updated, container not restarted (docker run)'
            });
          } else {
            // Try to stop and restart the container directly
            await container.stop();
            await container.restart();
            
            updateResults.push({
              name: containerName,
              success: true,
              message: 'Container restarted directly'
            });
          }
        }
      } catch (error) {
        updateResults.push({
          name: containerName,
          success: false,
          error: error.message
        });
      }
    }
    
    // Prune images if requested
    if (options.autoPrune) {
      try {
        await execPromise('docker image prune -f');
      } catch (error) {
        console.error('Error pruning images:', error);
      }
    }
    
    // Summarize results
    const successfulUpdates = updateResults.filter(r => r.success);
    const failedUpdates = updateResults.filter(r => !r.success);
    
    if (failedUpdates.length > 0) {
      embed.setColor(branding.colors.warning);
    } else {
      embed.setColor(branding.colors.success);
    }
    
    embed.setDescription(`${branding.emojis.healthy} Docker container update completed!`);
    
    // Add successful updates
    if (successfulUpdates.length > 0) {
      const successList = successfulUpdates
        .map(r => `${branding.emojis.healthy} ${r.name} - ${r.message || 'Updated'}`)
        .join('\n');
      
      embed.addFields({ name: '✅ Successfully Updated', value: successList });
    }
    
    // Add failed updates
    if (failedUpdates.length > 0) {
      const failureList = failedUpdates
        .map(r => `${branding.emojis.error} ${r.name} - ${r.error || 'Failed'}`)
        .join('\n');
      
      embed.addFields({ name: '❌ Failed Updates', value: failureList });
    }
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error updating containers:", error);
    
    const errorEmbed = branding.getHeaderEmbed('Error Updating Docker Containers', 'danger');
    errorEmbed.setDescription(
      `${branding.emojis.error} An error occurred while updating Docker containers.\n\n` +
      `\`\`\`${error.message}\`\`\``
    );
    
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}