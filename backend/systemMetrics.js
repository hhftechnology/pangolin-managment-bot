// backend/systemMetrics.js
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const branding = require('./pangolinBranding');

// Promisify exec
const execPromise = util.promisify(exec);

/**
 * Get current CPU usage information
 */
async function getCpuInfo() {
  try {
    // Read CPU info from /proc/stat
    const data = await fs.readFile('/proc/stat', 'utf8');
    const lines = data.split('\n');
    const cpuLine = lines[0].split(' ').filter(item => item);
    
    // CPU times from /proc/stat (user, nice, system, idle, iowait, irq, softirq)
    const user = parseInt(cpuLine[1]);
    const nice = parseInt(cpuLine[2]);
    const system = parseInt(cpuLine[3]);
    const idle = parseInt(cpuLine[4]);
    const iowait = parseInt(cpuLine[5]);
    const irq = parseInt(cpuLine[6]);
    const softirq = parseInt(cpuLine[7]);
    
    // Calculate total CPU time and non-idle time
    const totalCpuTime = user + nice + system + idle + iowait + irq + softirq;
    const nonIdleCpuTime = user + nice + system + irq + softirq;
    
    // Wait a second for a new sample
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Read CPU info again
    const data2 = await fs.readFile('/proc/stat', 'utf8');
    const lines2 = data2.split('\n');
    const cpuLine2 = lines2[0].split(' ').filter(item => item);
    
    // CPU times from second sample
    const user2 = parseInt(cpuLine2[1]);
    const nice2 = parseInt(cpuLine2[2]);
    const system2 = parseInt(cpuLine2[3]);
    const idle2 = parseInt(cpuLine2[4]);
    const iowait2 = parseInt(cpuLine2[5]);
    const irq2 = parseInt(cpuLine2[6]);
    const softirq2 = parseInt(cpuLine2[7]);
    
    // Calculate total and non-idle time difference
    const totalCpuTime2 = user2 + nice2 + system2 + idle2 + iowait2 + irq2 + softirq2;
    const nonIdleCpuTime2 = user2 + nice2 + system2 + irq2 + softirq2;
    
    const totalDiff = totalCpuTime2 - totalCpuTime;
    const nonIdleDiff = nonIdleCpuTime2 - nonIdleCpuTime;
    
    // Calculate CPU usage percentage
    const cpuUsage = (nonIdleDiff / totalDiff) * 100;
    
    // Get CPU load averages from /proc/loadavg
    const loadAvg = await fs.readFile('/proc/loadavg', 'utf8');
    const loadParts = loadAvg.split(' ');
    
    // Get CPU core count to contextualize load average
    const cpuInfo = await fs.readFile('/proc/cpuinfo', 'utf8');
    const coreCount = cpuInfo.match(/processor/g).length;
    
    return {
      success: true,
      usage: parseFloat(cpuUsage.toFixed(2)),
      loadAvg1: parseFloat(loadParts[0]),
      loadAvg5: parseFloat(loadParts[1]),
      loadAvg15: parseFloat(loadParts[2]),
      cores: coreCount
    };
  } catch (error) {
    console.error(`${branding.consoleHeader} Error getting CPU info:`, error.message);
    
    // Fallback to using the top command
    try {
      const { stdout } = await execPromise("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'");
      const cpuUsage = parseFloat(stdout.trim());
      
      const { stdout: loadAvg } = await execPromise('cat /proc/loadavg');
      const loadParts = loadAvg.split(' ');
      
      const { stdout: cpuInfo } = await execPromise('nproc');
      const coreCount = parseInt(cpuInfo.trim());
      
      return {
        success: true,
        usage: parseFloat(cpuUsage.toFixed(2)),
        loadAvg1: parseFloat(loadParts[0]),
        loadAvg5: parseFloat(loadParts[1]),
        loadAvg15: parseFloat(loadParts[2]),
        cores: coreCount || 1
      };
    } catch (fallbackError) {
      console.error(`${branding.consoleHeader} Fallback error:`, fallbackError.message);
      return {
        success: false,
        error: `${error.message}. Fallback error: ${fallbackError.message}`
      };
    }
  }
}

/**
 * Get memory usage information
 */
async function getMemoryInfo() {
  try {
    // Read memory info from /proc/meminfo
    const data = await fs.readFile('/proc/meminfo', 'utf8');
    const lines = data.split('\n');
    
    // Extract key values
    const memInfo = {};
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const valueString = parts[1].trim();
        // Extract numeric part and convert to MB
        const value = parseInt(valueString.split(' ')[0]) / 1024;
        memInfo[key] = value;
      }
    }
    
    // Calculate usage
    const total = memInfo.MemTotal;
    const free = memInfo.MemFree;
    const buffers = memInfo.Buffers || 0;
    const cached = memInfo.Cached || 0;
    const used = total - free - buffers - cached;
    const usagePercent = (used / total) * 100;
    
    return {
      success: true,
      total: Math.round(total), // MB
      used: Math.round(used), // MB
      free: Math.round(total - used), // MB
      usagePercent: parseFloat(usagePercent.toFixed(2))
    };
  } catch (error) {
    console.error(`${branding.consoleHeader} Error getting memory info:`, error.message);
    
    // Fallback to using the free command
    try {
      const { stdout } = await execPromise("free -m | awk 'NR==2{printf \"%.2f\", $3*100/$2}'");
      const usagePercent = parseFloat(stdout.trim());
      
      const { stdout: memTotal } = await execPromise("free -m | awk 'NR==2{print $2}'");
      const total = parseInt(memTotal.trim());
      
      const { stdout: memUsed } = await execPromise("free -m | awk 'NR==2{print $3}'");
      const used = parseInt(memUsed.trim());
      
      return {
        success: true,
        total,
        used,
        free: total - used,
        usagePercent
      };
    } catch (fallbackError) {
      console.error(`${branding.consoleHeader} Fallback error:`, fallbackError.message);
      return {
        success: false,
        error: `${error.message}. Fallback error: ${fallbackError.message}`
      };
    }
  }
}

/**
 * Get disk usage information
 */
async function getDiskInfo() {
  try {
    // Use df command to get disk usage
    const { stdout } = await execPromise("df -h / | awk 'NR==2{print $2,$3,$4,$5}'");
    const [total, used, free, usagePercent] = stdout.trim().split(' ');
    
    return {
      success: true,
      total,
      used,
      free,
      usagePercent: parseFloat(usagePercent.replace('%', ''))
    };
  } catch (error) {
    console.error(`${branding.consoleHeader} Error getting disk info:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get network bandwidth information
 */
async function getBandwidthInfo() {
  try {
    // Read network stats from /proc/net/dev
    const data = await fs.readFile('/proc/net/dev', 'utf8');
    const lines = data.split('\n').filter(line => line.includes(':'));
    
    // Track total network activity
    let totalRxBytes = 0;
    let totalTxBytes = 0;
    const interfaces = [];
    
    // First snapshot
    const interfaceData = {};
    
    for (const line of lines) {
      const parts = line.trim().split(':');
      if (parts.length >= 2) {
        const interfaceName = parts[0].trim();
        // Skip loopback interface
        if (interfaceName === 'lo') continue;
        
        const values = parts[1].trim().split(/\s+/);
        const rxBytes = parseInt(values[0]);
        const txBytes = parseInt(values[8]);
        
        interfaceData[interfaceName] = { rxBytes, txBytes, timestamp: Date.now() };
        interfaces.push(interfaceName);
      }
    }
    
    // Wait to get a sample of network activity
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Second snapshot
    const result = { interfaces: {} };
    
    // Read network stats again
    const data2 = await fs.readFile('/proc/net/dev', 'utf8');
    const lines2 = data2.split('\n').filter(line => line.includes(':'));
    
    for (const line of lines2) {
      const parts = line.trim().split(':');
      if (parts.length >= 2) {
        const interfaceName = parts[0].trim();
        // Skip loopback interface
        if (interfaceName === 'lo') continue;
        
        const values = parts[1].trim().split(/\s+/);
        const rxBytes = parseInt(values[0]);
        const txBytes = parseInt(values[8]);
        
        if (interfaceData[interfaceName]) {
          const rxDiff = rxBytes - interfaceData[interfaceName].rxBytes;
          const txDiff = txBytes - interfaceData[interfaceName].txBytes;
          const timeDiff = (Date.now() - interfaceData[interfaceName].timestamp) / 1000; // in seconds
          
          // Calculate bandwidth in KB/s
          const rxSpeed = (rxDiff / 1024 / timeDiff).toFixed(2);
          const txSpeed = (txDiff / 1024 / timeDiff).toFixed(2);
          
          result.interfaces[interfaceName] = {
            rxSpeed: parseFloat(rxSpeed), // KB/s
            txSpeed: parseFloat(txSpeed), // KB/s
            rxTotal: formatBytes(rxBytes),
            txTotal: formatBytes(txBytes)
          };
          
          totalRxBytes += rxBytes;
          totalTxBytes += txBytes;
        }
      }
    }
    
    // Add total bandwidth
    result.total = {
      rxTotal: formatBytes(totalRxBytes),
      txTotal: formatBytes(totalTxBytes)
    };
    
    result.success = true;
    return result;
  } catch (error) {
    console.error(`${branding.consoleHeader} Error getting bandwidth info:`, error.message);
    
    // Fallback to using the ifconfig command
    try {
      // First, get a list of interfaces
      const { stdout: ifList } = await execPromise("ls /sys/class/net | grep -v lo");
      const interfaces = ifList.trim().split('\n');
      
      const result = { interfaces: {}, total: { rxTotal: '0 B', txTotal: '0 B' }, success: true };
      let totalRxBytes = 0;
      let totalTxBytes = 0;
      
      // First snapshot
      const interfaceData = {};
      
      for (const iface of interfaces) {
        try {
          const { stdout: rxData } = await execPromise(`cat /sys/class/net/${iface}/statistics/rx_bytes`);
          const { stdout: txData } = await execPromise(`cat /sys/class/net/${iface}/statistics/tx_bytes`);
          
          const rxBytes = parseInt(rxData.trim());
          const txBytes = parseInt(txData.trim());
          
          interfaceData[iface] = { rxBytes, txBytes, timestamp: Date.now() };
        } catch (e) {
          console.error(`Error reading interface ${iface}:`, e.message);
        }
      }
      
      // Wait to get a sample
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Second snapshot
      for (const iface of interfaces) {
        try {
          const { stdout: rxData } = await execPromise(`cat /sys/class/net/${iface}/statistics/rx_bytes`);
          const { stdout: txData } = await execPromise(`cat /sys/class/net/${iface}/statistics/tx_bytes`);
          
          const rxBytes = parseInt(rxData.trim());
          const txBytes = parseInt(txData.trim());
          
          if (interfaceData[iface]) {
            const rxDiff = rxBytes - interfaceData[iface].rxBytes;
            const txDiff = txBytes - interfaceData[iface].txBytes;
            const timeDiff = (Date.now() - interfaceData[iface].timestamp) / 1000; // in seconds
            
            // Calculate bandwidth in KB/s
            const rxSpeed = (rxDiff / 1024 / timeDiff).toFixed(2);
            const txSpeed = (txDiff / 1024 / timeDiff).toFixed(2);
            
            result.interfaces[iface] = {
              rxSpeed: parseFloat(rxSpeed), // KB/s
              txSpeed: parseFloat(txSpeed), // KB/s
              rxTotal: formatBytes(rxBytes),
              txTotal: formatBytes(txBytes)
            };
            
            totalRxBytes += rxBytes;
            totalTxBytes += txBytes;
          }
        } catch (e) {
          console.error(`Error reading interface ${iface}:`, e.message);
        }
      }
      
      // Add total bandwidth
      result.total = {
        rxTotal: formatBytes(totalRxBytes),
        txTotal: formatBytes(totalTxBytes)
      };
      
      return result;
    } catch (fallbackError) {
      console.error(`${branding.consoleHeader} Fallback error:`, fallbackError.message);
      return {
        success: false,
        error: `${error.message}. Fallback error: ${fallbackError.message}`
      };
    }
  }
}

/**
 * Get overall system load - combines CPU, memory, and disk info
 */
async function getSystemLoad() {
  try {
    const [cpuInfo, memoryInfo, diskInfo] = await Promise.all([
      getCpuInfo(),
      getMemoryInfo(),
      getDiskInfo()
    ]);
    
    return {
      success: true,
      cpu: cpuInfo,
      memory: memoryInfo,
      disk: diskInfo
    };
  } catch (error) {
    console.error(`${branding.consoleHeader} Error getting system load:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Helper function to format bytes to a human-readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

module.exports = {
  getCpuInfo,
  getMemoryInfo,
  getDiskInfo,
  getBandwidthInfo,
  getSystemLoad,
  formatBytes
};