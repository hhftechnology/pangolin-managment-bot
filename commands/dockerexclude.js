// commands/dockerexclude.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const branding = require('../backend/pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerexclude")
    .setDescription("Manage container exclusions for Docker update checks")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List containers currently excluded from update checks'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add containers to the exclusion list')
        .addStringOption(option =>
          option.setName('containers')
            .setDescription('Container names to exclude (comma-separated)')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove containers from the exclusion list')
        .addStringOption(option =>
          option.setName('containers')
            .setDescription('Container names to remove from exclusions (comma-separated)')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear all container exclusions')),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker Exclusions', 'info');
      
      // Path to store exclusions
      const scriptDir = process.cwd();
      const excludeFile = path.join(scriptDir, 'data', 'excluded_containers.txt');
      
      // Ensure data directory exists
      const dataDir = path.join(scriptDir, 'data');
      try {
        await fs.mkdir(dataDir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
      
      // Function to read exclusions
      async function getExclusions() {
        try {
          const data = await fs.readFile(excludeFile, 'utf8');
          return data.trim().split('\n').filter(line => line.trim());
        } catch (error) {
          if (error.code === 'ENOENT') {
            return [];
          }
          throw error;
        }
      }
      
      // Function to write exclusions
      async function saveExclusions(exclusions) {
        await fs.writeFile(excludeFile, exclusions.join('\n'));
      }
      
      if (subcommand === 'list') {
        embed.setDescription(`${branding.emojis.loading} Fetching excluded containers...`);
        await interaction.editReply({ embeds: [embed] });
        
        const exclusions = await getExclusions();
        
        if (exclusions.length === 0) {
          embed.setDescription(`${branding.emojis.healthy} No containers are currently excluded.`);
        } else {
          embed.setDescription(`${branding.emojis.healthy} The following containers are excluded from update checks:`);
          
          const exclusionList = exclusions.map(container => `${branding.emojis.warning} ${container}`).join('\n');
          embed.addFields({ name: 'Excluded Containers', value: exclusionList });
        }
        
        // Add usage tip
        embed.addFields({
          name: 'Usage with dockercheck',
          value: `When using \`/dockercheck\`, these containers will automatically be excluded.\nYou can still override this with the exclude option.`
        });
      } else if (subcommand === 'add') {
        const containers = interaction.options.getString('containers');
        const containersArray = containers.split(',').map(c => c.trim()).filter(c => c);
        
        embed.setDescription(`${branding.emojis.loading} Adding containers to exclusion list...`);
        await interaction.editReply({ embeds: [embed] });
        
        const currentExclusions = await getExclusions();
        
        // Add new containers (avoiding duplicates)
        const updatedExclusions = [...new Set([...currentExclusions, ...containersArray])];
        
        await saveExclusions(updatedExclusions);
        
        const newlyAdded = containersArray.filter(c => !currentExclusions.includes(c));
        const alreadyExcluded = containersArray.filter(c => currentExclusions.includes(c));
        
        if (newlyAdded.length === 0) {
          embed.setDescription(`${branding.emojis.warning} All specified containers were already excluded.`);
        } else {
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} Successfully added ${newlyAdded.length} container(s) to the exclusion list.`);
          
          if (newlyAdded.length > 0) {
            embed.addFields({
              name: 'Newly Excluded',
              value: newlyAdded.map(c => `${branding.emojis.healthy} ${c}`).join('\n')
            });
          }
          
          if (alreadyExcluded.length > 0) {
            embed.addFields({
              name: 'Already Excluded',
              value: alreadyExcluded.map(c => `${branding.emojis.warning} ${c}`).join('\n')
            });
          }
        }
      } else if (subcommand === 'remove') {
        const containers = interaction.options.getString('containers');
        const containersArray = containers.split(',').map(c => c.trim()).filter(c => c);
        
        embed.setDescription(`${branding.emojis.loading} Removing containers from exclusion list...`);
        await interaction.editReply({ embeds: [embed] });
        
        const currentExclusions = await getExclusions();
        
        // Remove containers
        const updatedExclusions = currentExclusions.filter(c => !containersArray.includes(c));
        
        await saveExclusions(updatedExclusions);
        
        const removed = containersArray.filter(c => currentExclusions.includes(c));
        const notExcluded = containersArray.filter(c => !currentExclusions.includes(c));
        
        if (removed.length === 0) {
          embed.setDescription(`${branding.emojis.warning} None of the specified containers were in the exclusion list.`);
        } else {
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} Successfully removed ${removed.length} container(s) from the exclusion list.`);
          
          if (removed.length > 0) {
            embed.addFields({
              name: 'Removed from Exclusions',
              value: removed.map(c => `${branding.emojis.healthy} ${c}`).join('\n')
            });
          }
          
          if (notExcluded.length > 0) {
            embed.addFields({
              name: 'Not in Exclusion List',
              value: notExcluded.map(c => `${branding.emojis.warning} ${c}`).join('\n')
            });
          }
        }
      } else if (subcommand === 'clear') {
        embed.setDescription(`${branding.emojis.loading} Clearing all container exclusions...`);
        await interaction.editReply({ embeds: [embed] });
        
        const currentExclusions = await getExclusions();
        const count = currentExclusions.length;
        
        // Clear exclusions
        await saveExclusions([]);
        
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully cleared all container exclusions.`);
        
        if (count === 0) {
          embed.addFields({
            name: 'No Change',
            value: 'There were no excluded containers to clear.'
          });
        } else {
          embed.addFields({
            name: 'Cleared Exclusions',
            value: `Removed ${count} container(s) from the exclusion list.`
          });
        }
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error executing dockerexclude:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Managing Exclusions', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while managing container exclusions.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};