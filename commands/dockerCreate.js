// commands/dockerCreate.js
const { SlashCommandBuilder } = require("discord.js");
const Docker = require('node-docker-api').Docker;
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dockercreate")
    .setDescription("Create a new Docker container")
    .addStringOption(option => 
      option.setName('image')
        .setDescription('The Docker image to use (e.g., nginx:latest)')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Name for the container')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('ports')
        .setDescription('Port mappings (format: host:container,host:container e.g., 80:80,443:443)')
        .setRequired(false))
    .addStringOption(option => 
      option.setName('env')
        .setDescription('Environment variables (format: KEY=value,ANOTHER=value)')
        .setRequired(false))
    .addStringOption(option => 
      option.setName('volumes')
        .setDescription('Volume mappings (format: host:container,host:container)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('start')
        .setDescription('Start the container after creation')
        .setRequired(false)),
        
  async autocomplete(interaction) {
    try {
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });

      // Get list of all images
      const images = await docker.image.list();
      
      // Extract all image names and tags
      const imageOptions = [];
      images.forEach(image => {
        if (image.data.RepoTags && Array.isArray(image.data.RepoTags)) {
          image.data.RepoTags.forEach(tag => {
            if (tag !== '<none>:<none>') {
              imageOptions.push(tag);
            }
          });
        }
      });

      // Filter by user input
      const focusedValue = interaction.options.getFocused();
      const filtered = imageOptions.filter(name => 
        name.toLowerCase().includes(focusedValue.toLowerCase())
      );
      
      // Return max 25 results (Discord limit)
      const results = filtered.slice(0, 25).map(name => ({ name, value: name }));
      
      await interaction.respond(results);
    } catch (error) {
      console.error("Error in autocomplete:", error);
      await interaction.respond([]);
    }
  },
  
  async execute(interaction) {
    await interaction.deferReply();
    
    try {
      // Create docker client
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      
      // Get container parameters
      const imageName = interaction.options.getString('image');
      const containerName = interaction.options.getString('name');
      const portsString = interaction.options.getString('ports') || '';
      const envString = interaction.options.getString('env') || '';
      const volumesString = interaction.options.getString('volumes') || '';
      const shouldStart = interaction.options.getBoolean('start') || false;
      
      // Create embed with branding
      const embed = branding.getHeaderEmbed(`Create Container: ${containerName}`, 'info');
      embed.setDescription(`${branding.emojis.loading} Creating container \`${containerName}\` from image \`${imageName}\`...`);
      
      // Send initial response
      await interaction.editReply({ embeds: [embed] });
      
      // Parse port mappings
      const exposedPorts = {};
      const portBindings = {};
      
      if (portsString) {
        const portMappings = portsString.split(',');
        portMappings.forEach(mapping => {
          const [hostPort, containerPort] = mapping.split(':');
          
          if (hostPort && containerPort) {
            // Format for Docker API
            const containerPortKey = `${containerPort}/tcp`;
            exposedPorts[containerPortKey] = {};
            portBindings[containerPortKey] = [{ HostPort: hostPort }];
          }
        });
      }
      
      // Parse environment variables
      const env = [];
      
      if (envString) {
        const envVars = envString.split(',');
        envVars.forEach(envVar => {
          if (envVar.includes('=')) {
            env.push(envVar);
          }
        });
      }
      
      // Parse volume mappings
      const volumes = {};
      const binds = [];
      
      if (volumesString) {
        const volumeMappings = volumesString.split(',');
        volumeMappings.forEach(mapping => {
          const [hostPath, containerPath] = mapping.split(':');
          
          if (hostPath && containerPath) {
            volumes[containerPath] = {};
            binds.push(`${hostPath}:${containerPath}`);
          }
        });
      }
      
      // Create container configuration
      const containerConfig = {
        Image: imageName,
        name: containerName,
        ExposedPorts: exposedPorts,
        Env: env,
        HostConfig: {
          PortBindings: portBindings,
          Binds: binds
        }
      };
      
      // Create container
      const container = await docker.container.create(containerConfig);
      
      // Start container if requested
      if (shouldStart) {
        await container.start();
      }
      
      // Update embed with success message
      embed.setColor(branding.colors.success);
      embed.setDescription(`${branding.emojis.healthy} Container \`${containerName}\` has been successfully created.`);
      
      // Add container details
      embed.addFields(
        { name: 'Image', value: imageName, inline: true },
        { name: 'Container ID', value: container.data.Id.substring(0, 12), inline: true },
        { name: 'Status', value: shouldStart ? '✅ Started' : '⏸️ Created (not started)', inline: true }
      );
      
      // Add port mappings if any
      if (portsString) {
        embed.addFields({
          name: 'Port Mappings',
          value: portsString.replace(/,/g, '\n')
        });
      }
      
      // Add environment variables if any (mask sensitive values)
      if (envString) {
        const maskedEnv = envString.split(',').map(env => {
          const [key, value] = env.split('=');
          // Mask potentially sensitive values
          if (key && key.toLowerCase().includes('key') || 
              key.toLowerCase().includes('token') || 
              key.toLowerCase().includes('password') || 
              key.toLowerCase().includes('secret')) {
            return `${key}=****`;
          }
          return env;
        }).join('\n');
        
        embed.addFields({
          name: 'Environment Variables',
          value: maskedEnv
        });
      }
      
      // Add volume mappings if any
      if (volumesString) {
        embed.addFields({
          name: 'Volume Mappings',
          value: volumesString.replace(/,/g, '\n')
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error creating container:", error);
      
      // Create error embed with branding
      const errorEmbed = branding.getHeaderEmbed('Error Creating Container', 'danger');
      errorEmbed.setDescription(
        `${branding.emojis.error} An error occurred while creating the container.\n\n` +
        `\`\`\`${error.message}\`\`\``
      );
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};