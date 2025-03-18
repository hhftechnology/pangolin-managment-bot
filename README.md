# Pangolin Discord Bot

A comprehensive Discord bot for remotely monitoring and controlling Docker containers on your VPS server, with specialized support for the Pangolin stack (including Traefik, CrowdSec, and other microservices).

## 📋 Overview

This Discord bot provides a seamless interface to monitor your server's health, manage Docker containers, handle security via CrowdSec, and perform system operations—all through Discord slash commands. It's particularly tailored for the Pangolin self-hosting stack but works with any Docker deployment.

## ✨ Features

- **Docker Management**: Create, start, stop, restart, and remove containers
- **Container Monitoring**: Check status, view logs, get detailed information
- **Image Management**: Pull, list, and remove Docker images
- **System Monitoring**: Track CPU, memory, disk usage, and network bandwidth
- **CrowdSec Integration**: Manage security alerts, decisions, whitelists, and configurations
- **Backup & Restore**: Create and restore backups of your configuration
- **Auto-healing**: Automatically restart unhealthy containers
- **Health Monitoring**: Check the health of your entire stack

## 🏗️ Architecture

The bot is built with Node.js and uses:
- **discord.js**: For Discord API interaction
- **node-docker-api**: For Docker container management
- **dockerode**: Additional Docker functionality
- Backend utilities for system metrics, health monitoring, and more

## 🚀 Installation

### Prerequisites

- Docker installed on your server
- A Discord bot token and application
- A server running the Pangolin stack (or any Docker containers you wish to manage)

### Setup Instructions

1. Clone this composefile:
```yml
services:
  server-bot:
    container_name: server-bot
    image: hhftechnology/pangolin-discord-bot:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./backups:/app/backups
      - /proc:/host/proc:ro  # Read-only access to proc filesystem
      - /sys:/host/sys:ro    # Read-only access to sys filesystem
      - /root:/root  # Mount the Pangolin root directory. all pangolin files have to be here other wise backup and restore function will not work
    environment:
      - DISCORD_TOKEN=MTI5MDjdfposdjvjsdpvjpdsjvpdsjv.ncsabhiu.cihoichasohcsacpos #required
      - DISCORD_CLIENT_ID=11646164184164646 #required
      - DISCORD_GUILD_ID=913641641368909884 #optional
      - BACKUP_DIR=/app/backups
      - HOST_PROC=/host/proc  # Point to the mounted proc directory
      - HOST_SYS=/host/sys    # Point to the mounted sys directory
    restart: unless-stopped
   ```

2. Start the bot:
   ```bash
   docker compose up -d
   ```

## ⚙️ Configuration

### Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to the "Bot" tab and create a bot
4. Enable "Server Members Intent" and "Message Content Intent"
5. Copy the bot token to your `.env` file
6. Generate an invite link with the "bot" and "applications.commands" scopes
7. Invite the bot to your server

### Auto-Restart Configuration

The bot supports automatic restarting of unhealthy containers. Configure containers for auto-restart with:

```
/autorestart enable container:container_name max_attempts:3
```

## 🤖 Available Commands

### Docker Management
- `/dockercreate` - Create a new Docker container
- `/dockerinfo` - Show Docker host information
- `/dockerimages` - List all Docker images
- `/dockerpull` - Pull a Docker image
- `/dockerremove` - Remove a Docker container
- `/dockerremoveimage` - Remove a Docker image
- `/dockershow` - Show detailed container information
- `/startcontainer` - Start a stopped container
- `/stopcontainer` - Stop a running container  
- `/restartcontainer` - Restart a container

### Pangolin Stack
- `/pangolinstatus` - Check overall Pangolin stack status
- `/pangolinlogs` - View logs from Pangolin containers
- `/stackhealth` - Detailed health check of all components
- `/backup` - Create a backup of your configuration
- `/restorebackup` - Restore from a previous backup

### CrowdSec Security
- `/crowdsecalerts` - Manage security alerts
- `/crowdsecbouncers` - Manage enforcement agents
- `/crowdseccollections` - Manage collections of scenarios
- `/crowdsecconfig` - Configure CrowdSec
- `/crowdsecdecisions` - Manage security decisions (bans, captchas)
- `/crowdsechelp` - Show help for CrowdSec commands
- `/crowdsecmachines` - Manage CrowdSec machines
- `/crowdsecmetrics` - View security metrics
- `/crowdsecparsers` - Manage log parsers
- `/crowdsecrestart` - Restart CrowdSec service
- `/crowdsecscenarios` - Manage detection scenarios
- `/crowdsecstatus` - Show CrowdSec security status
- `/crowdsecwhitelist` - Manage IP whitelists

### System Monitoring
- `/vpsload` - Check CPU, memory, and disk usage
- `/vpsbandwidth` - Monitor network usage

### Utility
- `/ping` - Check if the bot is running
- `/allcontainers` - List all containers with status

## 📊 Health Monitoring

The bot includes a health monitoring system that can:

1. Automatically check container health at regular intervals
2. Restart unhealthy containers within configurable limits
3. Send alerts to a designated Discord channel
4. Provide insights into system resource usage

Configure auto-healing with the `/autorestart` command to keep your services running smoothly.

## 🛡️ CrowdSec Integration

The bot offers comprehensive control over CrowdSec security including:

- Managing security decisions (bans, captchas, whitelists)
- Viewing and responding to alerts
- Configuring detection scenarios
- Managing enforcers (bouncers)
- Monitoring security metrics

Use the `/crowdsechelp` command to see all available security commands.

## 🔧 Development

### Adding New Commands

1. Create a new file in the `commands/` directory
2. Export an object with `data` (SlashCommandBuilder) and `execute` function
3. Redeploy commands with `node deployCommands.js`

### Directory Structure

```
pangolin-discord-bot/
├── commands/           # Discord slash commands
├── backend/            # Backend utilities and services
│   ├── dockerManager.js   # Docker interaction
│   ├── systemMetrics.js   # System monitoring
│   ├── backupManager.js   # Backup functionality
│   └── pangolinBranding.js # UI styling
├── index.js            # Main bot entry point
├── deployCommands.js   # Command deployment utility
└── package.json        # Dependencies and scripts
```


## 🛟 Support

For issues, questions, or contributions, please open an issue on por forums https://forum.hhf.technology/t/pangolin-discord-bot-to-manage-the-stack/.

---

Built with ❤️ by HHF Technology for Pangolin self-hosters
