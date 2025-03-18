// commands/dockerurllist.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require('fs').promises;
const path = require('path');
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockerurllist")
    .setDescription("Manage URL list for container update info")
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List container URLs for update information'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a container URL to the list')
        .addStringOption(option =>
          option.setName('container')
            .setDescription('Container name')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('url')
            .setDescription('URL to release notes or updates')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a container URL from the list')
        .addStringOption(option =>
          option.setName('container')
            .setDescription('Container name to remove')
            .setRequired(true))),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker URL List', 'info');
      
      // Path to the urls.list file
      const scriptDir = process.cwd();
      const urlListFile = path.join(scriptDir, 'urls.list');
      
      // Function to read URL list
      async function getUrlList() {
        try {
          const data = await fs.readFile(urlListFile, 'utf8');
          return data.split('\n')
            .filter(line => line.trim() && !line.trim().startsWith('#'))
            .map(line => {
              const parts = line.trim().split(/\s+/);
              const container = parts[0];
              const url = parts.slice(1).join(' ');
              return { container, url };
            });
        } catch (error) {
          if (error.code === 'ENOENT') {
            // Create the file if it doesn't exist
            await fs.writeFile(urlListFile, '# Container URLs for update information\n# Format: container_name url\n');
            return [];
          }
          throw error;
        }
      }
      
      // Function to write URL list
      async function saveUrlList(urlList) {
        // Get the header from the existing file if possible
        let header = '# Container URLs for update information\n# Format: container_name url\n\n';
        try {
          const existingData = await fs.readFile(urlListFile, 'utf8');
          const headerLines = existingData.split('\n')
            .filter(line => line.trim().startsWith('#'));
          if (headerLines.length > 0) {
            header = headerLines.join('\n') + '\n\n';
          }
        } catch (error) {
          // If file doesn't exist, use default header
        }
        
        // Format the URL list entries
        const entries = urlList.map(entry => `${entry.container} ${entry.url}`).join('\n');
        
        // Write the file with header and entries
        await fs.writeFile(urlListFile, `${header}${entries}\n`);
      }
      
      if (subcommand === 'list') {
        embed.setDescription(`${branding.emojis.loading} Fetching URL list...`);
        await interaction.editReply({ embeds: [embed] });
        
        const urlList = await getUrlList();
        
        if (urlList.length === 0) {
          embed.setDescription(`${branding.emojis.warning} No container URLs are currently configured.`);
          embed.addFields({
            name: 'Getting Started',
            value: `Use \`/dockerurllist add\` to add URLs for container release notes or update information.`
          });
        } else {
          embed.setDescription(`${branding.emojis.healthy} The following container URLs are configured:`);
          
          // Split into chunks to avoid Discord field length limits
          const chunkSize = 10;
          for (let i = 0; i < urlList.length; i += chunkSize) {
            const chunk = urlList.slice(i, i + chunkSize);
            const chunkContent = chunk.map(entry => {
              return `**${entry.container}**\n${entry.url}`;
            }).join('\n\n');
            
            embed.addFields({
              name: `URLs (${i+1}-${Math.min(i+chunkSize, urlList.length)})`,
              value: chunkContent
            });
          }
        }
        
        // Add explanation of what this is for
        embed.addFields({
          name: 'Purpose',
          value: `These URLs are used in update notifications to provide links to release notes or changelogs for each container.`
        });
      } else if (subcommand === 'add') {
        const container = interaction.options.getString('container');
        const url = interaction.options.getString('url');
        
        embed.setDescription(`${branding.emojis.loading} Adding container URL...`);
        await interaction.editReply({ embeds: [embed] });
        
        const urlList = await getUrlList();
        
        // Check if container already exists
        const existingIndex = urlList.findIndex(entry => entry.container === container);
        
        if (existingIndex !== -1) {
          // Update the existing entry
          const oldUrl = urlList[existingIndex].url;
          urlList[existingIndex].url = url;
          
          await saveUrlList(urlList);
          
          embed.setColor(branding.colors.warning);
          embed.setDescription(`${branding.emojis.warning} URL for container "${container}" updated.`);
          embed.addFields(
            { name: 'Old URL', value: oldUrl },
            { name: 'New URL', value: url }
          );
        } else {
          // Add new entry
          urlList.push({ container, url });
          
          await saveUrlList(urlList);
          
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} URL for container "${container}" added successfully.`);
          embed.addFields({ name: 'URL', value: url });
        }
      } else if (subcommand === 'remove') {
        const container = interaction.options.getString('container');
        
        embed.setDescription(`${branding.emojis.loading} Removing container URL...`);
        await interaction.editReply({ embeds: [embed] });
        
        const urlList = await getUrlList();
        
        // Find the container entry
        const existingIndex = urlList.findIndex(entry => entry.container === container);
        
        if (existingIndex !== -1) {
          // Remove the entry
          const removedUrl = urlList[existingIndex].url;
          urlList.splice(existingIndex, 1);
          
          await saveUrlList(urlList);
          
          embed.setColor(branding.colors.success);
          embed.setDescription(`${branding.emojis.healthy} URL for container "${container}" removed successfully.`);
          embed.addFields({ name: 'Removed URL', value: removedUrl });
        } else {
          embed.setColor(branding.colors.warning);
          embed.setDescription(`${branding.emojis.warning} No URL found for container "${container}".`);
        }
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error executing dockerurllist:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Managing URL List', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while managing container URLs.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};