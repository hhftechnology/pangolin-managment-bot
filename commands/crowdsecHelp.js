// commands/crowdsecHelp.js
const { SlashCommandBuilder } = require("discord.js");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsechelp")
    .setDescription("Shows help for all CrowdSec-related commands"),
            
  async execute(interaction) {
    try {
      // Create embed with branding
      const embed = branding.getHeaderEmbed('CrowdSec Discord Commands Help', 'crowdsec');
      
      
      // Create descriptions for each command
      const commandDescriptions = [
        {
          name: '/crowdsecstatus',
          description: 'Shows the overall status of CrowdSec, including active threats and configurations.'
        },
        {
          name: '/crowdsecalerts',
          description: 'Manage CrowdSec alerts: list, flush, and inspect detected security events.'
        },
        {
          name: '/crowdsecdecisions',
          description: 'Manage CrowdSec decisions (bans, captchas): list, add, delete, and import.'
        },
        {
          name: '/crowdsecallowlist',
          description: 'Manage CrowdSec whitelists: add trusted IPs and ranges, list, remove, and check status.'
        },
        {
          name: '/crowdsecscenarios',
          description: 'Manage detection scenarios: list, inspect, install, remove, and upgrade.'
        },
        {
          name: '/crowdsecparsers',
          description: 'Manage log parsers: list, inspect, install, remove, and upgrade.'
        },
        {
          name: '/crowdseccollections',
          description: 'Manage collections (bundles of parsers and scenarios): list, inspect, install, remove, and upgrade.'
        },
        {
          name: '/crowdsecbouncers',
          description: 'Manage bouncers (enforcement agents): list, add, delete, and prune.'
        },
        {
          name: '/crowdsecmachines',
          description: 'Manage CrowdSec machines: list, add, delete, validate, and prune.'
        },
        {
          name: '/crowdsecmetrics',
          description: 'View CrowdSec metrics and run utility commands like explain and Central API operations.'
        },
        {
          name: '/crowdsecconfig',
          description: 'Manage CrowdSec Application Security configurations and rules.'
        }
      ];
      
      // Add description fields for each command
      commandDescriptions.forEach(cmd => {
        embed.addFields({
          name: cmd.name,
          value: cmd.description,
          inline: false
        });
      });
      
      // Add resource links
      embed.addFields({
        name: 'Useful Resources',
        value: [
          '[CrowdSec Documentation](https://docs.crowdsec.net/)',
          '[CrowdSec Hub](https://hub.crowdsec.net/)',
          '[CrowdSec Blog](https://www.crowdsec.net/blog)',
          '[GitHub Repository](https://github.com/crowdsecurity/crowdsec)'
        ].join('\n')
      });
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error executing crowdsecHelp command:', error);
      await interaction.reply(`Error: ${error.message}`);
    }
  }
};