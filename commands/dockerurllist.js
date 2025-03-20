// commands/dockerurllist.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
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
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('import')
        .setDescription('Import default URL list for common containers')),
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed('Docker URL List', 'info');
      
      // Path to the urls.list file in the data directory
      const dataDir = path.join(process.cwd(), 'data');
      const urlListFile = path.join(dataDir, 'urls.list');
      
      // Ensure data directory exists
      try {
        await fs.mkdir(dataDir, { recursive: true });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
      
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
            value: `Use \`/dockerurllist add\` to add URLs for container release notes or update information.\nOr use \`/dockerurllist import\` to import a default list of common container URLs.`
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
        
        // Try to show list of running containers that don't have URLs configured
        try {
          const docker = new Docker({ socketPath: '/var/run/docker.sock' });
          const containers = await docker.container.list();
          
          const containerNames = containers.map(c => c.data.Names[0].slice(1));
          const configuredContainers = urlList.map(entry => entry.container);
          
          const unconfiguredContainers = containerNames.filter(name => !configuredContainers.includes(name));
          
          if (unconfiguredContainers.length > 0) {
            embed.addFields({
              name: 'Running Containers Without URL Configuration',
              value: unconfiguredContainers.map(name => `${branding.emojis.warning} ${name}`).join('\n')
            });
          }
        } catch (error) {
          console.error("Error listing Docker containers:", error);
        }
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
        
        // Check if container exists in Docker
        try {
          const docker = new Docker({ socketPath: '/var/run/docker.sock' });
          const containers = await docker.container.list({ all: true });
          
          const containerExists = containers.some(c => c.data.Names[0].slice(1) === container);
          
          if (!containerExists) {
            embed.addFields({
              name: '⚠️ Warning',
              value: `No container named "${container}" was found in Docker. The URL has been saved, but may not be used unless a container with this name is created.`
            });
          }
        } catch (error) {
          console.error("Error checking Docker container:", error);
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
      } else if (subcommand === 'import') {
        embed.setDescription(`${branding.emojis.loading} Importing default URL list...`);
        await interaction.editReply({ embeds: [embed] });
        
        // Default URL list for common containers
        const defaultUrls = [
          { container: "traefik", url: "https://github.com/traefik/traefik/releases" },
          { container: "portainer", url: "https://github.com/portainer/portainer/releases" },
          { container: "watchtower", url: "https://github.com/containrrr/watchtower/releases" },
          { container: "nginx", url: "https://github.com/docker-library/official-images/blob/master/library/nginx" },
          { container: "home-assistant", url: "https://github.com/home-assistant/docker/releases" },
          { container: "cloudflared", url: "https://github.com/cloudflare/cloudflared/releases" },
          { container: "sonarr", url: "https://github.com/linuxserver/docker-sonarr/releases" },
          { container: "radarr", url: "https://github.com/linuxserver/docker-radarr/releases" },
          { container: "lidarr", url: "https://github.com/linuxserver/docker-lidarr/releases" },
          { container: "prowlarr", url: "https://github.com/Prowlarr/Prowlarr/releases" },
          { container: "jellyfin", url: "https://github.com/jellyfin/jellyfin/releases" },
          { container: "plex", url: "https://github.com/plexinc/pms-docker/releases" },
          { container: "nextcloud", url: "https://github.com/nextcloud/docker/releases" },
          { container: "vaultwarden", url: "https://github.com/dani-garcia/vaultwarden/releases" },
          { container: "pihole", url: "https://github.com/pi-hole/docker-pi-hole/releases" },
          { container: "adguard-home", url: "https://github.com/AdguardTeam/AdGuardHome/releases" },
          { container: "unifi-controller", url: "https://github.com/linuxserver/docker-unifi-controller/releases" },
          { container: "homer", url: "https://github.com/bastienwirtz/homer/releases" },
          { container: "dashy", url: "https://github.com/Lissy93/dashy/releases" },
          { container: "gotify", url: "https://github.com/gotify/server/releases" },
          { container: "crowdsec", url: "https://github.com/crowdsecurity/crowdsec/releases" }
        ];
        
        // Get current URL list
        const currentUrls = await getUrlList();
        
        // Merge lists, prioritizing existing entries
        const currentContainers = currentUrls.map(entry => entry.container);
        const newUrls = defaultUrls.filter(entry => !currentContainers.includes(entry.container));
        const mergedList = [...currentUrls, ...newUrls];
        
        // Save the merged list
        await saveUrlList(mergedList);
        
        embed.setColor(branding.colors.success);
        embed.setDescription(`${branding.emojis.healthy} Successfully imported default URL list.`);
        embed.addFields(
          { name: 'Existing URLs', value: `${currentUrls.length} (preserved)` },
          { name: 'New URLs Added', value: `${newUrls.length}` },
          { name: 'Total URLs', value: `${mergedList.length}` }
        );
        
        if (newUrls.length > 0) {
          let newUrlsList = '';
          newUrls.forEach(entry => {
            newUrlsList += `**${entry.container}**: ${entry.url}\n`;
            if (newUrlsList.length > 900) {
              newUrlsList += '... and more';
              return;
            }
          });
          
          embed.addFields({ name: 'Newly Added URLs', value: newUrlsList });
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