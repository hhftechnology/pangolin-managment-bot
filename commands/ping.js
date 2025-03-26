// commands/ping.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Shows bot latency, memory usage, and uptime"),
    async execute(interaction) {
        // Initial reply to measure latency
        const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });
        
        // Calculate latency
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        
        // Calculate API latency
        const apiLatency = Math.round(interaction.client.ws.ping);
        
        // Get RAM usage
        const memoryUsage = process.memoryUsage();
        const ramUsed = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
        const ramTotal = (memoryUsage.rss / 1024 / 1024).toFixed(2);
        
        // Calculate uptime
        const uptime = formatUptime(interaction.client.uptime);
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle('🏓 Pong!')
            .addFields(
                { name: 'Bot Latency', value: `${latency}ms`, inline: true },
                { name: 'API Latency', value: `${apiLatency}ms`, inline: true },
                { name: 'Memory Usage', value: `${ramUsed} MB / ${ramTotal} MB`, inline: true },
                { name: 'Uptime', value: uptime, inline: true }
            )
            .setTimestamp();
        
        // Edit the reply with the embed
        await interaction.editReply({ content: null, embeds: [embed] });
    },
};

// Helper function to format uptime
function formatUptime(uptime) {
    const totalSeconds = Math.floor(uptime / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    
    return parts.join(' ');
}