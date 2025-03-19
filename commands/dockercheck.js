// commands/dockerCheck.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const branding = require('../backend/pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

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

// Check if an image update is available
async function checkImageUpdate(image) {
  try {
    if (!image || !image.includes(':')) {
      // If no tag is specified, assume it's latest
      return { needsUpdate: false, reason: "No specific tag" };
    }
    
    // Parse image name and tag
    const [imageName, currentTag] = image.split(':');
    
    // Skip 'latest' tagged images - they have special handling
    if (currentTag === 'latest') {
      // For latest tag, pull to see if there's an update
      try {
        await execPromise(`docker pull ${image} --quiet`);
        // Check if we got an update by comparing the image ID before and after pull
        const { stdout: imageId } = await execPromise(`docker inspect --format="{{.Id}}" ${image}`);
        return { needsUpdate: false, reason: "Latest tag pulled", currentTag: "latest" };
      } catch (error) {
        return { needsUpdate: false, reason: "Error pulling latest", error: error.message };
      }
    }
    
    // For version tags, fetch available tags and compare
    try {
      // Extract registry and repository parts
      let registry = '';
      let repository = imageName;
      
      if (imageName.includes('/')) {
        const parts = imageName.split('/');
        // Check if first part might be a registry URL
        if (parts[0].includes('.') || parts[0] === 'localhost') {
          registry = parts[0];
          repository = parts.slice(1).join('/');
        }
      }
      
      // For Docker Hub images
      if (!registry) {
        // Check available tags for the image
        const { stdout } = await execPromise(`curl -s "https://hub.docker.com/v2/repositories/${imageName}/tags?page_size=100"`);
        const data = JSON.parse(stdout);
        
        // Find latest version matching pattern (assuming semantic versioning)
        if (data && data.results && data.results.length > 0) {
          // Extract version components from current tag
          const versionMatch = currentTag.match(/^v?(\d+)\.(\d+)\.(\d+)/);
          if (versionMatch) {
            const [, major, minor, patch] = versionMatch;
            
            // Try to find newer versions with same major/minor version
            const newerVersions = data.results
              .map(tagInfo => tagInfo.name)
              .filter(tag => {
                // Match tags with same pattern
                const tagMatch = tag.match(/^v?(\d+)\.(\d+)\.(\d+)/);
                if (!tagMatch) return false;
                
                // Compare version components
                const [, tagMajor, tagMinor, tagPatch] = tagMatch;
                
                // For simplicity, only check for patch updates
                return (
                  parseInt(tagMajor) === parseInt(major) && 
                  parseInt(tagMinor) === parseInt(minor) && 
                  parseInt(tagPatch) > parseInt(patch)
                );
              });
            
            if (newerVersions.length > 0) {
              // Sort versions to find latest
              newerVersions.sort((a, b) => {
                const aMatch = a.match(/^v?(\d+)\.(\d+)\.(\d+)/);
                const bMatch = b.match(/^v?(\d+)\.(\d+)\.(\d+)/);
                if (!aMatch || !bMatch) return 0;
                
                // Compare major, minor, patch
                const [, aMajor, aMinor, aPatch] = aMatch;
                const [, bMajor, bMinor, bPatch] = bMatch;
                
                if (parseInt(aMajor) !== parseInt(bMajor)) {
                  return parseInt(bMajor) - parseInt(aMajor);
                }
                if (parseInt(aMinor) !== parseInt(bMinor)) {
                  return parseInt(bMinor) - parseInt(aMinor);
                }
                return parseInt(bPatch) - parseInt(aPatch);
              });
              
              return { 
                needsUpdate: true, 
                latestTag: newerVersions[0], 
                currentTag,
                reason: `Update available: ${currentTag} → ${newerVersions[0]}`
              };
            }
          }
        }
      }
      
      return { needsUpdate: false, reason: "No newer version found", currentTag };
    } catch (error) {
      return { needsUpdate: false, reason: "Error checking version", error: error.message, currentTag };
    }
  } catch (error) {
    return { needsUpdate: false, reason: "Error parsing image", error: error.message };
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
      .setRequired(false))
    .addBooleanOption(option =>
      option.setName('pull_latest')
      .setDescription('Pull latest images for containers with "latest" tag')
      .setRequired(false)),
      
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Get command options
      const excludeCurrent = interaction.options.getBoolean('exclude_current') || false;
      const showAll = interaction.options.getBoolean('show_all') || false;
      const pullLatest = interaction.options.getBoolean('pull_latest') || false;
      
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
      let updateResults = [];
      let upToDateResults = [];
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
          
          // Check for image updates
          const updateCheck = await checkImageUpdate(image);
          
          if (updateCheck.needsUpdate) {
            updateResults.push(`${branding.emojis.warning} ${containerName} - ${updateCheck.reason}`);
          } else {
            if (showAll) {
              upToDateResults.push(`${branding.emojis.healthy} ${containerName} - Up to date (${updateCheck.currentTag || 'unknown'})`);
            }
          }
          
          // Pull latest image if requested and tag is latest
          if (pullLatest && image.endsWith(':latest')) {
            try {
              await execPromise(`docker pull ${image} --quiet`);
            } catch (pullError) {
              console.error(`Error pulling ${image}:`, pullError.message);
            }
          }
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
      
      // Update header emoji if there are errors or updates
      if (errorResults.length > 0 || updateResults.length > 0) {
        headerEmoji = branding.emojis.warning;
        embed.setColor(branding.colors.warning);
      } else {
        embed.setColor(branding.colors.success);
      }
      
      // Update embed with results
      const containerCount = updateResults.length + upToDateResults.length + errorResults.length + skippedResults.length;
      
      embed.setDescription(
        `${headerEmoji} **Docker Container Update Check Completed!**\n\n` +
        `Checked ${containerCount} containers\n` +
        `✅ ${upToDateResults.length} up to date\n` +
        `⚠️ ${updateResults.length} need updates\n` +
        `❌ ${errorResults.length} with errors\n` +
        `⚠️ ${skippedResults.length} excluded`
      );
      
      // Add fields for each category
      if (updateResults.length > 0) {
        embed.addFields({
          name: '⚠️ Containers Needing Updates',
          value: updateResults.join('\n')
        });
      }
      
      if (upToDateResults.length > 0) {
        embed.addFields({
          name: '✅ Containers with No Updates',
          value: upToDateResults.join('\n')
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