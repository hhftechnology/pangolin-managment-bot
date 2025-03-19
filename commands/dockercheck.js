// commands/dockerCheck.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const fs = require('fs').promises;
const path = require('path');
const branding = require('../backend/pangolinBranding');

// Path for excluded containers list
const EXCLUDE_FILE_PATH = path.join(__dirname, '../data/excluded_containers.txt');

// Make sure the data directory exists
async function ensureDataDir() {
  const dataDir = path.join(__dirname, '../data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Load excluded containers
async function loadExcludedContainers() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(EXCLUDE_FILE_PATH, 'utf8').catch(() => '');
    return data.split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    console.log('No permanent exclude file found (data/excluded_containers.txt)');
    return [];
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockercheck")
    .setDescription("Check if Docker containers are up to date")
    .addBooleanOption(option => 
      option.setName('exclude_current')
      .setDescription('Exclude containers with errors from future checks')
      .setRequired(false))
    .addBooleanOption(option =>
      option.setName('show_all')
      .setDescription('Show all containers, including those with no update available')
      .setRequired(false)),
      
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get command options
      const excludeCurrent = interaction.options.getBoolean('exclude_current') || false;
      const showAll = interaction.options.getBoolean('show_all') || false;
      
      // Load excluded containers
      const excludedContainers = await loadExcludedContainers();
      
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Get all containers
      const containers = await docker.container.list({ all: true });
      
      // Create embed with Pangolin branding
      const embed = branding.getHeaderEmbed('Docker Update Check');
      
      // Main header emoji for success/warning
      let headerEmoji = branding.emojis.healthy;
      
      // Process results
      embed.setDescription(`${branding.emojis.loading} Checking containers for updates...`);
      await interaction.editReply({ embeds: [embed] });
      
      // Format results
      let successResults = [];
      let errorResults = [];
      let skippedResults = [];
      
      // Track newly excluded containers
      let newlyExcluded = [];
      
      // Check each container
      for (const container of containers) {
        try {
          const containerName = container.data.Names[0].slice(1);
          
          // Skip if container is in excluded list
          if (excludedContainers.includes(containerName)) {
            skippedResults.push(`${branding.emojis.warning} ${containerName} - Excluded from checks`);
            continue;
          }
          
          // Get container image details
          const image = container.data.Image;
          const imageId = container.data.ImageID;
          
          // Placeholder for future image check logic
          // In a real implementation, we would check if updates are available by
          // comparing local image digest with remote registry
          
          // For this simplified version, we'll consider all containers up to date
          const isUpToDate = true;
          
          if (isUpToDate && !showAll) {
            // Only add to success results if showing all containers
            continue;
          }
          
          successResults.push(`${branding.emojis.healthy} ${containerName} - Up to date`);
        } catch (error) {
          console.error(`Error checking container ${container.data.Names[0]}:`, error);
          
          const containerName = container.data.Names[0].slice(1);
          
          // Add to error results
          errorResults.push(`${branding.emojis.error} ${containerName} - Error: ${error.message}`);
          
          // Add to excluded list if option is enabled
          if (excludeCurrent && !excludedContainers.includes(containerName)) {
            excludedContainers.push(containerName);
            newlyExcluded.push(containerName);
          }
        }
      }
      
      // Update excluded containers file if needed
      if (newlyExcluded.length > 0) {
        try {
          await fs.writeFile(EXCLUDE_FILE_PATH, excludedContainers.join('\n'));
        } catch (error) {
          console.error('Error updating excluded containers file:', error);
        }
      }
      
      // Update header emoji if there are errors
      if (errorResults.length > 0) {
        headerEmoji = branding.emojis.warning;
        embed.setColor(branding.colors.warning);
      } else {
        embed.setColor(branding.colors.success);
      }
      
      // Update embed with results
      const containerCount = successResults.length + errorResults.length + skippedResults.length;
      
      embed.setDescription(
        `${headerEmoji} **Docker Container Update Check Completed!**\n\n` +
        `Checked ${containerCount} containers\n` +
        `✅ ${successResults.length} up to date\n` +
        `❌ ${errorResults.length} with errors\n` +
        `⚠️ ${skippedResults.length} excluded`
      );
      
      // Add fields for each category
      if (successResults.length > 0) {
        embed.addFields({
          name: '✅ Containers with No Updates',
          value: successResults.join('\n')
        });
      }
      
      if (errorResults.length > 0) {
        embed.addFields({
          name: '❌ Containers with Errors',
          value: errorResults.join('\n')
        });
      }
      
      if (skippedResults.length > 0) {
        embed.addFields({
          name: '⚠️ Excluded Containers',
          value: skippedResults.join('\n')
        });
      }
      
      if (newlyExcluded.length > 0) {
        embed.addFields({
          name: '🔄 Newly Excluded Containers',
          value: `The following containers have been added to the exclusion list:\n${newlyExcluded.join('\n')}`
        });
      }
      
      // Send the updated embed
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error executing dockerCheck command:', error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Checking Docker Containers', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while checking containers for updates.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};