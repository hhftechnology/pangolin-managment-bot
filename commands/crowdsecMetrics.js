const { SlashCommandBuilder } = require("discord.js");
const dockerManager = require("../backend/dockerManager");
const branding = require('../backend/pangolinBranding');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("crowdsecmetrics")
    .setDescription("View CrowdSec metrics and run utility commands")
    .addSubcommand(subcommand =>
      subcommand
        .setName('metrics')
        .setDescription('View CrowdSec security metrics and performance stats'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('explain')
        .setDescription('Analyze log lines with CrowdSec parsers')
        .addStringOption(option =>
          option.setName('log')
            .setDescription('Log line to test')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('file')
            .setDescription('Log file to test')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Type of acquisition to test')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('failures')
            .setDescription('Only show failed lines')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('only_successful_parsers')
            .setDescription('Only show successful parsers')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('capi')
        .setDescription('CrowdSec Central API operations')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Central API action')
            .setRequired(true)
            .addChoices(
              { name: 'register', value: 'register' },
              { name: 'status', value: 'status' }
            ))),

  async execute(interaction) {
    console.log(`Executing crowdsecmetrics command from user ${interaction.user.tag}`);

    try {
      await interaction.deferReply();

      let subcommand;
      try {
        subcommand = interaction.options.getSubcommand();
        console.log(`Processing subcommand: ${subcommand}`);
      } catch (error) {
        console.log('No subcommand provided, showing help message');

        const embed = branding.getHeaderEmbed('CrowdSec Metrics', 'crowdsec');
        embed.setDescription(`${branding.emojis.crowdsec} Please select one of these subcommands:`);

        const subcommands = [
          { name: 'metrics', description: 'View detailed CrowdSec security metrics and performance statistics' },
          { name: 'explain', description: 'Test and analyze log lines with CrowdSec parsers' },
          { name: 'capi', description: 'Manage CrowdSec Central API connection' }
        ];

        const formattedSubcommands = subcommands.map(cmd =>
          `**/${interaction.commandName} ${cmd.name}** - ${cmd.description}`
        ).join('\n');

        embed.addFields({ name: 'Available Subcommands', value: formattedSubcommands });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const containerStatus = await dockerManager.getContainerDetailedStatus('crowdsec');
      if (!containerStatus.success) {
        throw new Error(`Failed to check CrowdSec container: ${containerStatus.error || "Unknown error"}`);
      }
      if (!containerStatus.exists) {
        throw new Error('CrowdSec container not found');
      }
      if (!containerStatus.running) {
        throw new Error('CrowdSec container is not running');
      }

      const embed = branding.getHeaderEmbed(`CrowdSec - ${subcommand}`, 'crowdsec');
      embed.setDescription(`${branding.emojis.loading} Processing CrowdSec command...`);
      await interaction.editReply({ embeds: [embed] });

      if (subcommand === 'metrics') {
        console.log('Executing metrics subcommand');
        
        // Get metrics in both human-readable format
        const metricsCmd = ['cscli', 'metrics'];
        
        const result = await dockerManager.executeInContainer('crowdsec', metricsCmd);
        
        if (!result.success) {
          throw new Error(`Failed to get metrics: ${result.error || "Unknown error"}`);
        }
        
        // Get additional info for summary
        const decisionsCmd = ['cscli', 'decisions', 'list', '-o', 'json'];
        const bouncersCmd = ['cscli', 'bouncers', 'list', '-o', 'json'];
        const alertsCmd = ['cscli', 'alerts', 'list'];
        
        const [decisionsResult, bouncersResult, alertsResult] = await Promise.all([
          dockerManager.executeInContainer('crowdsec', decisionsCmd),
          dockerManager.executeInContainer('crowdsec', bouncersCmd),
          dockerManager.executeInContainer('crowdsec', alertsCmd)
        ]);
        
        // Create a summary embed
        const summaryEmbed = branding.getHeaderEmbed('CrowdSec Metrics Summary', 'crowdsec');
        
        let decisionsCount = 0;
        let bouncersCount = 0;
        
        try {
          if (decisionsResult.success && decisionsResult.stdout) {
            const decisions = JSON.parse(decisionsResult.stdout);
            decisionsCount = decisions.length;
          }
          
          if (bouncersResult.success && bouncersResult.stdout) {
            const bouncers = JSON.parse(bouncersResult.stdout);
            bouncersCount = bouncers.length;
          }
        } catch (error) {
          console.error('Error parsing metrics data:', error);
        }
        
        summaryEmbed.setDescription(`${branding.emojis.crowdsec} **CrowdSec Security Metrics Summary**`);
        summaryEmbed.addFields({
          name: '🔒 Security Overview',
          value: [
            `${branding.emojis.alert} **Active Decisions:** ${decisionsCount} (blocked IPs/ranges)`,
            `${branding.emojis.healthy} **Connected Bouncers:** ${bouncersCount}`,
            `${branding.emojis.loading} **Full metrics details are attached as a file**`
          ].join('\n'),
          inline: false
        });
        
        // Create a file with the full metrics output
        const metricsContent = result.stdout || 'No metrics data available';
        
        // Send the metrics as a file attachment
        await interaction.editReply({
          embeds: [summaryEmbed],
          files: [{
            attachment: Buffer.from(metricsContent),
            name: `crowdsec-metrics.txt`
          }]
        });
        
        // Also send alerts as a separate file if available
        if (alertsResult.success && alertsResult.stdout && alertsResult.stdout.trim() !== '') {
          const alertsContent = alertsResult.stdout;
          await interaction.followUp({
            content: `**CrowdSec Active Alerts**`,
            files: [{
              attachment: Buffer.from(alertsContent),
              name: `crowdsec-alerts.txt`
            }]
          });
        }

      } else if (subcommand === 'explain') {
        console.log('Executing explain subcommand');
        const log = interaction.options.getString('log');
        const file = interaction.options.getString('file');
        const type = interaction.options.getString('type');
        const failures = interaction.options.getBoolean('failures');
        const onlySuccessfulParsers = interaction.options.getBoolean('only_successful_parsers');

        if (!log && !file) {
          embed.setColor(branding.colors.warning);
          embed.setDescription(`${branding.emojis.warning} You must provide either a log line or file to explain.`);
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        const cmd = ['cscli', 'explain'];
        if (log) cmd.push('-l', log);
        if (file) cmd.push('-f', file);
        if (type) cmd.push('-t', type);
        if (failures) cmd.push('--failures');
        if (onlySuccessfulParsers) cmd.push('--only-successful-parsers');

        embed.setDescription(`${branding.emojis.loading} Analyzing log with CrowdSec explain...`);
        await interaction.editReply({ embeds: [embed] });

        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        if (!result.success) {
          throw new Error(`Failed to explain log: ${result.error || "Unknown error"}`);
        }

        const explainContent = result.stdout || 'No explanation data available';
        
        // Create summary embed
        const explainEmbed = branding.getHeaderEmbed('CrowdSec Log Analysis', 'crowdsec');
        explainEmbed.setDescription(`${branding.emojis.crowdsec} CrowdSec Log Analysis`);
        
        if (log) {
          explainEmbed.addFields({ name: 'Log Line', value: '```\n' + log + '\n```' });
        } else if (file) {
          explainEmbed.addFields({ name: 'Log File', value: file });
        }
        
        explainEmbed.addFields({ 
          name: 'ℹ️ Understanding Log Analysis',
          value: [
            "CrowdSec's explain feature shows how log entries are parsed and matched against security rules.",
            "- **Successful matches** indicate the log was properly recognized by a parser",
            "- **Failed matches** indicate the log format wasn't recognized",
            "Detailed analysis is attached as a file."
          ].join('\n')
        });
        
        // Send the explanation as a file attachment
        await interaction.editReply({
          embeds: [explainEmbed],
          files: [{
            attachment: Buffer.from(explainContent),
            name: `crowdsec-explain.txt`
          }]
        });

      } else if (subcommand === 'capi') {
        console.log('Executing capi subcommand');
        const action = interaction.options.getString('action');
        const cmd = ['cscli', 'capi', action];

        embed.setDescription(`${branding.emojis.loading} Executing Central API action: ${action}...`);
        await interaction.editReply({ embeds: [embed] });

        const result = await dockerManager.executeInContainer('crowdsec', cmd);
        if (!result.success) {
          throw new Error(`Failed to execute CAPI command: ${result.error || "Unknown error"}`);
        }

        const capiContent = result.stdout || 'No output available.';
        
        // Create summary embed
        const capiEmbed = branding.getHeaderEmbed(`CrowdSec Central API - ${action}`, 'crowdsec');
        
        if (action === 'register') {
          capiEmbed.setDescription(`${branding.emojis.healthy} CrowdSec Central API Registration`);
          capiEmbed.addFields({ 
            name: 'ℹ️ About Central API Registration',
            value: "Registering with the CrowdSec Central API allows your instance to contribute to and benefit from the global community threat intelligence. This helps protect your system against known malicious IP addresses identified by other CrowdSec users."
          });
        } else if (action === 'status') {
          capiEmbed.setDescription(`${branding.emojis.healthy} CrowdSec Central API Status`);
          capiEmbed.addFields({ 
            name: 'ℹ️ About Central API Status',
            value: "The status shows your connection to CrowdSec's community threat intelligence. When connected, your instance shares anonymized attack data and receives blocklists of malicious IPs detected by other CrowdSec users worldwide."
          });
        }
        
        // Send the CAPI output as a file attachment
        await interaction.editReply({
          embeds: [capiEmbed],
          files: [{
            attachment: Buffer.from(capiContent),
            name: `crowdsec-capi-${action}.txt`
          }]
        });
      } else {
        throw new Error(`Unknown subcommand: ${subcommand}`);
      }

    } catch (error) {
      console.error('Error executing crowdsecMetrics command:', error);
      const errorEmbed = branding.getHeaderEmbed('Error Executing CrowdSec Command', 'danger');
      errorEmbed.setDescription(`${branding.emojis.error} An error occurred:\n\`\`\`${error.message}\`\`\``);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }
};