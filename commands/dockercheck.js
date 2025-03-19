// commands/dockercheck.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

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
      const filterName = interaction.options.getString('filter') || '';
      const excludeStr = interaction.options.getString('exclude') || '';
      const includeStopped = interaction.options.getBoolean('include_stopped') || false;
      const daysOld = interaction.options.getInteger('days_old');
      const timeout = interaction.options.getInteger('timeout') || 10;
      
      // Parse excludes
      const excludeList = excludeStr ? excludeStr.split(',').map(e => e.trim()) : [];
      
      // Try to load permanent excludes from file
      try {
        const excludeFile = path.join(process.cwd(), 'data', 'excluded_containers.txt');
        const data = await fs.readFile(excludeFile, 'utf8');
        const fileExcludes = data.trim().split('\n').filter(line => line.trim());
        excludeList.push(...fileExcludes);
      } catch (err) {
        // It's okay if the file doesn't exist
        console.log("No permanent exclude file found (data/excluded_containers.txt)");
      }
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Update Check', 'info');
      embed.setDescription(`${branding.emojis.loading} Checking for Docker container updates...`);
      
      // Send initial response
      await interaction.editReply({ embeds: [embed] });
      
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Get all containers (optionally including stopped ones)
      const filters = includeStopped ? {} : { status: ['running'] };
      if (filterName) {
        filters.name = [filterName];
      }
      
      const containers = await docker.container.list({ all: includeStopped, filters });
      
      // Check each container for updates
      const containerCheckPromises = containers
        .filter(container => {
          const containerName = container.data.Names[0].slice(1);
          return !excludeList.some(exclude => containerName === exclude);
        })
        .map(async container => {
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
              // Check if update is old enough
              if (daysOld) {
                const createdStr = newImageInfo.Created;
                const createdDate = new Date(createdStr);
                const ageInDays = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
                
                if (ageInDays < daysOld) {
                  return { name: containerName, status: 'current', note: `+${containerName} ${ageInDays}d` };
                }
              }
              
              return { name: containerName, status: 'updatable' };
            }
            
            return { name: containerName, status: 'current' };
          } catch (error) {
            return { name: containerName, status: 'error', error: error.message };
          }
        });
      
      // Wait for all container checks to complete
      const containerStatuses = await Promise.all(containerCheckPromises);
      
      // Group containers by status
      const upToDate = containerStatuses.filter(c => c.status === 'current').map(c => c.note || c.name);
      const updatable = containerStatuses.filter(c => c.status === 'updatable').map(c => c.name);
      const errors = containerStatuses.filter(c => c.status === 'error').map(c => `${c.name} - ${c.error}`);
      
      // Sort all arrays alphabetically
      upToDate.sort();
      updatable.sort();
      errors.sort();
      
      // Update the embed
      embed.setDescription(`${branding.emojis.healthy} Docker container update check completed!`);
      
      // Add up-to-date containers
      if (upToDate.length > 0) {
        let upToDateField = '';
        for (const container of upToDate) {
          upToDateField += `${branding.emojis.healthy} ${container}\n`;
          if (upToDateField.length > 900) {
            upToDateField += `... and ${upToDate.length - upToDate.indexOf(container)} more`;
            break;
          }
        }
        embed.addFields({ name: '✅ Up-to-date Containers', value: upToDateField || 'None found' });
      }
      
      // Add containers with updates
      if (updatable.length > 0) {
        let updatableField = '';
        for (const container of updatable) {
          updatableField += `${branding.emojis.warning} ${container}\n`;
          if (updatableField.length > 900) {
            updatableField += `... and ${updatable.length - updatable.indexOf(container)} more`;
            break;
          }
        }
        embed.setColor(branding.colors.warning);
        embed.addFields({ name: '🔄 Updates Available', value: updatableField || 'None found' });
      } else {
        embed.setColor(branding.colors.success);
      }
      
      // Add error containers
      if (errors.length > 0) {
        let errorField = '';
        for (const container of errors) {
          errorField += `${branding.emojis.error} ${container}\n`;
          if (errorField.length > 900) {
            errorField += `... and ${errors.length - errors.indexOf(container)} more`;
            break;
          }
        }
        embed.addFields({ name: '❌ Containers with Errors', value: errorField || 'None found' });
        embed.setColor(branding.colors.danger);
      }
      
      // Add instructions for updating
      if (updatable.length > 0) {
        embed.addFields({ 
          name: 'How to Update', 
          value: 'Use `/dockerupdate` to update specific containers with available updates.' 
        });
      }
      
      // Send the results
      await interaction.editReply({ embeds: [embed] });
      
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